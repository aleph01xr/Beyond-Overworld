import { HERO_CLASSES, TILE_SIZE } from '../../../../shared/constants/classes.ts';
import { OVERWORLD_ZONES } from '../../../../shared/constants/zones.ts';
import type {
  FloatingCallout,
  OverworldPlayerState,
  OverworldSnapshot,
  WorldMapData,
} from '../../../../shared/types/domain.ts';
import { drawHeroSprite } from './heroSprites.ts';

export interface ActiveCalloutVisual extends FloatingCallout {
  createdAtMs: number;
  durationMs: number;
}

interface RemoteInterpEntry {
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
}

const REMOTE_INTERP_CACHE = new Map<string, RemoteInterpEntry>();

function resolveTilePalette(
  zone: WorldMapData['zoneGrid'][number],
  tx: number,
  ty: number
): string {
  const checker = (tx + ty) % 2 === 0;
  switch (zone) {
    case 'safe':
      return checker ? '#252c2b' : '#212726';
    case 'arena':
      return checker ? '#2e2226' : '#281d21';
    case 'survival':
      return checker ? '#262030' : '#211b2a';
    case 'open_world':
    default:
      return checker ? '#222129' : '#1d1c24';
  }
}

export function renderOverworldFrame(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  map: WorldMapData;
  snapshot: OverworldSnapshot;
  localPlayer: OverworldPlayerState;
  callouts: ActiveCalloutVisual[];
  nowMs: number;
}): void {
  const { ctx, width, height, map, snapshot, localPlayer, callouts, nowMs } = params;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#181820';
  ctx.fillRect(0, 0, width, height);

  // Camera zoom matching ART_DIRECTION.md Section 3 (1.2x - 1.65x)
  const zoom = Math.max(1.2, Math.min(1.65, width / 960));
  const halfW = width / (2 * zoom);
  const halfH = height / (2 * zoom);

  const worldPixelW = map.width * TILE_SIZE;
  const worldPixelH = map.height * TILE_SIZE;
  const camX = Math.max(halfW, Math.min(worldPixelW - halfW, localPlayer.x));
  const camY = Math.max(halfH, Math.min(worldPixelH - halfH, localPlayer.y));

  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(halfW - camX, halfH - camY);

  const startTx = Math.max(0, Math.floor((camX - halfW) / TILE_SIZE) - 1);
  const endTx = Math.min(map.width - 1, Math.ceil((camX + halfW) / TILE_SIZE) + 1);
  const startTy = Math.max(0, Math.floor((camY - halfH) / TILE_SIZE) - 1);
  const endTy = Math.min(map.height - 1, Math.ceil((camY + halfH) / TILE_SIZE) + 1);

  // Draw traversable floor & wall masonry tiles
  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const idx = ty * map.width + tx;
      const tile = map.tiles[idx];
      const wx = tx * TILE_SIZE;
      const wy = ty * TILE_SIZE;

      if (tile === 0) {
        // Dark obsidian basalt masonry block
        ctx.fillStyle = '#33313d';
        ctx.fillRect(wx, wy, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#474553';
        ctx.fillRect(wx, wy, TILE_SIZE, 6);
        ctx.fillStyle = '#15141c';
        ctx.fillRect(wx, wy + TILE_SIZE - 5, TILE_SIZE, 5);
        ctx.strokeStyle = '#1b1a23';
        ctx.lineWidth = 1;
        ctx.strokeRect(wx + 0.5, wy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      } else {
        const zone = map.zoneGrid[idx] ?? 'open_world';
        ctx.fillStyle = resolveTilePalette(zone, tx, ty);
        ctx.fillRect(wx, wy, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.strokeRect(wx + 0.5, wy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
  }

  // Subtle zone boundary overlays & labels
  for (const region of map.regions) {
    const rx = region.x * TILE_SIZE;
    const ry = region.y * TILE_SIZE;
    const rw = region.w * TILE_SIZE;
    const rh = region.h * TILE_SIZE;
    const zoneMeta = OVERWORLD_ZONES[region.zone];

    ctx.save();
    ctx.strokeStyle = zoneMeta.accentColor;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);
    ctx.restore();

    ctx.save();
    ctx.font = '600 11px "Pixelify Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = zoneMeta.accentColor;
    ctx.globalAlpha = 0.72;
    ctx.fillText(region.label.toUpperCase(), rx + rw / 2, ry + 20);
    ctx.restore();
  }

  // Gather and depth-sort entities by y coordinate
  const renderPlayers: OverworldPlayerState[] = [];
  const seenRemoteIds = new Set<string>();

  for (const p of snapshot.players) {
    if (p.id === localPlayer.id) {
      renderPlayers.push(localPlayer);
      continue;
    }
    seenRemoteIds.add(p.id);
    const cached = REMOTE_INTERP_CACHE.get(p.id);
    if (!cached) {
      REMOTE_INTERP_CACHE.set(p.id, {
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        aimAngle: p.aimAngle,
      });
      renderPlayers.push(p);
    } else {
      const dist = Math.hypot(p.x - cached.x, p.y - cached.y);
      if (dist > 140) {
        cached.x = p.x;
        cached.y = p.y;
      } else {
        cached.x += (p.x - cached.x) * 0.28;
        cached.y += (p.y - cached.y) * 0.28;
      }
      cached.vx = p.vx;
      cached.vy = p.vy;
      cached.aimAngle = p.aimAngle;
      renderPlayers.push({
        ...p,
        x: cached.x,
        y: cached.y,
      });
    }
  }

  for (const existingId of REMOTE_INTERP_CACHE.keys()) {
    if (!seenRemoteIds.has(existingId)) {
      REMOTE_INTERP_CACHE.delete(existingId);
    }
  }

  renderPlayers.sort((a, b) => a.y - b.y);

  for (const p of renderPlayers) {
    const isLocal = p.id === localPlayer.id;
    const moving = Math.hypot(p.vx, p.vy) > 4;
    const bob = moving ? Math.sin(nowMs * 0.016) * 2.2 : Math.sin(nowMs * 0.004) * 0.6;
    const swingProgress =
      p.attackAnimMs > 0 ? 1 - Math.min(1, p.attackAnimMs / 260) : undefined;

    // Ground contact shadow & local player ring
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 11, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (isLocal) {
      ctx.strokeStyle = OVERWORLD_ZONES[p.zone].accentColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 11, 13, 6.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    if (!p.connected) {
      ctx.globalAlpha = 0.5;
    }
    drawHeroSprite(ctx, p, Math.round(p.x), Math.round(p.y), {
      aimAngle: p.aimAngle,
      bob,
      moving,
      now: nowMs,
      swingProgress,
      swingKind: 'primary',
    });
    ctx.restore();

    // Overhead status bar & crisp nameplate
    const classDef = HERO_CLASSES[p.heroClass];
    const barW = 28;
    const barX = Math.round(p.x - barW / 2);
    const barY = Math.round(p.y - 27);
    const hpRatio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
    ctx.fillStyle = '#0f0e14';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), 3);
    if (p.shield > 0) {
      const shieldRatio = Math.max(0, Math.min(1, p.shield / Math.max(1, p.maxHp)));
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX, barY + 3, Math.round(barW * shieldRatio), 2);
    }

    ctx.save();
    ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    const tag = p.connected ? p.username : `${p.username} (Reconnecting)`;
    ctx.fillStyle = 'rgba(18, 17, 24, 0.78)';
    const textW = ctx.measureText(tag).width + 8;
    ctx.fillRect(Math.round(p.x - textW / 2), Math.round(p.y - 42), Math.ceil(textW), 12);
    ctx.fillStyle = isLocal ? '#FDE68A' : classDef.secondaryColor;
    ctx.fillText(tag, Math.round(p.x), Math.round(p.y - 33));
    ctx.restore();
  }

  // Floating feedback callouts
  for (const callout of callouts) {
    const age = nowMs - callout.createdAtMs;
    const progress = Math.min(1, age / callout.durationMs);
    const alpha = progress < 0.7 ? 1 : Math.max(0, 1 - (progress - 0.7) / 0.3);
    const rise = progress * 22;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 11px "Pixelify Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f0e14';
    ctx.fillText(callout.text, callout.x + 1, callout.y - rise + 1);
    ctx.fillStyle = callout.color;
    ctx.fillText(callout.text, callout.x, callout.y - rise);
    ctx.restore();
  }

  ctx.restore();
}
