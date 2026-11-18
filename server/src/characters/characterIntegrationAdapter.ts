import { randomUUID } from 'node:crypto';
import {
  BASE_ARMAMENTS,
  getDefaultVestmentId,
  getDefaultWeaponId,
  type ArmamentSlot,
  type HeroClassId,
} from '../../../shared/constants/classes.ts';
import type { CharacterIdentity } from '../../../shared/types/domain.ts';

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
 */
export interface CharacterIntegrationLayer {
  getCharacterByAccountId(accountId: string): Promise<CharacterIdentity | null>;
  createCharacterForAccount(params: {
    accountId: string;
    username: string;
    heroClass: HeroClassId;
  }): Promise<CharacterIdentity>;
  updateEquippedArmament(params: {
    accountId: string;
    slot: ArmamentSlot;
    itemId: string | null;
  }): Promise<ArmamentUpdateResult>;
  addArenaHonor(accountId: string, delta: number): Promise<CharacterIdentity | null>;
}

/**
 * Local development adapter simulating the future Beyond Universe shared character API.
 * Enforces exact Beyond: Dungeons class/level/attribute/Armament schemas (DD-014..DD-015).
 */
export class DevCharacterAdapter implements CharacterIntegrationLayer {
  private readonly charactersByAccount = new Map<string, CharacterIdentity>();

  async getCharacterByAccountId(accountId: string): Promise<CharacterIdentity | null> {
    const existing = this.charactersByAccount.get(accountId);
    return existing ? structuredClone(existing) : null;
  }

  async createCharacterForAccount(params: {
    accountId: string;
    username: string;
    heroClass: HeroClassId;
  }): Promise<CharacterIdentity> {
    const existing = this.charactersByAccount.get(params.accountId);
    if (existing) return structuredClone(existing);

    const created: CharacterIdentity = {
      accountId: params.accountId,
      characterId: `char_${randomUUID()}`,
      username: params.username,
      heroClass: params.heroClass,
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
        weaponId: getDefaultWeaponId(params.heroClass),
        vestmentId: getDefaultVestmentId(params.heroClass),
      },
      permanentUnlocks: [],
      arenaHonor: 0,
    };

    this.charactersByAccount.set(params.accountId, created);
    return structuredClone(created);
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
        return { ok: false, error: `Item "${def.name}" cannot be equipped in the ${params.slot} slot.` };
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

    return { ok: true, character: structuredClone(character) };
  }

  async addArenaHonor(accountId: string, delta: number): Promise<CharacterIdentity | null> {
    const character = this.charactersByAccount.get(accountId);
    if (!character) return null;
    character.arenaHonor = Math.max(0, character.arenaHonor + Math.trunc(delta));
    return structuredClone(character);
  }
}
