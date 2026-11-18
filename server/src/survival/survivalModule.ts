import type {
  ActivityModuleStatus,
  OverworldPlayerState,
} from '../../../shared/types/domain.ts';

/**
 * Isolated PvPvE Survival module boundary (ARCHITECTURE.md Section 9, DD-013).
 * Session rules, environmental enemies, scaling, and extraction rewards await design approval.
 */
export class SurvivalModule {
  getStatus(players: Iterable<OverworldPlayerState>): ActivityModuleStatus {
    let count = 0;
    for (const player of players) {
      if (player.connected && player.zone === 'survival') count++;
    }
    return {
      id: 'survival',
      name: 'PvPvE Survival',
      status: 'awaiting_design_approval',
      participantsInZone: count,
      summary:
        'Survival Grounds zone boundary active. Session rules, enemy scaling, and reward calculations await design approval.',
    };
  }
}
