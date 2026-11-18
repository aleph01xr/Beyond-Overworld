import {
  getZoneAtWorld,
  stepPlayerMovement,
} from '../../../../shared/movement/playerMovement.ts';
import type {
  OverworldInputState,
  OverworldPlayerState,
  WorldMapData,
} from '../../../../shared/types/domain.ts';

interface PendingPredictionStep {
  seq: number;
  input: OverworldInputState;
  dtSec: number;
}

/**
 * Deterministic client-side movement prediction with sequence-based server reconciliation
 * mirroring Beyond: Dungeons (ARCHITECTURE.md Section 5.1).
 */
export class LocalPredictionController {
  private nextSeq = 1;
  private pendingSteps: PendingPredictionStep[] = [];
  private simEntity: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    heroClass: OverworldPlayerState['heroClass'];
    dexterity: number;
    hasteMs: number;
  } | null = null;

  private renderOffsetX = 0;
  private renderOffsetY = 0;
  private lastAckedSeq = 0;

  reset(player?: OverworldPlayerState): void {
    this.pendingSteps = [];
    this.renderOffsetX = 0;
    this.renderOffsetY = 0;
    if (player) {
      this.simEntity = {
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        heroClass: player.heroClass,
        dexterity: player.dexterity,
        hasteMs: player.hasteMs,
      };
      this.lastAckedSeq = player.lastInputSeq ?? 0;
      this.nextSeq = Math.max(this.nextSeq, this.lastAckedSeq + 1);
    } else {
      this.simEntity = null;
      this.lastAckedSeq = 0;
    }
  }

  allocateSeq(): number {
    return this.nextSeq++;
  }

  predictStep(
    seq: number,
    input: OverworldInputState,
    dtSec: number,
    map: WorldMapData,
    serverLocalPlayer: OverworldPlayerState
  ): void {
    if (!this.simEntity) {
      this.reset(serverLocalPlayer);
    }
    if (!this.simEntity) return;

    this.simEntity.heroClass = serverLocalPlayer.heroClass;
    this.simEntity.dexterity = serverLocalPlayer.dexterity;
    this.simEntity.hasteMs = serverLocalPlayer.hasteMs;

    stepPlayerMovement(this.simEntity, input, map, dtSec, {
      player: this.simEntity,
    });

    this.pendingSteps.push({
      seq,
      input: { ...input },
      dtSec,
    });

    // Guard unbounded history growth if server ack stalls
    if (this.pendingSteps.length > 180) {
      this.pendingSteps.shift();
    }
  }

  reconcileWithServer(
    serverLocalPlayer: OverworldPlayerState,
    map: WorldMapData
  ): void {
    const ackSeq = serverLocalPlayer.lastInputSeq ?? 0;
    if (!this.simEntity) {
      this.reset(serverLocalPlayer);
      return;
    }

    const prevX = this.simEntity.x;
    const prevY = this.simEntity.y;

    this.pendingSteps = this.pendingSteps.filter((step) => step.seq > ackSeq);
    this.lastAckedSeq = ackSeq;

    const recon = {
      x: serverLocalPlayer.x,
      y: serverLocalPlayer.y,
      vx: serverLocalPlayer.vx,
      vy: serverLocalPlayer.vy,
      heroClass: serverLocalPlayer.heroClass,
      dexterity: serverLocalPlayer.dexterity,
      hasteMs: serverLocalPlayer.hasteMs,
    };

    for (const step of this.pendingSteps) {
      stepPlayerMovement(recon, step.input, map, step.dtSec, {
        player: recon,
      });
    }

    this.simEntity = recon;

    const errX = recon.x - prevX;
    const errY = recon.y - prevY;
    const errDist = Math.hypot(errX, errY);

    if (errDist > 120) {
      this.renderOffsetX = 0;
      this.renderOffsetY = 0;
    } else if (errDist > 0.35) {
      this.renderOffsetX -= errX;
      this.renderOffsetY -= errY;
    }
  }

  decayVisualOffset(dtSec: number): void {
    const decay = Math.exp(-16 * Math.max(0, dtSec));
    this.renderOffsetX *= decay;
    this.renderOffsetY *= decay;
    if (Math.abs(this.renderOffsetX) < 0.05) this.renderOffsetX = 0;
    if (Math.abs(this.renderOffsetY) < 0.05) this.renderOffsetY = 0;
  }

  getPredictedPose(
    serverLocalPlayer: OverworldPlayerState,
    map: WorldMapData
  ): OverworldPlayerState {
    if (!this.simEntity) {
      return serverLocalPlayer;
    }
    const x = this.simEntity.x + this.renderOffsetX;
    const y = this.simEntity.y + this.renderOffsetY;
    return {
      ...serverLocalPlayer,
      x,
      y,
      vx: this.simEntity.vx,
      vy: this.simEntity.vy,
      zone: getZoneAtWorld(map, x, y),
    };
  }
}
