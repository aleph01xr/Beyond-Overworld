import { applySnapshotDelta } from '../../../shared/protocols/snapshotDelta.ts';
import type {
  ClientMessage,
  ServerMessage,
} from '../../../shared/protocols/wsProtocol.ts';
import type {
  CharacterIdentity,
  OverworldChatMessage,
  OverworldInputState,
  OverworldSnapshot,
  WorldInstanceSummary,
  WorldMapData,
} from '../../../shared/types/domain.ts';

const WS_PROTOCOL_NAME = 'beyond-overworld-v1';

export interface OverworldNetworkCallbacks {
  onLobbyUpdate: (payload: {
    instances: WorldInstanceSummary[];
    onlineCount: number;
    character: CharacterIdentity;
  }) => void;
  onInstanceJoined: (payload: {
    instanceId: string;
    playerId: string;
    map: WorldMapData;
    snapshot: OverworldSnapshot;
    chat: OverworldChatMessage[];
  }) => void;
  onInstanceLeft: () => void;
  onSnapshot: (snapshot: OverworldSnapshot) => void;
  onChatMessage: (message: OverworldChatMessage) => void;
  onRejected: (code: string, message: string) => void;
  onPingSample: (rttMs: number) => void;
  onConnectionStateChange: (state: 'connecting' | 'connected' | 'disconnected') => void;
}

/**
 * WebSocket transport client authenticating via Sec-WebSocket-Protocol
 * and reassembling server-authoritative entity-diff delta snapshots.
 */
export class OverworldNetworkClient {
  private ws: WebSocket | null = null;
  private baselineSnapshot: OverworldSnapshot | null = null;
  private lastSeq = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastInputSignature = '';
  private lastInputSentAt = 0;
  private disposed = false;

  constructor(
    private readonly token: string,
    private readonly callbacks: OverworldNetworkCallbacks
  ) {}

  connect(): void {
    if (this.disposed) return;
    this.callbacks.onConnectionStateChange('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl, [WS_PROTOCOL_NAME, this.token]);
    this.ws = ws;

    ws.onopen = () => {
      this.callbacks.onConnectionStateChange('connected');
      this.send({ type: 'lobby:subscribe', protocolVersion: 1 });
      this.startPingLoop();
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data !== 'string') return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(evt.data) as ServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'lobby:instances':
          this.callbacks.onLobbyUpdate({
            instances: msg.instances,
            onlineCount: msg.onlineCount,
            character: msg.character,
          });
          break;
        case 'instance:joined':
          this.baselineSnapshot = msg.snapshot;
          this.lastSeq = msg.snapshot.tickSeq;
          this.callbacks.onInstanceJoined({
            instanceId: msg.instanceId,
            playerId: msg.playerId,
            map: msg.map,
            snapshot: msg.snapshot,
            chat: msg.chat,
          });
          break;
        case 'instance:left':
          this.baselineSnapshot = null;
          this.lastSeq = 0;
          this.callbacks.onInstanceLeft();
          break;
        case 'instance:tick':
          this.baselineSnapshot = msg.snapshot;
          this.lastSeq = msg.seq;
          this.callbacks.onSnapshot(msg.snapshot);
          break;
        case 'instance:delta': {
          if (!this.baselineSnapshot || msg.delta.baseSeq !== this.lastSeq) {
            this.send({ type: 'instance:resync' });
            return;
          }
          const next = applySnapshotDelta(this.baselineSnapshot, msg.delta);
          this.baselineSnapshot = next;
          this.lastSeq = msg.delta.seq;
          this.callbacks.onSnapshot(next);
          break;
        }
        case 'chat:message':
          this.callbacks.onChatMessage(msg.message);
          break;
        case 'action:rejected':
          this.callbacks.onRejected(msg.code, msg.message);
          break;
        case 'error':
          this.callbacks.onRejected('PROTOCOL_ERROR', msg.message);
          break;
        case 'pong':
          this.callbacks.onPingSample(Math.max(1, Math.round(performance.now() - msg.t)));
          break;
      }
    };

    ws.onclose = () => {
      this.stopPingLoop();
      this.callbacks.onConnectionStateChange('disconnected');
    };
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  sendInput(input: OverworldInputState, seq: number, force = false): void {
    const rawStickX = typeof input.stickX === 'number' ? input.stickX : 0;
    const rawStickY = typeof input.stickY === 'number' ? input.stickY : 0;
    const stickMag = Math.hypot(rawStickX, rawStickY);
    const stickActive = stickMag > 0.05;
    const stickX = stickActive ? rawStickX : 0;
    const stickY = stickActive ? rawStickY : 0;

    const sig = `${Number(input.up)}${Number(input.down)}${Number(input.left)}${Number(
      input.right
    )}:${Number(input.attack)}:${stickX.toFixed(3)}:${stickY.toFixed(3)}:${input.aimAngle.toFixed(2)}`;

    const isMoving =
      input.up || input.down || input.left || input.right || stickActive;

    const now = performance.now();
    const signatureChanged = sig !== this.lastInputSignature;

    // When completely idle and unchanged (stop already transmitted), emit zero idle traffic
    if (!force && !isMoving && !signatureChanged) {
      return;
    }

    // While actively holding steady analog or keyboard input, keep updates synced for sequence reconciliation
    // while avoiding redundant aim-only bursts > 20 Hz when stationary
    if (!force && !isMoving && signatureChanged && now - this.lastInputSentAt < 45) {
      return;
    }

    this.lastInputSignature = sig;
    this.lastInputSentAt = now;
    this.send({
      type: 'player:input',
      input: {
        ...input,
        stickX,
        stickY,
      },
      seq,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stopPingLoop();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.send({ type: 'ping', t: performance.now() });
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping', t: performance.now() });
    }, 3000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
