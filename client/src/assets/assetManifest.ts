import type { HeroClassId } from '../../../shared/constants/classes.ts';

/**
 * Approved Asset Reference Manifest per ART_DIRECTION.md Section 11 & REFERENCE_AUDIT.md.
 * All visual assets preserve Beyond: Dungeons' Canvas 2D pixel-art character proportions,
 * palette tokens, and .stone-* dark stone sanctuary UI language.
 */
export interface AssetReferenceEntry {
  id: string;
  category: 'character_sprite' | 'ui_preview' | 'environment' | 'ui_theme';
  source: 'beyond_dungeons_verbatim' | 'overworld_foundation_stub';
  path: string;
  notes: string;
}

export const OVERWORLD_ASSET_MANIFEST: readonly AssetReferenceEntry[] = [
  {
    id: 'sprites_hero_classes',
    category: 'character_sprite',
    source: 'beyond_dungeons_verbatim',
    path: 'client/src/game/rendering/heroSprites.ts',
    notes: 'Procedural 32x32 Canvas 2D renderer for Vanguard, Ranger, Arcanist, Cleric.',
  },
  {
    id: 'facing_8way',
    category: 'character_sprite',
    source: 'beyond_dungeons_verbatim',
    path: 'client/src/game/characters/directionalFacing.ts',
    notes: '8-way directional quantization (E, SE, S, SW, W, NW, N, NE) and perspective pose solver.',
  },
  {
    id: 'ui_hero_preview',
    category: 'ui_preview',
    source: 'beyond_dungeons_verbatim',
    path: 'client/src/ui/PixelHeroPreview.tsx',
    notes: 'Dedicated offscreen 32x32 nearest-neighbor React class preview renderer.',
  },
  {
    id: 'ui_stone_theme',
    category: 'ui_theme',
    source: 'beyond_dungeons_verbatim',
    path: 'client/src/ui/index.css',
    notes: 'Obsidian #181820 canvas, #55535f bevel panels, #D9AA52 gold highlights, Pixelify Sans + Plus Jakarta Sans + JetBrains Mono.',
  },
  {
    id: 'map_foundation_tiles',
    category: 'environment',
    source: 'overworld_foundation_stub',
    path: 'client/src/game/rendering/worldRenderer.ts',
    notes: 'Non-final 32x32 stone tileset placeholder displaying zone boundaries; final biome art awaits Game Director approval.',
  },
];

export const HERO_CLASS_VISUAL_TAGS: Record<HeroClassId, { label: string; framePx: number }> = {
  vanguard: { label: 'Sunforged Bastion', framePx: 32 },
  ranger: { label: 'Thornwood Stalker', framePx: 32 },
  arcanist: { label: 'Astral Conduit', framePx: 32 },
  cleric: { label: 'Sunbrand Prelate', framePx: 32 },
};
