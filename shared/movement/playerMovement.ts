import {
  HERO_CLASSES,
  PLAYER_COLLISION_RADIUS,
  TILE_SIZE,
  type HeroClassId,
} from '../constants/classes.ts';
import type { OverworldZoneId } from '../constants/zones.ts';
import type { OverworldInputState, WorldMapData } from '../types/domain.ts';

export interface MovablePlayerLike {
  heroClass: HeroClassId;
  dexterity?: number;
  hasteMs?: number;
}

const COLLISION_COS = [
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
  0,
  Math.SQRT1_2,
];

const COLLISION_SIN = [
  0,
  Math.SQRT1_2,
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
];

export function isWallAtWorld(map: WorldMapData, wx: number, wy: number): boolean {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  return map.tiles[ty * map.width + tx] === 0;
}

export function getZoneAtWorld(map: WorldMapData, wx: number, wy: number): OverworldZoneId {
  const tx = Math.max(0, Math.min(map.width - 1, Math.floor(wx / TILE_SIZE)));
  const ty = Math.max(0, Math.min(map.height - 1, Math.floor(wy / TILE_SIZE)));
  return map.zoneGrid[ty * map.width + tx] ?? 'open_world';
}

export function hasLineOfSight(
  map: WorldMapData,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist <= TILE_SIZE) return true;
  const steps = Math.ceil(dist / 14);
  const stepX = dx / steps;
  const stepY = dy / steps;
  for (let i = 1; i < steps; i++) {
    if (isWallAtWorld(map, x1 + stepX * i, y1 + stepY * i)) {
      return false;
    }
  }
  return true;
}

export function collidesCircle(
  map: WorldMapData,
  wx: number,
  wy: number,
  radius: number
): boolean {
  if (isWallAtWorld(map, wx, wy)) return true;
  for (let i = 0; i < 8; i++) {
    const cx = wx + COLLISION_COS[i] * radius;
    const cy = wy + COLLISION_SIN[i] * radius;
    if (isWallAtWorld(map, cx, cy)) return true;
  }
  return false;
}

export function moveWithCollision(
  map: WorldMapData,
  entity: { x: number; y: number },
  dx: number,
  dy: number,
  radius: number = PLAYER_COLLISION_RADIUS
): void {
  if (collidesCircle(map, entity.x, entity.y, radius * 0.75)) {
    let escapeX = 0;
    let escapeY = 0;
    const probeDist = radius + 8;
    for (let i = 0; i < 8; i++) {
      const testX = entity.x + COLLISION_COS[i] * probeDist;
      const testY = entity.y + COLLISION_SIN[i] * probeDist;
      if (!isWallAtWorld(map, testX, testY)) {
        escapeX += COLLISION_COS[i];
        escapeY += COLLISION_SIN[i];
      }
    }
    if (escapeX !== 0 || escapeY !== 0) {
      const len = Math.hypot(escapeX, escapeY);
      entity.x += (escapeX / len) * 4;
      entity.y += (escapeY / len) * 4;
    }
  }

  const targetX = entity.x + dx;
  const targetY = entity.y + dy;
  if (
    hasLineOfSight(map, entity.x, entity.y, targetX, targetY) &&
    !collidesCircle(map, targetX, targetY, radius)
  ) {
    entity.x = targetX;
    entity.y = targetY;
    return;
  }

  if (dx !== 0 && !collidesCircle(map, targetX, entity.y, radius)) {
    entity.x = targetX;
  } else if (dx !== 0 && !collidesCircle(map, entity.x + dx * 0.5, entity.y, radius)) {
    entity.x += dx * 0.5;
  }

  if (dy !== 0 && !collidesCircle(map, entity.x, targetY, radius)) {
    entity.y = targetY;
  } else if (dy !== 0 && !collidesCircle(map, entity.x, entity.y + dy * 0.5, radius)) {
    entity.y += dy * 0.5;
  }
}

export function computePlayerMoveSpeed(player: MovablePlayerLike): number {
  const def = HERO_CLASSES[player.heroClass];
  let moveSpeed = def.speed * (1 + (player.dexterity || 0) * 0.0025);
  if ((player.hasteMs || 0) > 0) moveSpeed *= 1.22;
  return moveSpeed;
}

export function normalizePlayerInputDirection(
  input: Pick<OverworldInputState, 'up' | 'down' | 'left' | 'right' | 'stickX' | 'stickY'>
): { mx: number; my: number } {
  let mx = 0;
  let my = 0;

  if (
    typeof input.stickX === 'number' &&
    typeof input.stickY === 'number' &&
    (Math.abs(input.stickX) > 0.05 || Math.abs(input.stickY) > 0.05)
  ) {
    const len = Math.hypot(input.stickX, input.stickY);
    const clampedLen = Math.min(1, len);
    mx = (input.stickX / len) * clampedLen;
    my = (input.stickY / len) * clampedLen;
  } else {
    mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    }
  }

  return { mx, my };
}

export function hasMovementInput(
  input: Pick<OverworldInputState, 'up' | 'down' | 'left' | 'right' | 'stickX' | 'stickY'>
): boolean {
  if (
    typeof input.stickX === 'number' &&
    typeof input.stickY === 'number' &&
    (Math.abs(input.stickX) > 0.05 || Math.abs(input.stickY) > 0.05)
  ) {
    return true;
  }
  return Boolean(input.up || input.down || input.left || input.right);
}

export function stepPlayerMovement(
  entity: { x: number; y: number; vx: number; vy: number },
  input: Pick<OverworldInputState, 'up' | 'down' | 'left' | 'right' | 'stickX' | 'stickY'>,
  map: WorldMapData,
  dtSec: number,
  options?: {
    moveSpeed?: number;
    player?: MovablePlayerLike;
  }
): void {
  if (dtSec <= 0) return;
  const moveSpeed =
    options?.moveSpeed ??
    (options?.player ? computePlayerMoveSpeed(options.player) : 175);
  const { mx, my } = normalizePlayerInputDirection(input);

  if (mx !== 0 || my !== 0) {
    entity.vx = mx * moveSpeed;
    entity.vy = my * moveSpeed;
  } else {
    entity.vx = 0;
    entity.vy = 0;
  }

  if (entity.vx !== 0 || entity.vy !== 0) {
    moveWithCollision(
      map,
      entity,
      entity.vx * dtSec,
      entity.vy * dtSec,
      PLAYER_COLLISION_RADIUS
    );
  }
}
