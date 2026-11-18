import type { OverworldPlayerState, OverworldSnapshot } from '../types/domain.ts';
import type { EntityPatch, OverworldDelta } from './wsProtocol.ts';

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!shallowEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(objB, k)) return false;
    if (!shallowEqual(objA[k], objB[k])) return false;
  }
  return true;
}

function diffEntity<T extends { id: string }>(
  prev: T,
  next: T
): { changes: Partial<T>; removedKeys?: string[] } | null {
  const prevRec = prev as Record<string, unknown>;
  const nextRec = next as Record<string, unknown>;
  const changes: Record<string, unknown> = {};
  let changed = false;

  for (const key of Object.keys(nextRec)) {
    if (key === 'id') continue;
    if (!shallowEqual(prevRec[key], nextRec[key])) {
      changes[key] = nextRec[key];
      changed = true;
    }
  }

  let removedKeys: string[] | undefined;
  for (const key of Object.keys(prevRec)) {
    if (key === 'id') continue;
    if (!(key in nextRec)) {
      if (!removedKeys) removedKeys = [];
      removedKeys.push(key);
      changed = true;
    }
  }

  if (!changed) return null;
  return { changes: changes as Partial<T>, removedKeys };
}

export function cloneSnapshotBaseline(snap: OverworldSnapshot): OverworldSnapshot {
  return {
    ...snap,
    players: snap.players.map((p) => ({
      ...p,
      tacticalCooldownsMs: { ...p.tacticalCooldownsMs },
    })),
    events: [],
    activities: snap.activities.map((a) => ({ ...a })),
  };
}

export function computeSnapshotDelta(
  prev: OverworldSnapshot,
  next: OverworldSnapshot,
  baseSeq: number,
  nextSeq: number
): OverworldDelta {
  const delta: OverworldDelta = {
    seq: nextSeq,
    baseSeq,
    serverTimeMs: next.serverTimeMs,
  };

  const prevMap = new Map(prev.players.map((p) => [p.id, p]));
  const nextIds = new Set<string>();

  let added: OverworldPlayerState[] | undefined;
  let updated: EntityPatch<OverworldPlayerState>[] | undefined;

  for (const p of next.players) {
    nextIds.add(p.id);
    const oldP = prevMap.get(p.id);
    if (!oldP) {
      if (!added) added = [];
      added.push(p);
    } else {
      const patch = diffEntity(oldP, p);
      if (patch) {
        if (!updated) updated = [];
        updated.push({
          id: p.id,
          changes: patch.changes,
          ...(patch.removedKeys ? { removedKeys: patch.removedKeys } : {}),
        });
      }
    }
  }

  let removed: string[] | undefined;
  for (const oldP of prev.players) {
    if (!nextIds.has(oldP.id)) {
      if (!removed) removed = [];
      removed.push(oldP.id);
    }
  }

  if (added) delta.playersAdded = added;
  if (updated) delta.playersUpdated = updated;
  if (removed) delta.playersRemoved = removed;
  if (next.events.length > 0) delta.events = next.events;
  if (!shallowEqual(prev.activities, next.activities)) delta.activities = next.activities;

  return delta;
}

export function applySnapshotDelta(
  prev: OverworldSnapshot,
  delta: OverworldDelta
): OverworldSnapshot {
  const removedSet = delta.playersRemoved?.length ? new Set(delta.playersRemoved) : null;
  const updatedMap = delta.playersUpdated?.length
    ? new Map(delta.playersUpdated.map((u) => [u.id, u]))
    : null;

  const players: OverworldPlayerState[] = [];
  for (const p of prev.players) {
    if (removedSet?.has(p.id)) continue;
    const patch = updatedMap?.get(p.id);
    if (patch) {
      const merged = { ...p, ...patch.changes } as Record<string, unknown>;
      if (patch.removedKeys) {
        for (const k of patch.removedKeys) delete merged[k];
      }
      players.push(merged as unknown as OverworldPlayerState);
    } else {
      players.push(p);
    }
  }
  if (delta.playersAdded?.length) {
    players.push(...delta.playersAdded);
  }

  return {
    ...prev,
    serverTimeMs: delta.serverTimeMs,
    tickSeq: delta.seq,
    players,
    events: delta.events ?? [],
    activities: delta.activities ?? prev.activities,
  };
}
