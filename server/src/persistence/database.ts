import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import type { WorldInstanceSummary } from '../../../shared/types/domain.ts';

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

let pool: Pool | null = null;
let mode: DatabaseMode = 'memory';
let initialized = false;

const memoryInstances = new Map<string, WorldInstanceSummary>();
const memoryHonorLedger: HonorLedgerInput[] = [];
const memoryHonorKeys = new Set<string>();
const memorySurvivalResults: SurvivalResultInput[] = [];
const memoryPublicEvents: PublicEventRecordInput[] = [];
const memoryRewardClaims = new Map<string, RewardClaimInput>();

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

    const migrationPath = path.resolve(
      process.cwd(),
      'database',
      'migrations',
      '001_initial_overworld.sql'
    );
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await candidatePool.query(sql);
    }

    pool = candidatePool;
    mode = 'postgres';
    console.log('[DB] Connected to PostgreSQL and applied Overworld migration 001.');
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

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  initialized = false;
  mode = 'memory';
}
