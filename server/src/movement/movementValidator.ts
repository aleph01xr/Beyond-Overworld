import {
  getZoneAtWorld,
  stepPlayerMovement,
} from '../../../shared/movement/playerMovement.ts';
import type {
  OverworldInputState,
  OverworldPlayerState,
  WorldMapData,
} from '../../../shared/types/domain.ts';

/**
 * Server-authoritative player movement validator (DD-026, CHANGELOG item 7).
 * Uses the identical deterministic movement & sliding collision model shared with clients
 * and resolves the player's authoritative world zone each tick.
 */
export class MovementValidator {
  stepPlayer(
    player: OverworldPlayerState,
    input: OverworldInputState,
    map: WorldMapData,
    dtMs: number
  ): { previousZone: OverworldPlayerState['zone']; nextZone: OverworldPlayerState['zone'] } {
    const dtSec = Math.max(0, Math.min(0.1, dtMs / 1000));
    const previousZone = player.zone;

    player.aimAngle = Number.isFinite(input.aimAngle) ? input.aimAngle : player.aimAngle;

    stepPlayerMovement(player, input, map, dtSec, {
      player: {
        heroClass: player.heroClass,
        dexterity: player.dexterity,
        hasteMs: player.hasteMs,
      },
    });

    player.zone = getZoneAtWorld(map, player.x, player.y);
    return { previousZone, nextZone: player.zone };
  }
}
