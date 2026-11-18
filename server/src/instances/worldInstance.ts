import { randomUUID } from 'node:crypto';
import {
  HERO_CLASSES,
  type ArmamentSlot,
} from '../../../shared/constants/classes.ts';
import {
  OVERWORLD_INSTANCE_CAPACITY,
  OVERWORLD_ZONES,
  PROTOCOL_VERSION,
} from '../../../shared/constants/zones.ts';
import {
  getZoneAtWorld,
  moveWithCollision,
} from '../../../shared/movement/playerMovement.ts';
import type {
  CharacterIdentity,
  FloatingCallout,
  OverworldChatMessage,
  OverworldInputState,
  OverworldPlayerState,
  OverworldSnapshot,
  WorldInstanceSummary,
  WorldMapData,
} from '../../../shared/types/domain.ts';
import { ArenaModule } from '../arena/arenaModule.ts';
import type { CharacterIntegrationLayer } from '../characters/characterIntegrationAdapter.ts';
import { CooldownTracker } from '../combat/cooldownTracker.ts';
import { PublicEventsModule } from '../events/publicEventsModule.ts';
import { MovementValidator } from '../movement/movementValidator.ts';
import { PvpRuleService } from '../pvp/pvpRuleService.ts';
import { SurvivalModule } from '../survival/survivalModule.ts';
import { createFoundationWorldMap } from '../world/worldMap.ts';

const DISCONNECT_GRACE_MS = 15_000;
const MAX_CHAT_HISTORY = 60;

interface ServerPlayerRuntime {
  accountId: string;
  state: OverworldPlayerState;
  latestInput: OverworldInputState;
  disconnectGraceRemainingMs: number;
}

const IDLE_INPUT: OverworldInputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  attack: false,
  aimAngle: 0,
  stickX: 0,
  stickY: 0,
};

export interface JoinInstanceResult {
  ok: boolean;
  player?: OverworldPlayerState;
  reconnected?: boolean;
  error?: string;
}

export interface ActionFeedback {
  ok: boolean;
  code?: string;
  message?: string;
  updatedCharacter?: CharacterIdentity;
}

export class WorldInstance {
  readonly instanceId: string;
  readonly name: string;
  readonly regionLabel: string;
  readonly maxPlayers: number;
  readonly map: WorldMapData;

  private readonly playersById = new Map<string, ServerPlayerRuntime>();
  private readonly playerIdByCharacterId = new Map<string, string>();
  private readonly chatHistory: OverworldChatMessage[] = [];
  private pendingCallouts: FloatingCallout[] = [];
  private tickSeq = 0;

  private readonly movementValidator = new MovementValidator();
  private readonly cooldownTracker = new CooldownTracker();
  private readonly pvpRuleService = new PvpRuleService();
  private readonly arenaModule = new ArenaModule();
  private readonly survivalModule = new SurvivalModule();
  private readonly publicEventsModule = new PublicEventsModule();

  constructor(options: {
    instanceId: string;
    name: string;
    regionLabel?: string;
    maxPlayers?: number;
    map?: WorldMapData;
  }) {
    this.instanceId = options.instanceId;
    this.name = options.name;
    this.regionLabel = options.regionLabel ?? 'Global Overworld';
    this.maxPlayers = options.maxPlayers ?? OVERWORLD_INSTANCE_CAPACITY;
    this.map = options.map ?? createFoundationWorldMap();

    this.pushSystemChat(
      `Welcome to ${this.name} (${this.instanceId}). Player attacks are disabled inside Safe Zones.`
    );
  }

  getSummary(): WorldInstanceSummary {
    const count = this.getPlayerCount();
    return {
      instanceId: this.instanceId,
      name: this.name,
      regionLabel: this.regionLabel,
      playerCount: count,
      maxPlayers: this.maxPlayers,
      status: count >= this.maxPlayers ? 'full' : 'online',
    };
  }

  getPlayerCount(): number {
    return this.playersById.size;
  }

  getConnectedCount(): number {
    let count = 0;
    for (const p of this.playersById.values()) {
      if (p.state.connected) count++;
    }
    return count;
  }

  getChatHistory(): OverworldChatMessage[] {
    return [...this.chatHistory];
  }

  getPlayerState(playerId: string): OverworldPlayerState | null {
    return this.playersById.get(playerId)?.state ?? null;
  }

  addOrReconnectPlayer(identity: CharacterIdentity): JoinInstanceResult {
    const existingId = this.playerIdByCharacterId.get(identity.characterId);
    if (existingId) {
      const existing = this.playersById.get(existingId);
      if (existing) {
        existing.state.connected = true;
        existing.state.arenaHonor = identity.arenaHonor;
        existing.disconnectGraceRemainingMs = 0;
        existing.latestInput = { ...IDLE_INPUT };
        return { ok: true, player: existing.state, reconnected: true };
      }
    }

    if (this.playersById.size >= this.maxPlayers) {
      return {
        ok: false,
        error: `Instance "${this.name}" is full (${this.maxPlayers}/${this.maxPlayers}).`,
      };
    }

    const playerId = identity.characterId;
    const classDef = HERO_CLASSES[identity.heroClass];
    const spawnOffsetAngle = (this.playersById.size * 2.39996) % (Math.PI * 2);
    const spawnRadius = Math.min(56, this.playersById.size * 4);
    const pos = {
      x: this.map.spawnPoint.x,
      y: this.map.spawnPoint.y,
    };
    if (spawnRadius > 0) {
      moveWithCollision(
        this.map,
        pos,
        Math.cos(spawnOffsetAngle) * spawnRadius,
        Math.sin(spawnOffsetAngle) * spawnRadius
      );
    }

    const skillInfo = this.cooldownTracker.resolveActiveTacticalSkill(
      identity.heroClass,
      identity.equippedArmament.weaponId
    );

    const state: OverworldPlayerState = {
      id: playerId,
      characterId: identity.characterId,
      username: identity.username,
      heroClass: identity.heroClass,
      level: identity.level,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: classDef.maxHp + identity.attributes.vitality * 12,
      maxHp: classDef.maxHp + identity.attributes.vitality * 12,
      shield: 0,
      zone: getZoneAtWorld(this.map, pos.x, pos.y),
      inCombat: false,
      combatLockRemainingMs: 0,
      weaponId: identity.equippedArmament.weaponId,
      vestmentId: identity.equippedArmament.vestmentId,
      activeTacticalSkillId: skillInfo.skillId,
      tacticalCooldownsMs: {},
      attackAnimMs: 0,
      hasteMs: 0,
      dexterity: identity.attributes.dexterity,
      arenaHonor: identity.arenaHonor,
      connected: true,
      lastInputSeq: 0,
    };

    this.playersById.set(playerId, {
      accountId: identity.accountId,
      state,
      latestInput: { ...IDLE_INPUT },
      disconnectGraceRemainingMs: 0,
    });
    this.playerIdByCharacterId.set(identity.characterId, playerId);

    this.pushCallout('info', state.x, state.y - 24, `${state.username} arrived`, '#E2E8F0');
    return { ok: true, player: state, reconnected: false };
  }

  markDisconnected(playerId: string, graceMs: number = DISCONNECT_GRACE_MS): void {
    const runtime = this.playersById.get(playerId);
    if (!runtime) return;
    runtime.state.connected = false;
    runtime.state.vx = 0;
    runtime.state.vy = 0;
    runtime.latestInput = { ...IDLE_INPUT };
    runtime.disconnectGraceRemainingMs = Math.max(0, graceMs);
  }

  removePlayerImmediately(playerId: string): void {
    const runtime = this.playersById.get(playerId);
    if (!runtime) return;
    this.playerIdByCharacterId.delete(runtime.state.characterId);
    this.playersById.delete(playerId);
  }

  setPlayerInput(playerId: string, input: OverworldInputState, seq?: number): void {
    const runtime = this.playersById.get(playerId);
    if (!runtime || !runtime.state.connected) return;
    runtime.latestInput = input;
    if (typeof seq === 'number' && seq > (runtime.state.lastInputSeq ?? 0)) {
      runtime.state.lastInputSeq = seq;
    }
  }

  handleAttackProbe(
    playerId: string,
    kind: 'basic' | 'tactical',
    aimAngle: number
  ): ActionFeedback {
    const runtime = this.playersById.get(playerId);
    if (!runtime) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found in instance.' };
    }

    const player = runtime.state;
    player.aimAngle = Number.isFinite(aimAngle) ? aimAngle : player.aimAngle;

    const evaluation = this.pvpRuleService.evaluateCombatProbe(
      player,
      this.map,
      kind,
      this.cooldownTracker
    );

    if (!evaluation.allowed) {
      this.pushCallout(
        evaluation.code === 'SAFE_ZONE_PROTECTED' ? 'blocked' : 'cooldown',
        player.x,
        player.y - 28,
        evaluation.code === 'SAFE_ZONE_PROTECTED'
          ? 'Safe Zone: Attacks Disabled'
          : 'Cooldown / Unavailable',
        '#F87171'
      );
      return {
        ok: false,
        code: evaluation.code,
        message: evaluation.reason,
      };
    }

    player.attackAnimMs = 260;
    player.combatLockRemainingMs = Math.max(
      player.combatLockRemainingMs,
      evaluation.combatLockMs ?? 5000
    );
    player.inCombat = true;

    this.pushCallout(
      'info',
      player.x,
      player.y - 28,
      kind === 'tactical' ? 'Tactical Skill Ready Probe' : 'Attack Probe (Combat Locked)',
      '#FBBF24'
    );

    return { ok: true };
  }

  async handleEquipArmament(
    playerId: string,
    slot: ArmamentSlot,
    itemId: string | null,
    characterAdapter: CharacterIntegrationLayer
  ): Promise<ActionFeedback> {
    const runtime = this.playersById.get(playerId);
    if (!runtime) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found in instance.' };
    }

    const player = runtime.state;
    const validation = this.pvpRuleService.validateArmamentSwitch(
      player,
      this.map,
      slot,
      itemId
    );
    if (!validation.allowed) {
      this.pushCallout(
        'blocked',
        player.x,
        player.y - 28,
        validation.code === 'IN_ACTIVE_COMBAT'
          ? 'In Combat: Armament Locked'
          : 'Safe Zone Required',
        '#F87171'
      );
      return {
        ok: false,
        code: validation.code,
        message: validation.reason,
      };
    }

    const update = await characterAdapter.updateEquippedArmament({
      accountId: runtime.accountId,
      slot,
      itemId,
    });
    if (!update.ok || !update.character) {
      return {
        ok: false,
        code: 'ADAPTER_ERROR',
        message: update.error ?? 'Failed to update shared Armament.',
      };
    }

    if (slot === 'weapon') {
      player.weaponId = itemId;
      // Resolve updated tactical skill without touching tacticalCooldownsMs (DD-019, DD-020)
      player.activeTacticalSkillId = this.cooldownTracker.resolveActiveTacticalSkill(
        player.heroClass,
        itemId
      ).skillId;
    } else {
      player.vestmentId = itemId;
    }

    this.pushCallout(
      'info',
      player.x,
      player.y - 28,
      itemId ? `Equipped ${slot}` : `Unequipped ${slot}`,
      '#34D399'
    );

    return { ok: true, updatedCharacter: update.character };
  }

  addChatMessage(playerId: string, text: string): OverworldChatMessage | null {
    const runtime = this.playersById.get(playerId);
    if (!runtime) return null;
    const msg: OverworldChatMessage = {
      id: randomUUID(),
      sender: runtime.state.username,
      text: text.trim().slice(0, 240),
      timestamp: Date.now(),
    };
    this.chatHistory.push(msg);
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory.shift();
    }
    return msg;
  }

  step(dtMs: number): void {
    const toEvict: string[] = [];

    for (const [playerId, runtime] of this.playersById) {
      const s = runtime.state;

      if (!s.connected) {
        runtime.disconnectGraceRemainingMs -= dtMs;
        if (runtime.disconnectGraceRemainingMs <= 0) {
          toEvict.push(playerId);
          continue;
        }
      } else {
        const { previousZone, nextZone } = this.movementValidator.stepPlayer(
          s,
          runtime.latestInput,
          this.map,
          dtMs
        );
        if (previousZone !== nextZone) {
          const meta = OVERWORLD_ZONES[nextZone];
          this.pushCallout('zone', s.x, s.y - 30, meta.label, meta.accentColor);
        }
      }

      // Independent tactical cooldowns continue ticking even while unequipped or during grace (DD-020)
      this.cooldownTracker.tickCooldowns(s.tacticalCooldownsMs, dtMs);

      if (s.attackAnimMs > 0) {
        s.attackAnimMs = Math.max(0, s.attackAnimMs - dtMs);
      }
      if (s.hasteMs > 0) {
        s.hasteMs = Math.max(0, s.hasteMs - dtMs);
      }
      if (s.combatLockRemainingMs > 0) {
        s.combatLockRemainingMs = Math.max(0, s.combatLockRemainingMs - dtMs);
        s.inCombat = s.combatLockRemainingMs > 0;
      } else {
        s.inCombat = false;
      }
    }

    for (const playerId of toEvict) {
      this.removePlayerImmediately(playerId);
    }

    this.tickSeq += 1;
  }

  toSnapshot(consumeEvents = true): OverworldSnapshot {
    const players: OverworldPlayerState[] = [];
    for (const runtime of this.playersById.values()) {
      players.push({
        ...runtime.state,
        tacticalCooldownsMs: { ...runtime.state.tacticalCooldownsMs },
      });
    }

    const events = consumeEvents ? this.pendingCallouts : [...this.pendingCallouts];
    if (consumeEvents) {
      this.pendingCallouts = [];
    }

    return {
      protocolVersion: PROTOCOL_VERSION,
      instanceId: this.instanceId,
      instanceName: this.name,
      serverTimeMs: Date.now(),
      tickSeq: this.tickSeq,
      players,
      events,
      activities: [
        this.arenaModule.getStatus(players),
        this.survivalModule.getStatus(players),
        this.publicEventsModule.getStatus(players),
      ],
    };
  }

  private pushSystemChat(text: string): void {
    this.chatHistory.push({
      id: randomUUID(),
      sender: 'Overworld',
      text,
      timestamp: Date.now(),
      system: true,
    });
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory.shift();
    }
  }

  private pushCallout(
    kind: FloatingCallout['kind'],
    x: number,
    y: number,
    text: string,
    color: string
  ): void {
    if (this.pendingCallouts.length >= 24) {
      this.pendingCallouts.shift();
    }
    this.pendingCallouts.push({
      id: randomUUID(),
      kind,
      x: Math.round(x),
      y: Math.round(y),
      text,
      color,
    });
  }
}
