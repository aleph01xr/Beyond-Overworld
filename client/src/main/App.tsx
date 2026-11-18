import React, { useEffect, useRef, useState } from 'react';
import type {
  CharacterIdentity,
  OverworldChatMessage,
  OverworldSnapshot,
  WorldInstanceSummary,
  WorldMapData,
} from '../../../shared/types/domain.ts';
import { OverworldNetworkClient } from '../networking/networkClient.ts';
import { AuthScreen } from '../ui/AuthScreen.tsx';
import { InstanceLobby } from '../ui/InstanceLobby.tsx';
import { OverworldHud } from '../ui/OverworldHud.tsx';

const TOKEN_STORAGE_KEY = 'beyond_overworld_token';

interface ActiveInstanceSession {
  instanceId: string;
  playerId: string;
  map: WorldMapData;
  snapshot: OverworldSnapshot;
}

export const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [character, setCharacter] = useState<CharacterIdentity | null>(null);
  const [instances, setInstances] = useState<WorldInstanceSummary[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('disconnected');
  const [activeSession, setActiveSession] = useState<ActiveInstanceSession | null>(null);
  const [chatMessages, setChatMessages] = useState<OverworldChatMessage[]>([]);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  const networkRef = useRef<OverworldNetworkClient | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = (message: string) => {
    setActionBanner(message);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      setActionBanner(null);
    }, 3200);
  };

  // Validate stored session token on startup
  useEffect(() => {
    if (!token || character) return;
    let cancelled = false;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Invalid session');
        return (await res.json()) as { character: CharacterIdentity };
      })
      .then((data) => {
        if (!cancelled) {
          setCharacter(data.character);
        }
      })
      .catch(() => {
        if (!cancelled) {
          try {
            window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          } catch {
            // ignore storage failure
          }
          setToken(null);
          setCharacter(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, character]);

  // Connect authenticated WebSocket transport once session & character are established
  useEffect(() => {
    if (!token || !character) return;

    const client = new OverworldNetworkClient(token, {
      onLobbyUpdate: (payload) => {
        setInstances(payload.instances);
        setOnlineCount(payload.onlineCount);
        setCharacter(payload.character);
      },
      onInstanceJoined: (payload) => {
        setActiveSession({
          instanceId: payload.instanceId,
          playerId: payload.playerId,
          map: payload.map,
          snapshot: payload.snapshot,
        });
        setChatMessages(payload.chat);
      },
      onInstanceLeft: () => {
        setActiveSession(null);
        setChatMessages([]);
      },
      onSnapshot: (snap) => {
        setActiveSession((prev) =>
          prev && prev.instanceId === snap.instanceId
            ? { ...prev, snapshot: snap }
            : prev
        );
      },
      onChatMessage: (msg) => {
        setChatMessages((prev) => [...prev.slice(-59), msg]);
      },
      onRejected: (_code, message) => {
        showBanner(message);
      },
      onPingSample: (rtt) => {
        setPingMs(rtt);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
    });

    networkRef.current = client;
    client.connect();

    return () => {
      client.dispose();
      networkRef.current = null;
    };
  }, [token, Boolean(character)]);

  const handleAuthenticated = (payload: {
    token: string;
    character: CharacterIdentity;
  }) => {
    try {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
    } catch {
      // ignore storage failure
    }
    setToken(payload.token);
    setCharacter(payload.character);
  };

  const handleLogout = async () => {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    try {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore storage failure
    }
    networkRef.current?.dispose();
    networkRef.current = null;
    setActiveSession(null);
    setCharacter(null);
    setToken(null);
  };

  if (!token || !character) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (activeSession && networkRef.current) {
    return (
      <OverworldHud
        map={activeSession.map}
        playerId={activeSession.playerId}
        snapshot={activeSession.snapshot}
        chat={chatMessages}
        pingMs={pingMs}
        actionBanner={actionBanner}
        network={networkRef.current}
        onLeaveInstance={() => {
          networkRef.current?.send({ type: 'instance:leave' });
        }}
      />
    );
  }

  return (
    <InstanceLobby
      character={character}
      instances={instances}
      onlineCount={onlineCount}
      connectionState={connectionState}
      errorBanner={actionBanner}
      onJoinInstance={(instanceId) =>
        networkRef.current?.send({ type: 'instance:join', instanceId })
      }
      onCreateInstance={(name) =>
        networkRef.current?.send({ type: 'instance:create', name })
      }
      onLogout={handleLogout}
    />
  );
};

export default App;
