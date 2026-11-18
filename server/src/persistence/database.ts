import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import type {
  IdentityProviderKind,
  WorldInstanceSummary,
} from '../../../shared/types/domain.ts';

export type DatabaseMode = 'postgres' | 'memory';

export interface HonorLedgerInput {
  characterId: string;
  deltaHonor: number;
  balanceAfter: number;
  reason: string;
  idempotencyKey: string;
}

export interface SurvivalResultInput {
  sessionId: string;
  characterId: string;
  survivedSeconds: number;
  outcome: string;
}

export interface PublicEventRecordInput {
  eventId: string;
  instanceId: string;
  eventType: string;
  status: string;
}

export interface RewardClaimInput {
  claimId: string;
  characterId: string;
  sourceActivity: string;
  rewardType: string;
  rewardPayload: Record<string, unknown>;
}

export interface OverworldCharacterLinkRecord {
  accountId: string;
  characterId: string;
  identityProvider: IdentityProviderKind;
  arenaHonor: number;
  equippedWeaponId: string | null;
  equippedVestmentId: string | null;
  lastKnownUsername: string | null;
}

let pool: Pool | null = null;
let mode: DatabaseMode = 'memory';
let initialized = false;

const memoryInstances = new Map<string, WorldInstanceSummary>();
const memoryHonorLedger: HonorLedgerInput[] = [];
const memoryHonorKeys = new Set<string>();
const memorySurvivalResults: SurvivalResultInput[] = [];
const memoryPublicEvents: PublicEventRecordInput[] = [];
const memoryRewardClaims = new Map<string, RewardClaimInput>();
const memoryCharacterLinks = new Map<string, OverworldCharacterLinkRecord>();

export async function initDatabase(): Promise<DatabaseMode> {
  if (initialized) return mode;
  initialized = true;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.warn(
      '[DB] DATABASE_URL is not configured. Using in-memory Overworld persistence fallback (no permanent progression stored here per DD-027).'
    );
    mode = 'memory';
    return mode;
  }

  try {
    const candidatePool = new Pool({ connectionString: databaseUrl });
    await candidatePool.query('SELECT 1');

    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await candidatePool.query(sql);
      }
      console.log(
        `[DB] Connected to PostgreSQL and verified ${files.length} Overworld migration(s): ${files.join(', ')}.`
      );
    }

    pool = candidatePool;
    mode = 'postgres';
    return mode;
  } catch (err) {
    console.warn(
      '[DB] Failed to initialize PostgreSQL; falling back to in-memory Overworld store:',
      err instanceof Error ? err.message : String(err)
    );
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
    mode = 'memory';
    return mode;
  }
}

export function getDatabaseStatus(): { mode: DatabaseMode; connected: boolean } {
  return { mode, connected: mode === 'postgres' && pool !== null };
}

export async function getOverworldCharacterLink(
  accountId: string
): Promise<OverworldCharacterLinkRecord | null> {
  if (pool) {
    const res = await pool.query<{
      account_id: string;
      character_id: string;
      identity_provider: string;
      arena_honor: number;
      equipped_weapon_id: string | null;
      equipped_vestment_id: string | null;
      last_known_username: string | null;
    }>(
      `SELECT account_id, character_id, identity_provider, arena_honor,
              equipped_weapon_id, equipped_vestment_id, last_known_username
       FROM overworld_character_links
       WHERE account_id = $1`,
      [accountId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      accountId: row.account_id,
      characterId: row.character_id,
      identityProvider:
        row.identity_provider === 'local_dev' ? 'local_dev' : 'dungeons',
      arenaHonor: row.arena_honor,
      equippedWeaponId: row.equipped_weapon_id,
      equippedVestmentId: row.equipped_vestment_id,
      lastKnownUsername: row.last_known_username,
    };
  }

  const existing = memoryCharacterLinks.get(accountId);
  return existing ? { ...existing } : null;
}

/**
 * Inserts or updates an account-to-character link without ever deleting or
 * resetting existing Overworld Arena Honor or equipped Overworld armament.
 */
export async function upsertOverworldCharacterLink(
  record: OverworldCharacterLinkRecord
): Promise<OverworldCharacterLinkRecord> {
  if (pool) {
    const res = await pool.query<{
      account_id: string;
      character_id: string;
      identity_provider: string;
      arena_honor: number;
      equipped_weapon_id: string | null;
      equipped_vestment_id: string | null;
      last_known_username: string | null;
    }>(
      `INSERT INTO overworld_character_links (
         account_id,
         character_id,
         identity_provider,
         arena_honor,
         equipped_weapon_id,
         equipped_vestment_id,
         last_known_username,
         last_synced_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         identity_provider = EXCLUDED.identity_provider,
         last_known_username = EXCLUDED.last_known_username,
         arena_honor = GREATEST(overworld_character_links.arena_honor, EXCLUDED.arena_honor),
         equipped_weapon_id = COALESCE(overworld_character_links.equipped_weapon_id, EXCLUDED.equipped_weapon_id),
         equipped_vestment_id = COALESCE(overworld_character_links.equipped_vestment_id, EXCLUDED.equipped_vestment_id),
         last_synced_at = NOW(),
         updated_at = NOW()
       RETURNING account_id, character_id, identity_provider, arena_honor,
                 equipped_weapon_id, equipped_vestment_id, last_known_username`,
      [
        record.accountId,
        record.characterId,
        record.identityProvider,
        Math.max(0, Math.trunc(record.arenaHonor)),
        record.equippedWeaponId,
        record.equippedVestmentId,
        record.lastKnownUsername,
      ]
    );
    const row = res.rows[0];
    return {
      accountId: row.account_id,
      characterId: row.character_id,
      identityProvider:
        row.identity_provider === 'local_dev' ? 'local_dev' : 'dungeons',
      arenaHonor: row.arena_honor,
      equippedWeaponId: row.equipped_weapon_id,
      equippedVestmentId: row.equipped_vestment_id,
      lastKnownUsername: row.last_known_username,
    };
  }

  const existing = memoryCharacterLinks.get(record.accountId);
  if (existing) {
    const merged: OverworldCharacterLinkRecord = {
      accountId: existing.accountId,
      characterId: existing.characterId,
      identityProvider: record.identityProvider,
      arenaHonor: Math.max(existing.arenaHonor, Math.max(0, Math.trunc(record.arenaHonor))),
      equippedWeaponId: existing.equippedWeaponId ?? record.equippedWeaponId,
      equippedVestmentId: existing.equippedVestmentId ?? record.equippedVestmentId,
      lastKnownUsername: record.lastKnownUsername ?? existing.lastKnownUsername,
    };
    memoryCharacterLinks.set(record.accountId, merged);
    return { ...merged };
  }

  const created: OverworldCharacterLinkRecord = {
    accountId: record.accountId,
    characterId: record.characterId,
    identityProvider: record.identityProvider,
    arenaHonor: Math.max(0, Math.trunc(record.arenaHonor)),
    equippedWeaponId: record.equippedWeaponId,
    equippedVestmentId: record.equippedVestmentId,
    lastKnownUsername: record.lastKnownUsername,
  };
  memoryCharacterLinks.set(record.accountId, created);
  return { ...created };
}

export async function updateOverworldCharacterHonor(
  accountId: string,
  newHonorBalance: number
): Promise<void> {
  const safeBalance = Math.max(0, Math.trunc(newHonorBalance));
  if (pool) {
    await pool.query(
      `UPDATE overworld_character_links
       SET arena_honor = $2, updated_at = NOW()
       WHERE account_id = $1`,
      [accountId, safeBalance]
    );
    return;
  }
  const existing = memoryCharacterLinks.get(accountId);
  if (existing) {
    existing.arenaHonor = safeBalance;
  }
}

export async function updateOverworldCharacterArmament(
  accountId: string,
  slot: 'weapon' | 'vestment',
  itemId: string | null
): Promise<void> {
  if (pool) {
    const column = slot === 'weapon' ? 'equipped_weapon_id' : 'equipped_vestment_id';
    await pool.query(
      `UPDATE overworld_character_links
       SET ${column} = $2, updated_at = NOW()
       WHERE account_id = $1`,
      [accountId, itemId]
    );
    return;
  }
  const existing = memoryCharacterLinks.get(accountId);
  if (existing) {
    if (slot === 'weapon') {
      existing.equippedWeaponId = itemId;
    } else {
      existing.equippedVestmentId = itemId;
    }
  }
}

export async function upsertInstanceRecord(summary: WorldInstanceSummary): Promise<void> {
  if (pool) {
    await pool.query(
      `INSERT INTO overworld_instances (instance_id, name, region_label, max_players, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (instance_id) DO UPDATE SET
         name = EXCLUDED.name,
         region_label = EXCLUDED.region_label,
         max_players = EXCLUDED.max_players,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [summary.instanceId, summary.name, summary.regionLabel, summary.maxPlayers, summary.status]
    );
    return;
  }
  memoryInstances.set(summary.instanceId, { ...summary });
}

export async function recordHonorEntry(entry: HonorLedgerInput): Promise<boolean> {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO arena_honor_ledger (character_id, delta_honor, balance_after, reason, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [entry.characterId, entry.deltaHonor, entry.balanceAfter, entry.reason, entry.idempotencyKey]
    );
    return (res.rowCount ?? 0) > 0;
  }
  if (memoryHonorKeys.has(entry.idempotencyKey)) return false;
  memoryHonorKeys.add(entry.idempotencyKey);
  memoryHonorLedger.push({ ...entry });
  return true;
}

export async function recordSurvivalResult(result: SurvivalResultInput): Promise<void> {
  if (pool) {
    await pool.query(
      `INSERT INTO survival_results (session_id, character_id, survived_seconds, outcome)
       VALUES ($1, $2, $3, $4)`,
      [result.sessionId, result.characterId, result.survivedSeconds, result.outcome]
    );
    return;
  }
  memorySurvivalResults.push({ ...result });
}

export async function recordPublicEvent(record: PublicEventRecordInput): Promise<void> {
  if (pool) {
    await pool.query(
      `INSERT INTO public_event_records (event_id, instance_id, event_type, status)
       VALUES ($1, $2, $3, $4)`,
      [record.eventId, record.instanceId, record.eventType, record.status]
    );
    return;
  }
  memoryPublicEvents.push({ ...record });
}

export async function recordRewardClaim(claim: RewardClaimInput): Promise<boolean> {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO overworld_reward_claims (claim_id, character_id, source_activity, reward_type, reward_payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (claim_id) DO NOTHING
       RETURNING id`,
      [
        claim.claimId,
        claim.characterId,
        claim.sourceActivity,
        claim.rewardType,
        JSON.stringify(claim.rewardPayload),
      ]
    );
    return (res.rowCount ?? 0) > 0;
  }
  if (memoryRewardClaims.has(claim.claimId)) return false;
  memoryRewardClaims.set(claim.claimId, { ...claim });
  return true;
}

export function resetMemoryStoresForTest(): void {
  memoryInstances.clear();
  memoryHonorLedger.length = 0;
  memoryHonorKeys.clear();
  memorySurvivalResults.length = 0;
  memoryPublicEvents.length = 0;
  memoryRewardClaims.clear();
  memoryCharacterLinks.clear();
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  initialized = false;
  mode = 'memory';
}
