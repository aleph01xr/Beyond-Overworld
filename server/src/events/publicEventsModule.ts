import type {
  ActivityModuleStatus,
  OverworldPlayerState,
} from '../../../shared/types/domain.ts';

/**
 * Isolated Shared Public Events module boundary (ARCHITECTURE.md Section 10, DD-008).
 * Event types, schedules, objectives, and rewards await Game Director design approval.
 */
export class PublicEventsModule {
  getStatus(players: Iterable<OverworldPlayerState>): ActivityModuleStatus {
    let openWorldCount = 0;
    for (const player of players) {
      if (player.connected && player.zone === 'open_world') openWorldCount++;
    }
    return {
      id: 'public_events',
      name: 'Shared Public Events',
      status: 'awaiting_design_approval',
      participantsInZone: openWorldCount,
      summary:
        'Shared event state pipeline active. Public event types, schedules, and rewards await design approval.',
    };
  }
}
