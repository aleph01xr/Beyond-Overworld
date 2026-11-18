import type {
  ActivityModuleStatus,
  OverworldPlayerState,
} from '../../../shared/types/domain.ts';

/**
 * Isolated Arena module boundary (ARCHITECTURE.md Section 8, DD-012).
 * Matchmaking, ranking, scoring, and Honor reward formulas await Game Director approval.
 */
export class ArenaModule {
  getStatus(players: Iterable<OverworldPlayerState>): ActivityModuleStatus {
    let count = 0;
    for (const player of players) {
      if (player.connected && player.zone === 'arena') count++;
    }
    return {
      id: 'arena',
      name: 'Competitive Arena',
      status: 'awaiting_design_approval',
      participantsInZone: count,
      summary:
        'Arena zone boundary active. Matchmaking, ranking, and Arena Honor reward formulas await design approval.',
    };
  }
}
