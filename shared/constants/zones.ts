export type OverworldZoneId = 'safe' | 'open_world' | 'arena' | 'survival';

export const OVERWORLD_INSTANCE_CAPACITY = 100; // DD-007 target capacity per shared instance
export const SERVER_TICK_MS = 25; // 40 Hz authoritative simulation loop
export const PROTOCOL_VERSION = 1;

export interface ZoneMeta {
  id: OverworldZoneId;
  label: string;
  pvpAllowed: boolean;
  armamentSwitchAllowed: boolean;
  accentColor: string;
  description: string;
}

export const OVERWORLD_ZONES: Record<OverworldZoneId, ZoneMeta> = {
  safe: {
    id: 'safe',
    label: 'Safe Zone',
    pvpAllowed: false,
    armamentSwitchAllowed: true,
    accentColor: '#34D399',
    description: 'Player attacks are disabled. Socialize, prepare, and switch Armaments outside active combat.',
  },
  open_world: {
    id: 'open_world',
    label: 'Open World',
    pvpAllowed: true,
    armamentSwitchAllowed: false,
    accentColor: '#F59E0B',
    description: 'Player combat is permitted outside safe zones (PvP formulas pending design approval).',
  },
  arena: {
    id: 'arena',
    label: 'Arena',
    pvpAllowed: true,
    armamentSwitchAllowed: false,
    accentColor: '#EF4444',
    description: 'Competitive PvP zone awarding Arena Honor separately from EXP (rules pending approval).',
  },
  survival: {
    id: 'survival',
    label: 'Survival Grounds',
    pvpAllowed: true,
    armamentSwitchAllowed: false,
    accentColor: '#A855F7',
    description: 'PvPvE activity grounds combining environmental threats and player combat (rules pending approval).',
  },
};
