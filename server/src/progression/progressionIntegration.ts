import type { CharacterIntegrationLayer } from '../characters/characterIntegrationAdapter.ts';
import { recordHonorEntry, recordRewardClaim } from '../persistence/database.ts';

export interface VerifiedActivityOutcome {
  claimId: string;
  accountId: string;
  characterId: string;
  sourceActivity: 'arena' | 'survival' | 'public_event';
  arenaHonorDelta?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Separates Overworld activity rewards (e.g., Arena Honor per DD-012) from permanent
 * character EXP/attributes owned by Beyond: Dungeons / shared universe services (DD-006, DD-027).
 *
 * Client-reported reward, EXP, or Honor payloads are strictly rejected (DD-026).
 */
export class ProgressionIntegrationLayer {
  constructor(private readonly characterAdapter: CharacterIntegrationLayer) {}

  async recordServerVerifiedArenaHonor(outcome: VerifiedActivityOutcome): Promise<{
    accepted: boolean;
    newHonorBalance?: number;
    reason?: string;
  }> {
    if (outcome.sourceActivity !== 'arena') {
      return { accepted: false, reason: 'Arena Honor may only originate from verified Arena outcomes (DD-012).' };
    }

    const delta = Math.trunc(outcome.arenaHonorDelta ?? 0);
    if (delta <= 0) {
      return { accepted: false, reason: 'Honor delta must be positive.' };
    }

    const updated = await this.characterAdapter.addArenaHonor(outcome.accountId, delta);
    if (!updated) {
      return { accepted: false, reason: 'Character identity unavailable.' };
    }

    const inserted = await recordHonorEntry({
      characterId: outcome.characterId,
      deltaHonor: delta,
      balanceAfter: updated.arenaHonor,
      reason: 'verified_arena_outcome',
      idempotencyKey: outcome.claimId,
    });

    if (!inserted) {
      return { accepted: false, reason: 'Duplicate reward claim rejected.' };
    }

    await recordRewardClaim({
      claimId: outcome.claimId,
      characterId: outcome.characterId,
      sourceActivity: outcome.sourceActivity,
      rewardType: 'arena_honor',
      rewardPayload: { deltaHonor: delta, ...(outcome.metadata ?? {}) },
    });

    return { accepted: true, newHonorBalance: updated.arenaHonor };
  }

  rejectClientAssertedReward(): { accepted: false; reason: string } {
    return {
      accepted: false,
      reason: 'Server-authoritative progression rejects client-reported rewards or EXP (DD-026).',
    };
  }
}
