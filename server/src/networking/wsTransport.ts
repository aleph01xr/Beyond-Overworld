import type { WebSocket } from 'ws';
import type { OverworldSnapshot } from '../../../shared/types/domain.ts';
import type { ServerMessage } from '../../../shared/protocols/wsProtocol.ts';

const WS_OPEN = 1;
const MAX_DROPPABLE_BUFFER_BYTES = 64 * 1024;
const MAX_HARD_BUFFER_BYTES = 512 * 1024;

export interface AuthenticatedWsClient {
  socket: WebSocket;
  accountId: string;
  username: string;
  instanceId: string | null;
  playerId: string | null;
  lastAckBaseline: OverworldSnapshot | null;
  lastSentSeq: number;
}

export function sendFrame(ws: WebSocket, msg: ServerMessage): boolean {
  if (ws.readyState !== WS_OPEN) return false;
  if (ws.bufferedAmount > MAX_HARD_BUFFER_BYTES) {
    ws.close(1008, 'Send buffer saturated');
    return false;
  }
  ws.send(JSON.stringify(msg));
  return true;
}

export function sendDroppableFrame(ws: WebSocket, msg: ServerMessage): boolean {
  if (ws.readyState !== WS_OPEN) return false;
  if (ws.bufferedAmount > MAX_HARD_BUFFER_BYTES) {
    ws.close(1008, 'Send buffer saturated');
    return false;
  }
  if (ws.bufferedAmount > MAX_DROPPABLE_BUFFER_BYTES) {
    return false;
  }
  ws.send(JSON.stringify(msg));
  return true;
}

/**
 * O(instanceSize) per-instance client registry matching ARCHITECTURE.md Section 6.1
 * to keep 100-player instance broadcasts decoupled from global connection count.
 */
export class InstanceClientIndex {
  private readonly clientsByInstance = new Map<string, Set<AuthenticatedWsClient>>();
  private readonly lobbySubscribers = new Set<AuthenticatedWsClient>();

  addLobbySubscriber(client: AuthenticatedWsClient): void {
    this.lobbySubscribers.add(client);
  }

  removeLobbySubscriber(client: AuthenticatedWsClient): void {
    this.lobbySubscribers.delete(client);
  }

  getLobbySubscribers(): ReadonlySet<AuthenticatedWsClient> {
    return this.lobbySubscribers;
  }

  assignToInstance(client: AuthenticatedWsClient, instanceId: string): void {
    this.removeFromInstance(client);
    client.instanceId = instanceId;
    let bucket = this.clientsByInstance.get(instanceId);
    if (!bucket) {
      bucket = new Set();
      this.clientsByInstance.set(instanceId, bucket);
    }
    bucket.add(client);
  }

  removeFromInstance(client: AuthenticatedWsClient): void {
    if (!client.instanceId) return;
    const bucket = this.clientsByInstance.get(client.instanceId);
    if (bucket) {
      bucket.delete(client);
      if (bucket.size === 0) {
        this.clientsByInstance.delete(client.instanceId);
      }
    }
    client.instanceId = null;
    client.playerId = null;
    client.lastAckBaseline = null;
    client.lastSentSeq = 0;
  }

  removeAll(client: AuthenticatedWsClient): void {
    this.removeLobbySubscriber(client);
    this.removeFromInstance(client);
  }

  getInstanceClients(instanceId: string): ReadonlySet<AuthenticatedWsClient> {
    return this.clientsByInstance.get(instanceId) ?? EMPTY_CLIENT_SET;
  }

  broadcastCritical(instanceId: string, msg: ServerMessage): void {
    for (const client of this.getInstanceClients(instanceId)) {
      sendFrame(client.socket, msg);
    }
  }
}

const EMPTY_CLIENT_SET: ReadonlySet<AuthenticatedWsClient> = new Set();
