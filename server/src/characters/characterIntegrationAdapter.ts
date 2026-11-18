import { randomUUID } from 'node:crypto';
import {
  BASE_ARMAMENTS,
  getDefaultVestmentId,
  getDefaultWeaponId,
  type ArmamentSlot,
  type HeroClassId,
} from '../../../shared/constants/classes.ts';
import type {
  CharacterIdentity,
  IdentityProviderKind,
  SharedAccountIdentity,
} from '../../../shared/types/domain.ts';
import {
  getOverworldCharacterLink,
  updateOverworldCharacterArmament,
  updateOverworldCharacterHonor,
  upsertOverworldCharacterLink,
} from '../persistence/database.ts';

export interface ArmamentUpdateResult {
  ok: boolean;
  character?: CharacterIdentity;
  error?: string;
}

/**
 * Abstract boundary between Beyond: Overworld and the shared Beyond Universe
 * character service (ARCHITECTURE.md Section 12, DD-002, DD-027).
 *
 * Beyond: Overworld must NEVER maintain a competing permanent progression database.
 * Overworld-only progression (such as Arena Honor and persistent character_id linking)
 * is stored in `overworld_character_links` and preserved across authoritative syncs.
 */
export interface CharacterIntegrationLayer {
  getCharacterByAccountId(accountId: string): Promise<CharacterIdentity | null>;
  createCharacterForAccount(params: {
    accountId: string;
    username: string;
    heroClass: HeroClassId;
    preferredClass?: HeroClassId;
    lockedClass?: HeroClassId;
    isAdmin?: boolean;
  }): Promise<CharacterIdentity>;
  syncAuthoritativeIdentity(
    identity: SharedAccountIdentity,
    provider?: IdentityProviderKind
  ): Promise<CharacterIdentity>;
  updateEquippedArmament(params: {
    accountId: string;
    slot: ArmamentSlot;
    itemId: string | null;
  }): Promise<ArmamentUpdateResult>;
  addArenaHonor(accountId: string, delta: number): Promise<CharacterIdentity | null>;
}

function isCompatibleArmamentItem(
  itemId: string | null | undefined,
  slot: ArmamentSlot,
  heroClass: HeroClassId
): itemId is string {
  if (!itemId) return false;
  const def = BASE_ARMAMENTS[itemId];
  return Boolean(def && def.slot === slot && def.compatibleClasses.includes(heroClass));
}

/**
 * Shared Character Integration Adapter enforcing Beyond: Dungeons class/level/attribute/Armament
 * schemas (DD-014..DD-015) while persisting account-to-character links and Overworld Honor
 * via `overworld_character_links` without duplicating or overwriting permanent Dungeons progression.
 */
export class DevCharacterAdapter implements CharacterIntegrationLayer {
  private readonly charactersByAccount = new Map<string, CharacterIdentity>();

  constructor(private readonly options?: { persistLinks?: boolean }) {}

  private get shouldPersistLinks(): boolean {
    return this.options?.persistLinks !== false;
  }

  async getCharacterByAccountId(accountId: string): Promise<CharacterIdentity | null> {
    const existing = this.charactersByAccount.get(accountId);
    if (!existing) return null;

    if (this.shouldPersistLinks) {
      const link = await getOverworldCharacterLink(accountId);
      if (link) {
        existing.characterId = link.characterId;
        existing.arenaHonor = Math.max(existing.arenaHonor, link.arenaHonor);
      }
    }

    return structuredClone(existing);
  }

  async createCharacterForAccount(params: {
    accountId: string;
    username: string;
    heroClass: HeroClassId;
    preferredClass?: HeroClassId;
    lockedClass?: HeroClassId;
    isAdmin?: boolean;
  }): Promise<CharacterIdentity> {
    const existing = this.charactersByAccount.get(params.accountId);
    if (existing) return structuredClone(existing);

    const lockedClass = params.lockedClass ?? params.heroClass;
    const preferredClass = params.preferredClass ?? params.heroClass;
    const persistedLink = this.shouldPersistLinks
      ? await getOverworldCharacterLink(params.accountId)
      : null;

    const characterId = persistedLink?.characterId ?? `char_${randomUUID()}`;
    const arenaHonor = persistedLink?.arenaHonor ?? 0;

    const weaponId =
      persistedLink &&
      (persistedLink.equippedWeaponId === null ||
        isCompatibleArmamentItem(persistedLink.equippedWeaponId, 'weapon', lockedClass))
        ? persistedLink.equippedWeaponId
        : getDefaultWeaponId(lockedClass);

    const vestmentId =
      persistedLink &&
      (persistedLink.equippedVestmentId === null ||
        isCompatibleArmamentItem(persistedLink.equippedVestmentId, 'vestment', lockedClass))
        ? persistedLink.equippedVestmentId
        : getDefaultVestmentId(lockedClass);

    if (this.shouldPersistLinks) {
      await upsertOverworldCharacterLink({
        accountId: params.accountId,
        characterId,
        identityProvider: 'local_dev',
        arenaHonor,
        equippedWeaponId: weaponId,
        equippedVestmentId: vestmentId,
        lastKnownUsername: params.username,
      });
    }

    const created: CharacterIdentity = {
      accountId: params.accountId,
      characterId,
      username: params.username,
      heroClass: lockedClass,
      preferredClass,
      lockedClass,
      level: 1,
      xp: 0,
      attributes: {
        strength: 0,
        vitality: 0,
        dexterity: 0,
        intelligence: 0,
        faith: 0,
      },
      attributePoints: 0,
      equippedArmament: {
        weaponId,
        vestmentId,
      },
      permanentUnlocks: [],
      arenaHonor,
      isAdmin: params.isAdmin === true,
    };

    this.charactersByAccount.set(params.accountId, created);
    return structuredClone(created);
  }

  /**
   * Synchronizes authoritative Dungeons / provider fields keyed by accountId while
   * preserving existing Overworld-owned progression (persistent characterId, Arena Honor,
   * and compatible Overworld Armament selections).
   */
  async syncAuthoritativeIdentity(
    identity: SharedAccountIdentity,
    provider: IdentityProviderKind = 'dungeons'
  ): Promise<CharacterIdentity> {
    const existing = this.charactersByAccount.get(identity.accountId);
    const persistedLink = this.shouldPersistLinks
      ? await getOverworldCharacterLink(identity.accountId)
      : null;

    const resolvedClass = identity.lockedClass ?? identity.preferredClass;
    const defaultWeapon = getDefaultWeaponId(resolvedClass);
    const defaultVestment = getDefaultVestmentId(resolvedClass);

    const preservedWeapon =
      persistedLink &&
      (persistedLink.equippedWeaponId === null ||
        isCompatibleArmamentItem(persistedLink.equippedWeaponId, 'weapon', resolvedClass))
        ? persistedLink.equippedWeaponId
        : existing &&
            (existing.equippedArmament.weaponId === null ||
              isCompatibleArmamentItem(
                existing.equippedArmament.weaponId,
                'weapon',
                resolvedClass
              ))
          ? existing.equippedArmament.weaponId
          : defaultWeapon;

    const preservedVestment =
      persistedLink &&
      (persistedLink.equippedVestmentId === null ||
        isCompatibleArmamentItem(persistedLink.equippedVestmentId, 'vestment', resolvedClass))
        ? persistedLink.equippedVestmentId
        : existing &&
            (existing.equippedArmament.vestmentId === null ||
              isCompatibleArmamentItem(
                existing.equippedArmament.vestmentId,
                'vestment',
                resolvedClass
              ))
          ? existing.equippedArmament.vestmentId
          : defaultVestment;

    const preservedCharacterId =
      persistedLink?.characterId ??
      existing?.characterId ??
      identity.characterId ??
      `char_${randomUUID()}`;

    // Preserve existing Overworld Arena Honor across authoritative Dungeons re-syncs
    const preservedHonor = Math.max(
      0,
      persistedLink?.arenaHonor ?? 0,
      existing?.arenaHonor ?? 0,
      !persistedLink && !existing ? (identity.arenaHonor ?? 0) : 0
    );

    const linkResult = this.shouldPersistLinks
      ? await upsertOverworldCharacterLink({
          accountId: identity.accountId,
          characterId: preservedCharacterId,
          identityProvider: provider,
          arenaHonor: preservedHonor,
          equippedWeaponId:
            identity.equippedArmament?.weaponId ?? preservedWeapon,
          equippedVestmentId:
            identity.equippedArmament?.vestmentId ?? preservedVestment,
          lastKnownUsername: identity.username,
        })
      : null;

    const finalCharacterId = linkResult?.characterId ?? preservedCharacterId;
    const finalHonor = linkResult?.arenaHonor ?? preservedHonor;
    const finalArmament = identity.equippedArmament
      ? identity.equippedArmament
      : {
          weaponId: linkResult ? linkResult.equippedWeaponId : preservedWeapon,
          vestmentId: linkResult ? linkResult.equippedVestmentId : preservedVestment,
        };

    const synced: CharacterIdentity = {
      accountId: identity.accountId,
      characterId: finalCharacterId,
      username: identity.username,
      heroClass: resolvedClass,
      preferredClass: identity.preferredClass,
      lockedClass: identity.lockedClass,
      level: identity.level,
      xp: identity.xp,
      attributes: {
        strength: identity.strength,
        vitality: identity.vitality,
        dexterity: identity.dexterity,
        intelligence: identity.intelligence,
        faith: identity.faith,
      },
      attributePoints: identity.attributePoints,
      equippedArmament: finalArmament,
      permanentUnlocks:
        identity.permanentUnlocks ?? existing?.permanentUnlocks ?? [],
      arenaHonor: finalHonor,
      isAdmin: identity.isAdmin === true,
    };

    this.charactersByAccount.set(identity.accountId, synced);
    return structuredClone(synced);
  }

  async updateEquippedArmament(params: {
    accountId: string;
    slot: ArmamentSlot;
    itemId: string | null;
  }): Promise<ArmamentUpdateResult> {
    const character = this.charactersByAccount.get(params.accountId);
    if (!character) {
      return { ok: false, error: 'Character identity not found.' };
    }

    if (params.itemId !== null) {
      const def = BASE_ARMAMENTS[params.itemId];
      if (!def) {
        return { ok: false, error: `Unknown Armament item "${params.itemId}".` };
      }
      if (def.slot !== params.slot) {
        return {
          ok: false,
          error: `Item "${def.name}" cannot be equipped in the ${params.slot} slot.`,
        };
      }
      if (!def.compatibleClasses.includes(character.heroClass)) {
        return {
          ok: false,
          error: `${def.name} is incompatible with class "${character.heroClass}" (DD-015).`,
        };
      }
    }

    if (params.slot === 'weapon') {
      character.equippedArmament.weaponId = params.itemId;
    } else {
      character.equippedArmament.vestmentId = params.itemId;
    }

    if (this.shouldPersistLinks) {
      await updateOverworldCharacterArmament(
        params.accountId,
        params.slot,
        params.itemId
      );
    }

    return { ok: true, character: structuredClone(character) };
  }

  async addArenaHonor(accountId: string, delta: number): Promise<CharacterIdentity | null> {
    const character = this.charactersByAccount.get(accountId);
    if (!character) return null;
    const nextBalance = Math.max(0, character.arenaHonor + Math.trunc(delta));
    character.arenaHonor = nextBalance;

    if (this.shouldPersistLinks) {
      await updateOverworldCharacterHonor(accountId, nextBalance);
    }

    return structuredClone(character);
  }
}
