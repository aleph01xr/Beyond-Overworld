import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BASE_ARMAMENTS,
  HERO_CLASSES,
  MAX_LEVEL,
  getDefaultVestmentId,
  getDefaultWeaponId,
} from '../../../shared/constants/classes.ts';
import { OVERWORLD_ZONES } from '../../../shared/constants/zones.ts';
import { hasMovementInput } from '../../../shared/movement/playerMovement.ts';
import type {
  OverworldChatMessage,
  OverworldInputState,
  OverworldPlayerState,
  OverworldSnapshot,
  WorldMapData,
} from '../../../shared/types/domain.ts';
import {
  renderOverworldFrame,
  type ActiveCalloutVisual,
} from '../game/rendering/worldRenderer.ts';
import { LocalPredictionController } from '../game/world/prediction.ts';
import type { OverworldNetworkClient } from '../networking/networkClient.ts';
import { PixelHeroPreview } from './PixelHeroPreview.tsx';
import {
  TouchControls,
  loadSavedTouchSettings,
  saveTouchSettings,
  type TouchSettings,
} from './TouchControls.tsx';
import { TouchSettingsModal } from './TouchSettingsModal.tsx';

interface OverworldHudProps {
  map: WorldMapData;
  playerId: string;
  snapshot: OverworldSnapshot;
  chat: OverworldChatMessage[];
  pingMs: number | null;
  actionBanner: string | null;
  network: OverworldNetworkClient;
  onLeaveInstance: () => void;
}

const FORCE_TOUCH_KEY = 'beyond_overworld_force_touch';

function loadForceTouchPref(): boolean {
  try {
    return localStorage.getItem(FORCE_TOUCH_KEY) === 'true';
  } catch {
    return false;
  }
}

export const OverworldHud: React.FC<OverworldHudProps> = ({
  map,
  playerId,
  snapshot,
  chat,
  pingMs,
  actionBanner,
  network,
  onLeaveInstance,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const predictionRef = useRef(new LocalPredictionController());
  const snapshotRef = useRef<OverworldSnapshot>(snapshot);
  const mapRef = useRef<WorldMapData>(map);
  const calloutsRef = useRef<ActiveCalloutVisual[]>([]);

  const keysRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    attack: false,
  });
  const stickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const aimAngleRef = useRef(0);
  const aimSourceRef = useRef<'mouse' | 'directional'>('directional');
  const hasMouseMovedRef = useRef(false);
  const wasMovingRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  const [armamentOpen, setArmamentOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  const [touchSettings, setTouchSettings] = useState<TouchSettings>(
    loadSavedTouchSettings
  );
  const [forceTouchGamepad, setForceTouchGamepad] = useState<boolean>(
    loadForceTouchPref
  );
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  snapshotRef.current = snapshot;
  mapRef.current = map;

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches;
      setIsTouchDevice(hasTouch);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  const showTouchControls = isTouchDevice || forceTouchGamepad;
  const controlsBlocked = settingsOpen || armamentOpen;

  const updateTouchSettings = (next: TouchSettings) => {
    setTouchSettings(next);
    saveTouchSettings(next);
  };

  const toggleForceTouch = (val: boolean) => {
    setForceTouchGamepad(val);
    try {
      localStorage.setItem(FORCE_TOUCH_KEY, String(val));
    } catch {
      // ignore storage failure
    }
  };

  const serverLocalPlayer =
    snapshot.players.find((p) => p.id === playerId) ?? snapshot.players[0];

  const transmitStopInput = useCallback(() => {
    keysRef.current = {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
    };
    stickRef.current = { x: 0, y: 0 };
    const stopped: OverworldInputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: aimAngleRef.current,
      stickX: 0,
      stickY: 0,
    };
    const srvLocal =
      snapshotRef.current.players.find((p) => p.id === playerId) ??
      snapshotRef.current.players[0];
    if (srvLocal) {
      const seq = predictionRef.current.allocateSeq();
      predictionRef.current.predictStep(seq, stopped, 0.016, mapRef.current, srvLocal);
      network.sendInput(stopped, seq, true);
    } else {
      network.sendInput(stopped, 0, true);
    }
    wasMovingRef.current = false;
  }, [network, playerId]);

  // Reconcile movement & queue floating callouts whenever server snapshots arrive
  useEffect(() => {
    const srvLocal = snapshot.players.find((p) => p.id === playerId);
    if (srvLocal) {
      predictionRef.current.reconcileWithServer(srvLocal, map);
    }
    if (snapshot.events.length > 0) {
      const now = performance.now();
      for (const evt of snapshot.events) {
        calloutsRef.current.push({
          ...evt,
          createdAtMs: now,
          durationMs: 1400,
        });
      }
      if (calloutsRef.current.length > 32) {
        calloutsRef.current = calloutsRef.current.slice(-32);
      }
    }
  }, [snapshot, playerId, map]);

  // Reset prediction when entering a new instance & release inputs on unmount
  useEffect(() => {
    const initialLocal = snapshotRef.current.players.find((p) => p.id === playerId);
    predictionRef.current.reset(initialLocal);
    return () => {
      keysRef.current = {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
      };
      stickRef.current = { x: 0, y: 0 };
    };
  }, [map.mapId, playerId]);

  // Release held movement inputs immediately if blocking modal opens
  useEffect(() => {
    if (controlsBlocked) {
      transmitStopInput();
    }
  }, [controlsBlocked, transmitStopInput]);

  // Desktop keyboard input handlers matching Beyond: Dungeons GameCanvas.tsx
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
    };

    const syncDirectionalAimFromKeys = () => {
      const mx = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
      const my = (keysRef.current.down ? 1 : 0) - (keysRef.current.up ? 1 : 0);
      if (mx === 0 && my === 0) return;
      if (aimSourceRef.current === 'mouse' && hasMouseMovedRef.current) return;
      aimSourceRef.current = 'directional';
      aimAngleRef.current = Math.atan2(my, mx);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !isTypingTarget(e.target) && !controlsBlocked) {
        e.preventDefault();
        transmitStopInput();
        setChatOpen(true);
        setTimeout(() => chatInputRef.current?.focus(), 0);
        return;
      }

      if (isTypingTarget(e.target)) {
        if (e.code === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.code === 'Escape') {
        setSettingsOpen(false);
        setArmamentOpen(false);
        setActivitiesOpen(false);
        setPlayersOpen(false);
        return;
      }

      const k = e.key.toLowerCase();

      if (k === 'i' && !e.repeat) {
        setArmamentOpen((v) => !v);
        return;
      }
      if (k === 'm' && !e.repeat) {
        setActivitiesOpen((v) => !v);
        return;
      }

      if (controlsBlocked) return;

      if (k === 'w' || e.key === 'ArrowUp') {
        if (e.key === 'ArrowUp') e.preventDefault();
        keysRef.current.up = true;
        syncDirectionalAimFromKeys();
      } else if (k === 's' || e.key === 'ArrowDown') {
        if (e.key === 'ArrowDown') e.preventDefault();
        keysRef.current.down = true;
        syncDirectionalAimFromKeys();
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        if (e.key === 'ArrowLeft') e.preventDefault();
        keysRef.current.left = true;
        syncDirectionalAimFromKeys();
      } else if (k === 'd' || e.key === 'ArrowRight') {
        if (e.key === 'ArrowRight') e.preventDefault();
        keysRef.current.right = true;
        syncDirectionalAimFromKeys();
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        keysRef.current.attack = true;
        network.send({
          type: 'player:attack_probe',
          aimAngle: aimAngleRef.current,
          kind: 'basic',
        });
      } else if (k === 'q' && !e.repeat) {
        network.send({
          type: 'player:attack_probe',
          aimAngle: aimAngleRef.current,
          kind: 'tactical',
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') {
        keysRef.current.up = false;
        syncDirectionalAimFromKeys();
      } else if (k === 's' || e.key === 'ArrowDown') {
        keysRef.current.down = false;
        syncDirectionalAimFromKeys();
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        keysRef.current.left = false;
        syncDirectionalAimFromKeys();
      } else if (k === 'd' || e.key === 'ArrowRight') {
        keysRef.current.right = false;
        syncDirectionalAimFromKeys();
      } else if (e.code === 'Space') {
        keysRef.current.attack = false;
      }
    };

    const onBlur = () => transmitStopInput();
    const onVisibility = () => {
      if (document.hidden) transmitStopInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [controlsBlocked, network, transmitStopInput]);

  // 60 FPS Canvas animation + client movement prediction & analog/keyboard networking loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const dtSec = Math.max(0.001, Math.min(0.05, (now - lastTime) / 1000));
      lastTime = now;

      const currentSnap = snapshotRef.current;
      const currentMap = mapRef.current;
      const srvLocal =
        currentSnap.players.find((p) => p.id === playerId) ?? currentSnap.players[0];

      if (srvLocal) {
        const input: OverworldInputState = {
          up: keysRef.current.up,
          down: keysRef.current.down,
          left: keysRef.current.left,
          right: keysRef.current.right,
          attack: keysRef.current.attack,
          aimAngle: aimAngleRef.current,
          stickX: stickRef.current.x,
          stickY: stickRef.current.y,
        };

        const activeMovement = hasMovementInput(input);

        if (activeMovement || wasMovingRef.current) {
          const seq = predictionRef.current.allocateSeq();
          predictionRef.current.predictStep(seq, input, dtSec, currentMap, srvLocal);
          network.sendInput(input, seq, !activeMovement);
          wasMovingRef.current = activeMovement;
        } else {
          // Idle: let networkClient decide if aim changed significantly, zero idle spam
          network.sendInput(input, 0, false);
        }

        predictionRef.current.decayVisualOffset(dtSec);

        const localPose: OverworldPlayerState = predictionRef.current.getPredictedPose(
          srvLocal,
          currentMap
        );

        calloutsRef.current = calloutsRef.current.filter(
          (c) => now - c.createdAtMs < c.durationMs
        );

        renderOverworldFrame({
          ctx,
          width: window.innerWidth,
          height: window.innerHeight,
          map: currentMap,
          snapshot: currentSnap,
          localPlayer: localPose,
          callouts: calloutsRef.current,
          nowMs: now,
        });
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [network, playerId]);

  const handleStickMove = useCallback(
    (stickX: number, stickY: number, aimAngle?: number) => {
      stickRef.current = { x: stickX, y: stickY };
      if (typeof aimAngle === 'number' && Number.isFinite(aimAngle)) {
        aimSourceRef.current = 'directional';
        aimAngleRef.current = aimAngle;
      }
      // If joystick released cleanly to 0, transmit stop packet right away even before next rAF
      if (Math.hypot(stickX, stickY) <= 0.05 && wasMovingRef.current) {
        const stopped: OverworldInputState = {
          up: keysRef.current.up,
          down: keysRef.current.down,
          left: keysRef.current.left,
          right: keysRef.current.right,
          attack: keysRef.current.attack,
          aimAngle: aimAngleRef.current,
          stickX: 0,
          stickY: 0,
        };
        const srvLocal =
          snapshotRef.current.players.find((p) => p.id === playerId) ??
          snapshotRef.current.players[0];
        if (srvLocal) {
          const seq = predictionRef.current.allocateSeq();
          predictionRef.current.predictStep(seq, stopped, 0.016, mapRef.current, srvLocal);
          network.sendInput(stopped, seq, true);
        }
        wasMovingRef.current = hasMovementInput(stopped);
      }
    },
    [network, playerId]
  );

  const handleTouchAttackProbe = useCallback(
    (kind: 'basic' | 'tactical', angle: number) => {
      network.send({
        type: 'player:attack_probe',
        aimAngle: angle,
        kind,
      });
    },
    [network]
  );

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    hasMouseMovedRef.current = true;
    aimSourceRef.current = 'mouse';
    aimAngleRef.current = Math.atan2(e.clientY - cy, e.clientX - cx);
  };

  const handleCanvasClick = () => {
    if (controlsBlocked) return;
    network.send({
      type: 'player:attack_probe',
      aimAngle: aimAngleRef.current,
      kind: 'basic',
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    network.send({ type: 'chat:send', text: trimmed });
    setChatText('');
    chatInputRef.current?.blur();
  };

  const handleCopyShardId = () => {
    navigator.clipboard?.writeText(snapshot.instanceId).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  const handleLeave = () => {
    transmitStopInput();
    onLeaveInstance();
  };

  if (!serverLocalPlayer) {
    return null;
  }

  const classDef = HERO_CLASSES[serverLocalPlayer.heroClass];
  const zoneMeta = OVERWORLD_ZONES[serverLocalPlayer.zone];
  const defaultWeaponId = getDefaultWeaponId(serverLocalPlayer.heroClass);
  const defaultVestmentId = getDefaultVestmentId(serverLocalPlayer.heroClass);
  const activeSkillId = serverLocalPlayer.activeTacticalSkillId;
  const activeCooldownMs = activeSkillId
    ? serverLocalPlayer.tacticalCooldownsMs[activeSkillId] ?? 0
    : 0;
  const activeCooldownSec = Math.ceil(activeCooldownMs / 1000);

  const anyWeaponCooldownMs =
    serverLocalPlayer.tacticalCooldownsMs[
      `tac_${serverLocalPlayer.heroClass}_bulwark_dash`
    ] ??
    serverLocalPlayer.tacticalCooldownsMs[
      `tac_${serverLocalPlayer.heroClass}_frost_volley`
    ] ??
    serverLocalPlayer.tacticalCooldownsMs[
      `tac_${serverLocalPlayer.heroClass}_astral_nova`
    ] ??
    serverLocalPlayer.tacticalCooldownsMs[
      `tac_${serverLocalPlayer.heroClass}_sanctified_pulse`
    ] ??
    0;

  const canSwitchArmament =
    serverLocalPlayer.zone === 'safe' &&
    !serverLocalPlayer.inCombat &&
    serverLocalPlayer.combatLockRemainingMs <= 0;

  const hpPct = Math.max(
    0,
    Math.min(100, (serverLocalPlayer.hp / Math.max(1, serverLocalPlayer.maxHp)) * 100)
  );

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#181820]">
      {/* Full-viewport World Canvas */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleCanvasMouseMove}
        onClick={handleCanvasClick}
        className="block w-full h-full pixel-canvas touch-none cursor-crosshair"
      />

      {/* TOP HEADER HUD (Parity with Beyond: Dungeons DungeonRunView.tsx) */}
      <header className="pointer-events-none fixed top-0 inset-x-0 z-10 flex items-center justify-between gap-1.5 sm:gap-2 px-1.5 sm:px-5 py-1.5 sm:py-3 bg-gradient-to-b from-[#111219]/90 to-transparent pt-safe">
        {/* Left: Instance Name · Level · Authoritative Zone · Online Count */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-sm font-mono tabular-nums text-[#D4D2E0] min-w-0">
          <span className="font-display text-xs sm:text-base text-white font-semibold truncate max-w-[110px] sm:max-w-none">
            {snapshot.instanceName}
          </span>
          <span aria-hidden="true" className="text-[#78768A]">
            ·
          </span>
          <span className="text-[#FCD34D] font-bold whitespace-nowrap">
            {serverLocalPlayer.level >= MAX_LEVEL
              ? 'MAX'
              : `Lv.${serverLocalPlayer.level}`}
          </span>
          <span aria-hidden="true" className="text-[#78768A]">
            ·
          </span>
          <span
            className="font-display text-[11px] sm:text-sm font-semibold whitespace-nowrap"
            style={{ color: zoneMeta.accentColor }}
          >
            {zoneMeta.label}
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-[#78768A]">
            ·
          </span>
          <span className="hidden sm:inline text-[#BDBACF] whitespace-nowrap">
            {snapshot.players.length}/100 Online
          </span>
        </div>

        {/* Right: Organized HUD Action Groups */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 overflow-x-auto custom-scrollbar max-w-[65vw] sm:max-w-none shrink-0 py-0.5 font-mono">
          {/* Group 1: Overworld Gameplay Shortcuts ([M] Map/Activities, [I] Armament, Chat) */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-[#171622]/90 p-0.5 sm:p-1 border border-[#353442]">
            <button
              type="button"
              onClick={() => setActivitiesOpen((v) => !v)}
              className="stone-button stone-button-gold text-[9px] sm:text-xs py-0.5 px-1.5 sm:py-1 sm:px-2.5 whitespace-nowrap"
              title="Open Overworld Activities & Regions [M]"
            >
              <span className="hidden sm:inline">[M] Activities</span>
              <span className="sm:hidden">Act</span>
            </button>

            <button
              type="button"
              onClick={() => setArmamentOpen((v) => !v)}
              className="stone-button stone-button-dark text-[9px] sm:text-xs py-0.5 px-1.5 sm:py-1 sm:px-2.5 whitespace-nowrap"
              title="Open Shared Armament Slots [I]"
            >
              <span className="hidden sm:inline">[I] Armament</span>
              <span className="sm:hidden">Arm</span>
            </button>

            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              className="stone-button stone-button-dark text-[9px] sm:text-xs py-0.5 px-1.5 sm:py-1 sm:px-2.5 whitespace-nowrap"
              title="Toggle Instance Chat [Enter]"
            >
              Chat ({chat.length})
            </button>
          </div>

          {/* Group 2: Ping, Shard ID, Touch/Display Settings, Lobby Leave */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-[#171622]/90 p-0.5 sm:p-1 border border-[#353442]">
            <div
              className="hidden sm:flex items-center gap-1 px-2 py-1 bg-[#1E1E2A] border border-[#353442] text-[10px] text-[#E6E4EE]"
              title="Server round-trip latency"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  pingMs === null
                    ? 'bg-[#64748B]'
                    : pingMs < 80
                    ? 'bg-emerald-400'
                    : pingMs < 180
                    ? 'bg-amber-400'
                    : 'bg-rose-500 animate-pulse'
                }`}
              />
              <span className="tabular-nums">{pingMs !== null ? `${pingMs}ms` : '--'}</span>
            </div>

            <button
              type="button"
              onClick={handleCopyShardId}
              title="Copy Shard Instance ID"
              className="hidden md:flex stone-button stone-button-dark text-[9px] sm:text-[10px] py-0.5 px-1.5 sm:py-1 sm:px-2 whitespace-nowrap"
            >
              {copiedId ? 'Copied!' : snapshot.instanceId}
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="stone-button stone-button-dark text-[9px] sm:text-xs py-0.5 px-1.5 sm:py-1 sm:px-2.5 whitespace-nowrap"
              title="Touch & Display Settings"
            >
              Settings
            </button>

            <button
              type="button"
              onClick={handleLeave}
              className="stone-button stone-button-gold text-[9px] sm:text-xs py-0.5 px-2 sm:py-1 sm:px-3 text-black font-bold whitespace-nowrap"
              title="Return to World Shard Lobby"
            >
              Lobby
            </button>
          </div>
        </div>
      </header>

      {/* Action / Rule Rejection Notice Banner */}
      {actionBanner && (
        <div
          role="status"
          className="pointer-events-none fixed top-12 sm:top-16 left-1/2 -translate-x-1/2 z-40 max-w-md w-[92vw] px-3.5 py-2 bg-[#1D1C2B]/95 border border-[#D9AA52]/80 text-xs font-mono text-[#FDE68A] shadow-xl text-center"
        >
          {actionBanner}
        </div>
      )}

      {/* Collapsible Players List Toggle (Parity with Party Dropdown in DungeonRunView) */}
      <div className="pointer-events-auto fixed top-10 sm:top-14 left-1.5 sm:left-5 z-30">
        <button
          type="button"
          onClick={() => setPlayersOpen((v) => !v)}
          className="px-2 py-1 sm:px-2.5 sm:py-1.5 bg-[#1A1A24]/95 border border-[#38364C] hover:border-[#D9AA52] font-mono text-[10px] sm:text-xs text-[#E6E4EE] transition-colors whitespace-nowrap shadow-md flex items-center gap-1 cursor-pointer min-h-[28px] sm:min-h-[34px]"
        >
          <span>Players ({snapshot.players.length})</span>
          <span className="text-[9px] sm:text-[10px] text-[#FCD34D]">
            {playersOpen ? '▴' : '▾'}
          </span>
        </button>

        {playersOpen && (
          <aside className="mt-1 space-y-1 w-48 sm:w-60 max-h-[38dvh] overflow-y-auto custom-scrollbar bg-[#1A1A24]/95 border border-[#323044] p-1.5 sm:p-2 shadow-2xl">
            {snapshot.players.map((p) => {
              const pClass = HERO_CLASSES[p.heroClass];
              const pPct = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
              return (
                <div
                  key={p.id}
                  className={`bg-[#242332] border px-2 py-1.5 space-y-1 ${
                    !p.connected ? 'border-[#6E2932] opacity-75' : 'border-[#3E3C50]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs">
                    <span className="font-display text-xs text-white truncate">
                      {p.username} {p.id === playerId ? '(You)' : ''}
                    </span>
                    <span className="font-mono text-[9px] text-[#B3B1C4] whitespace-nowrap">
                      {!p.connected ? 'RECONN' : pClass.name}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#171622] overflow-hidden">
                    <div
                      style={{ width: `${pPct}%` }}
                      className="h-full bg-[#22C55E]"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-[#A6A4B8]">
                    <span>{OVERWORLD_ZONES[p.zone].label}</span>
                    <span>Lv.{p.level}</span>
                  </div>
                </div>
              );
            })}
          </aside>
        )}
      </div>

      {/* Dedicated Fixed Player Identity, HP & Zone Status Card */}
      <div className="pointer-events-auto fixed top-[74px] sm:top-[94px] left-1.5 sm:left-5 z-10 w-48 sm:w-64 bg-[#191824]/95 border border-[#3A384C] p-2 sm:p-2.5 shadow-2xl space-y-1.5 font-mono">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#121119] border border-[#353442] flex items-center justify-center shrink-0">
            <PixelHeroPreview
              heroClass={serverLocalPlayer.heroClass}
              size={28}
              animate={false}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1 text-xs">
              <span className="font-display text-xs sm:text-sm text-white font-bold truncate">
                {serverLocalPlayer.username}
              </span>
              <span className="text-[10px] text-[#FCD34D] font-bold uppercase tracking-wider shrink-0">
                {classDef.name}
              </span>
            </div>
            <div className="text-[9px] text-[#A9A6B8] truncate">
              {serverLocalPlayer.zone === 'safe'
                ? 'Safe Zone · Attacks Disabled'
                : serverLocalPlayer.combatLockRemainingMs > 0
                ? `Combat Lock · ${(serverLocalPlayer.combatLockRemainingMs / 1000).toFixed(1)}s`
                : 'Open Combat · PvP Permitted'}
            </div>
          </div>
        </div>

        {/* Gradient HP Bar */}
        <div className="space-y-0.5">
          <div className="w-full h-2 sm:h-2.5 bg-[#111018] border border-[#2E2B3D] overflow-hidden relative">
            <div
              style={{ width: `${hpPct}%` }}
              className="h-full bg-gradient-to-r from-[#166534] via-[#22C55E] to-[#4ADE80] transition-all duration-150"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#C9C7D8] tabular-nums">
            <span className="font-bold text-emerald-400">
              HP {serverLocalPlayer.hp} / {serverLocalPlayer.maxHp}
            </span>
            {map.isDevelopmentStub && (
              <span className="text-[9px] text-[#8E8B9E]">Foundation Map</span>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE ON-SCREEN TOUCH GAMEPAD */}
      {showTouchControls && (
        <TouchControls
          player={serverLocalPlayer}
          settings={touchSettings}
          controlsBlocked={controlsBlocked}
          onStickMove={handleStickMove}
          onAttackProbe={handleTouchAttackProbe}
          onOpenArmament={() => setArmamentOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {/* DESKTOP KEYBOARD / MOUSE ACTION BAR (Hidden when mobile touch gamepad is active) */}
      {!showTouchControls && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 hidden sm:flex items-center justify-center gap-2 px-4 py-2 bg-[#1B1B26]/95 border border-[#38364C]">
          <button
            type="button"
            onClick={() => handleTouchAttackProbe('basic', aimAngleRef.current)}
            className="px-3 py-1.5 bg-[#252433] border border-[#3C3A52] hover:border-[#D9AA52] text-left min-w-[115px] cursor-pointer"
          >
            <div className="flex justify-between w-full text-[10px] font-mono text-[#9E9CAE] gap-2">
              <span>[LMB / Space]</span>
              <span className={serverLocalPlayer.zone === 'safe' ? 'text-emerald-400' : 'text-[#FCD34D]'}>
                {serverLocalPlayer.zone === 'safe' ? 'SAFE' : 'READY'}
              </span>
            </div>
            <div className="font-display text-sm text-white whitespace-nowrap">
              Attack Probe
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTouchAttackProbe('tactical', aimAngleRef.current)}
            className={`stone-button stone-button-dark flex-col items-start min-w-[140px] h-auto py-1.5 ${
              activeCooldownSec > 0 ? 'opacity-65' : ''
            }`}
          >
            <div className="flex justify-between w-full text-[10px] font-mono tabular-nums opacity-85 gap-2">
              <span>[Q]</span>
              <span className="text-[#FCD34D]">
                {!activeSkillId
                  ? 'NO WEAPON'
                  : activeCooldownSec > 0
                  ? `${activeCooldownSec}s`
                  : serverLocalPlayer.zone === 'safe'
                  ? 'SAFE'
                  : 'READY'}
              </span>
            </div>
            <div className="font-display text-sm whitespace-nowrap text-white">
              {activeSkillId ? classDef.tacticalName : 'No Tactical'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setArmamentOpen((v) => !v)}
            className="stone-button stone-button-dark flex-col items-start min-w-[110px] h-auto py-1.5"
          >
            <div className="text-[10px] font-mono opacity-80">[I]</div>
            <div className="font-display text-sm whitespace-nowrap text-white">
              Armament
            </div>
          </button>
        </div>
      )}

      {/* COLLAPSIBLE INSTANCE CHAT DRAWER */}
      {chatOpen && (
        <div
          className={`pointer-events-auto fixed z-30 w-[calc(100vw-16px)] sm:w-76 bg-[#181722]/95 border border-[#38364C] p-2.5 flex flex-col gap-2 shadow-2xl ${
            showTouchControls
              ? 'top-12 right-2 sm:top-16 sm:right-5'
              : 'bottom-3 left-3'
          }`}
        >
          <div className="flex items-center justify-between border-b border-[#323044] pb-1">
            <span className="font-display text-xs text-[#FCD34D]">Instance Chat</span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="text-[10px] font-mono text-[#9E9CAE] hover:text-white cursor-pointer"
            >
              Hide
            </button>
          </div>

          <div className="h-28 overflow-y-auto custom-scrollbar space-y-1 pr-1 text-[11px] font-mono">
            {chat.slice(-30).map((m) => (
              <div key={m.id} className="leading-snug break-words">
                <span
                  className={
                    m.system ? 'text-[#D9AA52] font-bold' : 'text-sky-300 font-bold'
                  }
                >
                  {m.sender}:
                </span>{' '}
                <span className="text-[#E4E0EC]">{m.text}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-1.5">
            <input
              ref={chatInputRef}
              type="text"
              value={chatText}
              onFocus={transmitStopInput}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Say something [Enter]..."
              maxLength={240}
              className="stone-input flex-1 px-2 py-1 text-[11px] font-mono"
            />
            <button
              type="submit"
              className="stone-button stone-button-dark px-2.5 py-1 text-[10px]"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* ACTIVITIES & REGIONS MODAL [M] */}
      {activitiesOpen && (
        <div className="fixed top-14 right-2 sm:right-5 w-[calc(100vw-16px)] max-w-sm stone-panel p-4 space-y-3 z-40 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-[#3F3D4B] pb-2">
            <h3 className="font-display text-base text-white">
              Overworld Activities &amp; Zones
            </h3>
            <button
              type="button"
              onClick={() => setActivitiesOpen(false)}
              className="text-xs font-mono text-[#D1CFE0] hover:text-white cursor-pointer"
            >
              Close [Esc]
            </button>
          </div>
          <div className="space-y-2 max-h-[60dvh] overflow-y-auto custom-scrollbar">
            {snapshot.activities.map((act) => (
              <div
                key={act.id}
                className="bg-[#242330] border border-[#3C3A4C] p-2.5 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm text-white">{act.name}</span>
                  <span className="text-[10px] font-mono text-[#FCD34D]">
                    {act.participantsInZone} in zone
                  </span>
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
                  Awaiting Design Approval
                </div>
                <p className="text-[11px] text-[#C3C0D0] leading-snug">{act.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SHARED ARMAMENT MODAL [I] */}
      {armamentOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Shared Armament Slots"
          className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-3 pointer-events-auto pb-safe pt-safe"
        >
          <div className="w-full max-w-md stone-panel p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#3F3D4B] pb-2">
              <div>
                <h3 className="font-display text-lg text-white">Shared Armament</h3>
                <p className="text-[11px] font-mono text-[#D1CFE0]">
                  {canSwitchArmament
                    ? 'Safe Zone Ready: switching Weapon or Vestment permitted.'
                    : serverLocalPlayer.combatLockRemainingMs > 0
                    ? 'Locked during active combat (DD-021).'
                    : 'Enter a Safe Zone to switch Armament.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setArmamentOpen(false)}
                className="stone-button stone-button-dark text-xs py-1 px-2.5"
              >
                Close
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="bg-[#242330] border border-[#3C3A4C] p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#FCD34D]">
                    Weapon Slot
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {serverLocalPlayer.weaponId
                      ? BASE_ARMAMENTS[serverLocalPlayer.weaponId]?.name
                      : 'Unequipped (Tactical Skill Unavailable)'}
                  </div>
                  {anyWeaponCooldownMs > 0 && (
                    <div className="text-[10px] font-mono text-amber-300 mt-0.5">
                      Cooldown Ticking: {(anyWeaponCooldownMs / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!canSwitchArmament}
                  onClick={() =>
                    network.send({
                      type: 'player:equip_armament',
                      slot: 'weapon',
                      itemId: serverLocalPlayer.weaponId ? null : defaultWeaponId,
                    })
                  }
                  className="stone-button stone-button-gold text-xs py-1.5 px-3 shrink-0"
                >
                  {serverLocalPlayer.weaponId ? 'Unequip' : 'Equip'}
                </button>
              </div>

              <div className="bg-[#242330] border border-[#3C3A4C] p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#FCD34D]">
                    Vestment Slot
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {serverLocalPlayer.vestmentId
                      ? BASE_ARMAMENTS[serverLocalPlayer.vestmentId]?.name
                      : 'Unequipped'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canSwitchArmament}
                  onClick={() =>
                    network.send({
                      type: 'player:equip_armament',
                      slot: 'vestment',
                      itemId: serverLocalPlayer.vestmentId ? null : defaultVestmentId,
                    })
                  }
                  className="stone-button stone-button-gold text-xs py-1.5 px-3 shrink-0"
                >
                  {serverLocalPlayer.vestmentId ? 'Unequip' : 'Equip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOUCH & DISPLAY SETTINGS MODAL */}
      <TouchSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={touchSettings}
        onUpdateSettings={updateTouchSettings}
        forceTouchGamepad={forceTouchGamepad}
        onToggleForceGamepad={toggleForceTouch}
      />
    </div>
  );
};
