import type http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  SERVER_TICK_MS,
} from '../../../shared/constants/zones.ts';
import {
  cloneSnapshotBaseline,
  computeSnapshotDelta,
} from '../../../shared/protocols/snapshotDelta.ts';
import type { ServerMessage } from '../../../shared/protocols/wsProtocol.ts';
import { ClientMessageSchema } from '../../../shared/validation/schemas.ts';
import type { AuthService, AuthSession } from '../auth/authService.ts';
import type { CharacterIntegrationLayer } from '../characters/characterIntegrationAdapter.ts';
import type { WorldInstanceManager } from '../instances/worldInstanceManager.ts';
import {
  InstanceClientIndex,
  sendDroppableFrame,
  sendFrame,
  type AuthenticatedWsClient,
} from './wsTransport.ts';

const WS_PROTOCOL_NAME = 'beyond-overworld-v1';
const KEYFRAME_INTERVAL_TICKS = 80; // full snapshot keyframe every 2 seconds @ 40 Hz

function parseSubprotocolToken(headerValue: string | string[] | undefined): string | null {
  if (!headerValue) return null;
  const raw = Array.isArray(headerValue) ? headerValue.join(',') : headerValue;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts[0] !== WS_PROTOCOL_NAME) return null;
  return parts[1] ?? null;
}

export interface WsGatewayHandle {
  stop: () => Promise<void>;
}

export function attachWsGateway(options: {
  server: http.Server;
  authService: AuthService;
  characterAdapter: CharacterIntegrationLayer;
  instanceManager: WorldInstanceManager;
}): WsGatewayHandle {
  const { server, authService, characterAdapter, instanceManager } = options;
  const clientIndex = new InstanceClientIndex();
  const connectedClients = new Set<AuthenticatedWsClient>();

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      return protocols.has(WS_PROTOCOL_NAME) ? WS_PROTOCOL_NAME : false;
    },
  });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url ?? '/', 'http://localhost');
    if (reqUrl.pathname !== '/ws') {
      return;
    }

    const token = parseSubprotocolToken(req.headers['sec-websocket-protocol']);
    const session = token ? authService.validateSessionToken(token) : null;

    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, session);
    });
  });

  const broadcastLobbyState = async () => {
    const summaries = instanceManager.listSummaries();
    const onlineCount = instanceManager.getTotalConnectedPlayers();
    for (const client of clientIndex.getLobbySubscribers()) {
      const char = await characterAdapter.getCharacterByAccountId(client.accountId);
      if (!char) continue;
      sendFrame(client.socket, {
        type: 'lobby:instances',
        protocolVersion: PROTOCOL_VERSION,
        instances: summaries,
        onlineCount,
        character: char,
      });
    }
  };

  wss.on('connection', (ws: WebSocket, session: AuthSession) => {
    const client: AuthenticatedWsClient = {
      socket: ws,
      accountId: session.accountId,
      username: session.username,
      isAdmin: session.isAdmin,
      provider: session.provider,
      instanceId: null,
      playerId: null,
      lastAckBaseline: null,
      lastSentSeq: 0,
    };
    connectedClients.add(client);

    ws.on('message', async (rawData) => {
      let parsedJson: unknown;
      try {
        const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
        parsedJson = JSON.parse(text);
      } catch {
        sendFrame(ws, { type: 'error', message: 'Malformed JSON payload.' });
        return;
      }

      const validated = ClientMessageSchema.safeParse(parsedJson);
      if (!validated.success) {
        sendFrame(ws, {
          type: 'error',
          message: 'Invalid protocol message schema.',
        });
        return;
      }

      const msg = validated.data;

      if (msg.type === 'ping') {
        sendFrame(ws, { type: 'pong', t: msg.t, tickMs: SERVER_TICK_MS });
        return;
      }

      if (msg.type === 'lobby:subscribe') {
        clientIndex.addLobbySubscriber(client);
        const char = await characterAdapter.getCharacterByAccountId(client.accountId);
        if (!char) {
          sendFrame(ws, { type: 'error', message: 'Shared character identity missing.' });
          return;
        }
        sendFrame(ws, {
          type: 'lobby:instances',
          protocolVersion: PROTOCOL_VERSION,
          instances: instanceManager.listSummaries(),
          onlineCount: instanceManager.getTotalConnectedPlayers(),
          character: char,
        });
        return;
      }

      if (msg.type === 'instance:create') {
        const created = instanceManager.createInstance({ name: msg.name });
        if (!created.ok) {
          sendFrame(ws, {
            type: 'action:rejected',
            code: 'CREATE_FAILED',
            message: created.error ?? 'Could not create instance.',
          });
          return;
        }
        await broadcastLobbyState();
        return;
      }

      if (msg.type === 'instance:join') {
        const target = instanceManager.getInstance(msg.instanceId);
        if (!target) {
          sendFrame(ws, {
            type: 'action:rejected',
            code: 'INSTANCE_NOT_FOUND',
            message: 'Requested Overworld instance does not exist.',
          });
          return;
        }

        // Cleanly exit any previous instance
        if (client.instanceId && client.playerId) {
          const prev = instanceManager.getInstance(client.instanceId);
          prev?.removePlayerImmediately(client.playerId);
          clientIndex.removeFromInstance(client);
        }

        const character = await characterAdapter.getCharacterByAccountId(client.accountId);
        if (!character) {
          sendFrame(ws, { type: 'error', message: 'Character identity unavailable.' });
          return;
        }

        const joined = target.addOrReconnectPlayer(character);
        if (!joined.ok || !joined.player) {
          sendFrame(ws, {
            type: 'action:rejected',
            code: 'INSTANCE_FULL',
            message: joined.error ?? 'Could not join instance.',
          });
          return;
        }

        clientIndex.removeLobbySubscriber(client);
        clientIndex.assignToInstance(client, target.instanceId);
        client.playerId = joined.player.id;

        const snapshot = target.toSnapshot(false);
        client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
        client.lastSentSeq = snapshot.tickSeq;

        sendFrame(ws, {
          type: 'instance:joined',
          protocolVersion: PROTOCOL_VERSION,
          instanceId: target.instanceId,
          playerId: joined.player.id,
          map: target.map,
          snapshot,
          chat: target.getChatHistory(),
        });
        await broadcastLobbyState();
        return;
      }

      if (msg.type === 'instance:leave') {
        if (client.instanceId && client.playerId) {
          const current = instanceManager.getInstance(client.instanceId);
          current?.removePlayerImmediately(client.playerId);
          clientIndex.removeFromInstance(client);
        }
        clientIndex.addLobbySubscriber(client);
        sendFrame(ws, { type: 'instance:left' });
        await broadcastLobbyState();
        return;
      }

      if (!client.instanceId || !client.playerId) {
        sendFrame(ws, {
          type: 'action:rejected',
          code: 'NOT_IN_INSTANCE',
          message: 'Join an Overworld instance first.',
        });
        return;
      }

      const instance = instanceManager.getInstance(client.instanceId);
      if (!instance) return;

      if (msg.type === 'instance:resync') {
        const snapshot = instance.toSnapshot(false);
        client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
        client.lastSentSeq = snapshot.tickSeq;
        sendFrame(ws, {
          type: 'instance:tick',
          snapshot,
          seq: snapshot.tickSeq,
        });
        return;
      }

      if (msg.type === 'player:input') {
        instance.setPlayerInput(client.playerId, msg.input, msg.seq);
        return;
      }

      if (msg.type === 'player:attack_probe') {
        const feedback = instance.handleAttackProbe(
          client.playerId,
          msg.kind,
          msg.aimAngle
        );
        if (!feedback.ok) {
          sendFrame(ws, {
            type: 'action:rejected',
            code: feedback.code ?? 'ATTACK_REJECTED',
            message: feedback.message ?? 'Attack blocked.',
          });
        }
        return;
      }

      if (msg.type === 'player:equip_armament') {
        const feedback = await instance.handleEquipArmament(
          client.playerId,
          msg.slot,
          msg.itemId,
          characterAdapter
        );
        if (!feedback.ok) {
          sendFrame(ws, {
            type: 'action:rejected',
            code: feedback.code ?? 'EQUIP_REJECTED',
            message: feedback.message ?? 'Armament switch blocked.',
          });
        }
        return;
      }

      if (msg.type === 'chat:send') {
        const chatMsg = instance.addChatMessage(client.playerId, msg.text);
        if (chatMsg) {
          const payload: ServerMessage = { type: 'chat:message', message: chatMsg };
          clientIndex.broadcastCritical(instance.instanceId, payload);
        }
      }
    });

    ws.on('close', () => {
      connectedClients.delete(client);
      if (client.instanceId && client.playerId) {
        const inst = instanceManager.getInstance(client.instanceId);
        inst?.markDisconnected(client.playerId);
      }
      clientIndex.removeAll(client);
      void broadcastLobbyState();
    });
  });

  // Drift-free 40 Hz simulation & entity-diff broadcast loop
  let running = true;
  let lastStepMs = Date.now();
  let tickTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleTick = () => {
    if (!running) return;
    const now = Date.now();
    const dtMs = Math.max(1, Math.min(100, now - lastStepMs));
    lastStepMs = now;

    instanceManager.stepAll(dtMs);

    for (const instance of instanceManager.listInstances()) {
      const clients = clientIndex.getInstanceClients(instance.instanceId);
      if (clients.size === 0) continue;

      const snapshot = instance.toSnapshot(true);
      const sendFullKeyframe = snapshot.tickSeq % KEYFRAME_INTERVAL_TICKS === 0;

      for (const client of clients) {
        if (!client.lastAckBaseline || sendFullKeyframe) {
          const sent = sendDroppableFrame(client.socket, {
            type: 'instance:tick',
            snapshot,
            seq: snapshot.tickSeq,
          });
          if (sent) {
            client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
            client.lastSentSeq = snapshot.tickSeq;
          }
          continue;
        }

        const delta = computeSnapshotDelta(
          client.lastAckBaseline,
          snapshot,
          client.lastSentSeq,
          snapshot.tickSeq
        );

        const hasChanges =
          Boolean(delta.playersAdded?.length) ||
          Boolean(delta.playersUpdated?.length) ||
          Boolean(delta.playersRemoved?.length) ||
          Boolean(delta.events?.length) ||
          Boolean(delta.activities);

        if (!hasChanges) continue;

        const sent = sendDroppableFrame(client.socket, {
          type: 'instance:delta',
          delta,
        });
        if (sent) {
          client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
          client.lastSentSeq = snapshot.tickSeq;
        }
      }
    }

    const elapsed = Date.now() - now;
    const delay = Math.max(4, SERVER_TICK_MS - elapsed);
    tickTimer = setTimeout(scheduleTick, delay);
  };

  tickTimer = setTimeout(scheduleTick, SERVER_TICK_MS);

  return {
    stop: async () => {
      running = false;
      if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
      for (const client of connectedClients) {
        client.socket.close(1001, 'Server shutting down');
      }
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}
