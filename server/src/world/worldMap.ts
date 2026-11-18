import { TILE_SIZE } from '../../../shared/constants/classes.ts';
import type { OverworldZoneId } from '../../../shared/constants/zones.ts';
import type { WorldMapData, WorldRegionRect } from '../../../shared/types/domain.ts';

/**
 * Builds the non-final Development Foundation Map for Beyond: Overworld.
 *
 * Notice per GAME_DESIGN.md Section 13 & DESIGN_DECISIONS Section 8:
 * The exact world map layout is NOT finalized and awaits Game Director approval.
 * This structured 64x48 layout exercises Safe Zone boundaries, Open World transitions,
 * wall sliding collision, Arena Grounds, and Survival Grounds zones.
 */
export function createFoundationWorldMap(): WorldMapData {
  const width = 64;
  const height = 48;
  const tiles = new Array<number>(width * height).fill(1);
  const zoneGrid = new Array<OverworldZoneId>(width * height).fill('open_world');

  const setTile = (x: number, y: number, tileVal: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    tiles[y * width + x] = tileVal;
  };

  const fillZone = (rx: number, ry: number, rw: number, rh: number, zone: OverworldZoneId) => {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) {
          zoneGrid[y * width + x] = zone;
        }
      }
    }
  };

  // Outer perimeter walls
  for (let x = 0; x < width; x++) {
    setTile(x, 0, 0);
    setTile(x, height - 1, 0);
  }
  for (let y = 0; y < height; y++) {
    setTile(0, y, 0);
    setTile(width - 1, y, 0);
  }

  // Regions
  const regions: WorldRegionRect[] = [
    {
      id: 'region_sanctuary',
      zone: 'safe',
      label: 'Bastion Sanctuary (Safe Zone)',
      x: 24,
      y: 17,
      w: 16,
      h: 14,
    },
    {
      id: 'region_arena',
      zone: 'arena',
      label: 'Arena Grounds',
      x: 3,
      y: 14,
      w: 14,
      h: 20,
    },
    {
      id: 'region_survival',
      zone: 'survival',
      label: 'Survival Grounds',
      x: 47,
      y: 14,
      w: 14,
      h: 20,
    },
  ];

  for (const r of regions) {
    fillZone(r.x, r.y, r.w, r.h, r.zone);
  }

  // Sanctuary courtyard stone parapet with 4 wide open gates (N, S, E, W)
  const sx1 = 24;
  const sy1 = 17;
  const sx2 = 39;
  const sy2 = 30;
  for (let x = sx1; x <= sx2; x++) {
    const isGate = x >= 30 && x <= 33;
    if (!isGate) {
      setTile(x, sy1, 0);
      setTile(x, sy2, 0);
    }
  }
  for (let y = sy1; y <= sy2; y++) {
    const isGate = y >= 22 && y <= 25;
    if (!isGate) {
      setTile(sx1, y, 0);
      setTile(sx2, y, 0);
    }
  }

  // Arena West perimeter colonnade (open eastern entrance at y: 21..26)
  for (let y = 14; y <= 33; y++) {
    if (y < 21 || y > 26) {
      setTile(16, y, 0);
    }
  }
  for (let x = 3; x <= 16; x++) {
    setTile(x, 14, 0);
    setTile(x, 33, 0);
  }

  // Survival East perimeter palisade (open western entrance at y: 21..26)
  for (let y = 14; y <= 33; y++) {
    if (y < 21 || y > 26) {
      setTile(47, y, 0);
    }
  }
  for (let x = 47; x <= 60; x++) {
    setTile(x, 14, 0);
    setTile(x, 33, 0);
  }

  // Decorative stone pillars in Open World corridors for collision/LoS verification
  const pillars: Array<[number, number]> = [
    [20, 10],
    [43, 10],
    [20, 38],
    [43, 38],
    [10, 8],
    [53, 8],
    [10, 40],
    [53, 40],
  ];
  for (const [px, py] of pillars) {
    setTile(px, py, 0);
    setTile(px + 1, py, 0);
  }

  return {
    mapId: 'dev_foundation_v1',
    title: 'Development Foundation Map (Unfinalized Layout)',
    isDevelopmentStub: true,
    width,
    height,
    tiles,
    zoneGrid,
    regions,
    spawnPoint: {
      x: 31.5 * TILE_SIZE,
      y: 23.5 * TILE_SIZE,
    },
  };
}
