export type HeroClassId = 'vanguard' | 'ranger' | 'arcanist' | 'cleric';

export const MAX_LEVEL = 50;
export const MAX_ATTRIBUTE = 100;
export const TILE_SIZE = 32;
export const PLAYER_COLLISION_RADIUS = 9;

export interface HeroClassStats {
  survivability: number;
  damage: number;
  range: number;
  mobility: number;
  utility: number;
}

export interface CombatResistances {
  physical: number;
  fire: number;
  frost: number;
  lightning: number;
  poison: number;
  bleed: number;
}

export interface HeroClassDef {
  id: HeroClassId;
  name: string;
  title: string;
  role: string;
  roleBadge: 'TANK' | 'MARKSMAN' | 'CASTER' | 'SUPPORT';
  weapon: string;
  weaponType: string;
  passiveName: string;
  passiveDesc: string;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldownMs: number;
  range: number;
  primaryColor: string;
  secondaryColor: string;
  capeColor: string;
  accentColor: string;
  glowColor: string;
  lore: string;
  stats: HeroClassStats;
  resistances: CombatResistances;
  tacticalName: string;
  tacticalDesc: string;
  tacticalCooldownMs: number;
  ultName: string;
  ultDesc: string;
  ultCooldownMs: number;
}

/**
 * Authoritative class definitions preserved directly from Beyond: Dungeons
 * (see REFERENCE_AUDIT.md and DESIGN_DECISIONS DD-002, DD-022).
 */
export const HERO_CLASSES: Record<HeroClassId, HeroClassDef> = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    title: 'Ironcrest Bastion',
    role: 'Frontline Guardian & Juggernaut',
    roleBadge: 'TANK',
    weapon: 'Sunforged Claymore & Tower Greatshield',
    weaponType: 'Heavy Cleave & Shield Wall',
    passiveName: 'Iron Will',
    passiveDesc: 'Absorbs 15% of all incoming damage. Striking stunned or burning foes restores +3 Shield.',
    maxHp: 155,
    speed: 175,
    damage: 28,
    attackCooldownMs: 400,
    range: 74,
    primaryColor: '#64748B',
    secondaryColor: '#CBD5E1',
    capeColor: '#991B1B',
    accentColor: '#F59E0B',
    glowColor: '#FBBF24',
    lore: 'Sworn knights of the Sunken Bastion who bound their lifeblood into eternal steel. With unbroken wills and towering shields, they stand between ancient horrors and their comrades.',
    stats: { survivability: 5, damage: 3, range: 1, mobility: 2, utility: 4 },
    resistances: { physical: 0.28, fire: 0.15, frost: 0.15, lightning: 0.10, poison: 0.15, bleed: 0.30 },
    tacticalName: 'Bulwark Dash',
    tacticalDesc: 'Slam forward with tower shield, battering through monsters, stunning them for 1.7s and granting +28 Shield to nearby allies.',
    tacticalCooldownMs: 4800,
    ultName: 'Aegis Sanctuary',
    ultDesc: 'Plant your colossal shield into the earth, raising a gleaming dome that deflects projectile barrages and boosts party defense.',
    ultCooldownMs: 13000,
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    title: 'Thornwood Marksman',
    role: 'Long-Range Sniper & Scout',
    roleBadge: 'MARKSMAN',
    weapon: 'Ashwood Recurve & Barbed Quiver',
    weaponType: 'Piercing Ranged Bow',
    passiveName: 'Eagle Keenness',
    passiveDesc: 'Attacks deal +25% Critical damage to targets beyond 180 units. Slaying a foe grants a 2s burst of swiftness.',
    maxHp: 110,
    speed: 210,
    damage: 24,
    attackCooldownMs: 320,
    range: 195,
    primaryColor: '#2D5A3C',
    secondaryColor: '#4ADE80',
    capeColor: '#1A3826',
    accentColor: '#FBBF24',
    glowColor: '#34D399',
    lore: 'Sole survivors of the blighted Thornwood groves, master trackers capable of loose-drawing three enchanted shafts in the blink of an eye. Their arrows never falter.',
    stats: { survivability: 2, damage: 5, range: 5, mobility: 5, utility: 2 },
    resistances: { physical: 0.10, fire: 0.10, frost: 0.25, lightning: 0.15, poison: 0.45, bleed: 0.20 },
    tacticalName: 'Frost Volley',
    tacticalDesc: 'Loose a 5-arrow crystalline fan that pierces foes, slowing enemy advance by 50% and chilling their attacks.',
    tacticalCooldownMs: 4200,
    ultName: 'Hunter Quarry',
    ultDesc: 'Mark elites and bosses with radiant moonlight hunters-brand, exposing their weak points so all co-op allies deal +35% bonus strike damage.',
    ultCooldownMs: 11500,
  },
  arcanist: {
    id: 'arcanist',
    name: 'Arcanist',
    title: 'Astral Conduit',
    role: 'AoE Spellweaver & Cosmic Blaster',
    roleBadge: 'CASTER',
    weapon: 'Runebound Spire & Orbiting Astral Orbs',
    weaponType: 'Cosmic Shards & Starlight',
    passiveName: 'Astral Resonance',
    passiveDesc: 'Basic attacks loose homing cosmic shards that pierce an additional enemy. Spells leave lingering star rifts.',
    maxHp: 100,
    speed: 188,
    damage: 32,
    attackCooldownMs: 420,
    range: 185,
    primaryColor: '#4338CA',
    secondaryColor: '#818CF8',
    capeColor: '#312E81',
    accentColor: '#38BDF8',
    glowColor: '#60A5FA',
    lore: 'Scholars of the shattered celestial spires who channel raw starlight through crystalline conduits. They weave time and void to obliterate dungeon hordes from afar.',
    stats: { survivability: 2, damage: 5, range: 4, mobility: 3, utility: 4 },
    resistances: { physical: 0.05, fire: 0.25, frost: 0.35, lightning: 0.45, poison: 0.15, bleed: 0.10 },
    tacticalName: 'Astral Nova',
    tacticalDesc: 'Unleash 8 piercing arcane shards in a starburst, knocking back surrounding monsters with void energy.',
    tacticalCooldownMs: 5000,
    ultName: 'Chrono Well',
    ultDesc: 'Anchor a cosmic gravitational well that snares enemies, pulling them in while accelerating allied cooldowns by 50%.',
    ultCooldownMs: 13500,
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    title: 'Sunbrand Prelate',
    role: 'Radiant Healer & Divine Enchanter',
    roleBadge: 'SUPPORT',
    weapon: 'Dawnstar Flanged Mace & Reliquary',
    weaponType: 'Radiant Smite & Holy Relic',
    passiveName: 'Radiant Aura',
    passiveDesc: 'Emits a sacred 140-range warmth that heals wounded party members every 2 seconds (scales with Level & Faith, base 2 HP, +50% when critical), and increases revive speed by 40%.',
    maxHp: 128,
    speed: 185,
    damage: 22,
    attackCooldownMs: 380,
    range: 160,
    primaryColor: '#E2E8F0',
    secondaryColor: '#FDE047',
    capeColor: '#854D0E',
    accentColor: '#FACC15',
    glowColor: '#FEF08A',
    lore: 'Devotees of the Eternal Dawn whose sacred chants can mend the gravest wounds and turn undead to ash. A cornerstone of every surviving expedition into the depths.',
    stats: { survivability: 4, damage: 3, range: 3, mobility: 2, utility: 5 },
    resistances: { physical: 0.15, fire: 0.40, frost: 0.20, lightning: 0.15, poison: 0.35, bleed: 0.25 },
    tacticalName: 'Sanctified Pulse',
    tacticalDesc: 'Release a blinding wave of golden light, healing you and all nearby party members (scales with Level & Faith, base 24 HP) while searing adjacent undead.',
    tacticalCooldownMs: 6800,
    ultName: 'Solar Beacon',
    ultDesc: 'Consecrate holy ground with an avatar of the Sun that continuously heals all allies (scales with Level & Faith, base 4 HP) and rapidly revives downed teammates who enter.',
    ultCooldownMs: 18000,
  },
};

export const HERO_CLASS_LIST: readonly HeroClassDef[] = [
  HERO_CLASSES.vanguard,
  HERO_CLASSES.ranger,
  HERO_CLASSES.arcanist,
  HERO_CLASSES.cleric,
];

export type ArmamentSlot = 'weapon' | 'vestment';

export interface ArmamentItemDef {
  id: string;
  slot: ArmamentSlot;
  name: string;
  compatibleClasses: readonly HeroClassId[];
  source: 'dungeons_default' | 'overworld_foundation';
  tacticalSkillId?: string;
  tacticalCooldownMs?: number;
  summary: string;
}

/**
 * Baseline Armament catalog grounded strictly in Beyond: Dungeons' established
 * class weapons & vestments (DD-014..DD-020). Additional Overworld-exclusive
 * armaments require Game Director approval of equipment statistics & effects.
 */
export const BASE_ARMAMENTS: Record<string, ArmamentItemDef> = {
  wpn_vanguard_default: {
    id: 'wpn_vanguard_default',
    slot: 'weapon',
    name: HERO_CLASSES.vanguard.weapon,
    compatibleClasses: ['vanguard'],
    source: 'dungeons_default',
    tacticalSkillId: 'tac_vanguard_bulwark_dash',
    tacticalCooldownMs: HERO_CLASSES.vanguard.tacticalCooldownMs,
    summary: HERO_CLASSES.vanguard.weaponType,
  },
  vest_vanguard_default: {
    id: 'vest_vanguard_default',
    slot: 'vestment',
    name: 'Vanguard Vestments',
    compatibleClasses: ['vanguard'],
    source: 'dungeons_default',
    summary: HERO_CLASSES.vanguard.passiveDesc,
  },
  wpn_ranger_default: {
    id: 'wpn_ranger_default',
    slot: 'weapon',
    name: HERO_CLASSES.ranger.weapon,
    compatibleClasses: ['ranger'],
    source: 'dungeons_default',
    tacticalSkillId: 'tac_ranger_frost_volley',
    tacticalCooldownMs: HERO_CLASSES.ranger.tacticalCooldownMs,
    summary: HERO_CLASSES.ranger.weaponType,
  },
  vest_ranger_default: {
    id: 'vest_ranger_default',
    slot: 'vestment',
    name: 'Ranger Vestments',
    compatibleClasses: ['ranger'],
    source: 'dungeons_default',
    summary: HERO_CLASSES.ranger.passiveDesc,
  },
  wpn_arcanist_default: {
    id: 'wpn_arcanist_default',
    slot: 'weapon',
    name: HERO_CLASSES.arcanist.weapon,
    compatibleClasses: ['arcanist'],
    source: 'dungeons_default',
    tacticalSkillId: 'tac_arcanist_astral_nova',
    tacticalCooldownMs: HERO_CLASSES.arcanist.tacticalCooldownMs,
    summary: HERO_CLASSES.arcanist.weaponType,
  },
  vest_arcanist_default: {
    id: 'vest_arcanist_default',
    slot: 'vestment',
    name: 'Arcanist Vestments',
    compatibleClasses: ['arcanist'],
    source: 'dungeons_default',
    summary: HERO_CLASSES.arcanist.passiveDesc,
  },
  wpn_cleric_default: {
    id: 'wpn_cleric_default',
    slot: 'weapon',
    name: HERO_CLASSES.cleric.weapon,
    compatibleClasses: ['cleric'],
    source: 'dungeons_default',
    tacticalSkillId: 'tac_cleric_sanctified_pulse',
    tacticalCooldownMs: HERO_CLASSES.cleric.tacticalCooldownMs,
    summary: HERO_CLASSES.cleric.weaponType,
  },
  vest_cleric_default: {
    id: 'vest_cleric_default',
    slot: 'vestment',
    name: 'Cleric Vestments',
    compatibleClasses: ['cleric'],
    source: 'dungeons_default',
    summary: HERO_CLASSES.cleric.passiveDesc,
  },
};

export function getDefaultWeaponId(heroClass: HeroClassId): string {
  return `wpn_${heroClass}_default`;
}

export function getDefaultVestmentId(heroClass: HeroClassId): string {
  return `vest_${heroClass}_default`;
}
