import type { HeroClassId } from '../constants/classes.ts';
import type { OverworldZoneId } from '../constants/zones.ts';

export interface CharacterAttributes {
  strength: number;
  vitality: number;
  dexterity: number;
  intelligence: number;
  faith: number;
}

export interface EquippedArmament {
  weaponId: string | null;
  vestmentId: string | null;
}

/**
 * Shared permanent character identity contract mirrored from Beyond: Dungeons
 * (DD-002, ARCHITECTURE.md Section 12, REFERENCE_AUDIT.md Section 5.3).
 */
export interface CharacterIdentity {
  accountId: string;
  characterId: string;
  username: string;
  heroClass: HeroClassId;
  level: number;
  xp: number;
  attributes: CharacterAttributes;
  attributePoints: number;
  equippedArmament: EquippedArmament;
  permanentUnlocks: string[];
  arenaHonor: number;
  isAdmin?: boolean;
}

export interface WorldRegionRect {
  id: string;
  zone: OverworldZoneId;
  label: string;
  x: number; // tile coordinate
  y: number; // tile coordinate
  w: number; // tile width
  h: number; // tile height
}

/**
 * World map structure compatible with shared/movement/playerMovement.ts
 * (0 = solid wall/void, 1+ = traversable terrain).
 */
export interface WorldMapData {
  mapId: string;
  title: string;
  isDevelopmentStub: boolean;
  width: number;
  height: number;
  tiles: number[];
  zoneGrid: OverworldZoneId[];
  regions: WorldRegionRect[];
  spawnPoint: { x: number; y: number };
}

export interface OverworldInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  aimAngle: number;
  stickX?: number;
  stickY?: number;
}

export interface OverworldPlayerState {
  id: string;
  characterId: string;
  username: string;
  heroClass: HeroClassId;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  shield: number;
  zone: OverworldZoneId;
  inCombat: boolean;
  combatLockRemainingMs: number;
  weaponId: string | null;
  vestmentId: string | null;
  activeTacticalSkillId: string | null;
  tacticalCooldownsMs: Record<string, number>;
  attackAnimMs: number;
  hasteMs: number;
  dexterity: number;
  arenaHonor: number;
  connected: boolean;
  lastInputSeq?: number;
}

export interface OverworldChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface FloatingCallout {
  id: string;
  kind: 'info' | 'blocked' | 'zone' | 'cooldown';
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface ActivityModuleStatus {
  id: 'arena' | 'survival' | 'public_events';
  name: string;
  status: 'awaiting_design_approval';
  participantsInZone: number;
  summary: string;
}

export interface WorldInstanceSummary {
  instanceId: string;
  name: string;
  regionLabel: string;
  playerCount: number;
  maxPlayers: number;
  status: 'online' | 'full';
}

export interface OverworldSnapshot {
  protocolVersion: number;
  instanceId: string;
  instanceName: string;
  serverTimeMs: number;
  tickSeq: number;
  players: OverworldPlayerState[];
  events: FloatingCallout[];
  activities: ActivityModuleStatus[];
}
