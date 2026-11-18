import type {
  CharacterIdentity,
  OverworldChatMessage,
  OverworldInputState,
  OverworldPlayerState,
  OverworldSnapshot,
  WorldInstanceSummary,
  WorldMapData,
} from '../types/domain.ts';

export interface EntityPatch<T extends { id: string }> {
  id: string;
  changes: Partial<T>;
  removedKeys?: string[];
}

export interface OverworldDelta {
  seq: number;
  baseSeq: number;
  serverTimeMs: number;
  playersAdded?: OverworldPlayerState[];
  playersUpdated?: EntityPatch<OverworldPlayerState>[];
  playersRemoved?: string[];
  events?: OverworldSnapshot['events'];
  activities?: OverworldSnapshot['activities'];
}

export type ClientMessage =
  | { type: 'lobby:subscribe'; protocolVersion: number }
  | { type: 'instance:create'; name: string }
  | { type: 'instance:join'; instanceId: string }
  | { type: 'instance:leave' }
  | { type: 'instance:resync' }
  | { type: 'player:input'; input: OverworldInputState; seq?: number }
  | {
      type: 'player:attack_probe';
      aimAngle: number;
      kind: 'basic' | 'tactical';
    }
  | {
      type: 'player:equip_armament';
      slot: 'weapon' | 'vestment';
      itemId: string | null;
    }
  | { type: 'chat:send'; text: string }
  | { type: 'ping'; t: number };

export type ServerMessage =
  | {
      type: 'lobby:instances';
      protocolVersion: number;
      instances: WorldInstanceSummary[];
      onlineCount: number;
      character: CharacterIdentity;
    }
  | {
      type: 'instance:joined';
      protocolVersion: number;
      instanceId: string;
      playerId: string;
      map: WorldMapData;
      snapshot: OverworldSnapshot;
      chat: OverworldChatMessage[];
    }
  | { type: 'instance:tick'; snapshot: OverworldSnapshot; seq: number }
  | { type: 'instance:delta'; delta: OverworldDelta }
  | { type: 'chat:message'; message: OverworldChatMessage }
  | { type: 'instance:left' }
  | { type: 'action:rejected'; code: string; message: string }
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number; tickMs?: number };
