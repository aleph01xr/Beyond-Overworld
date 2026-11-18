import React, { useEffect, useRef, useState } from 'react';
import {
  Backpack,
  Compass,
  LogOut,
  MessageSquare,
  Send,
  Shield,
  ShieldOff,
  Swords,
  Zap,
} from 'lucide-react';
import {
  BASE_ARMAMENTS,
  HERO_CLASSES,
  getDefaultVestmentId,
  getDefaultWeaponId,
} from '../../../shared/constants/classes.ts';
import { OVERWORLD_ZONES } from '../../../shared/constants/zones.ts';
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
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const aimAngleRef = useRef(0);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  const [armamentOpen, setArmamentOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [chatText, setChatText] = useState('');

  snapshotRef.current = snapshot;
  mapRef.current = map;

  const serverLocalPlayer =
    snapshot.players.find((p) => p.id === playerId) ?? snapshot.players[0];

  // Reconcile movement & queue new floating callouts whenever snapshots update
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

  // Reset prediction when entering a new instance
  useEffect(() => {
    const initialLocal = snapshotRef.current.players.find((p) => p.id === playerId);
    predictionRef.current.reset(initialLocal);
  }, [map.mapId, playerId]);

  // Input listeners
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
    };

    const setKey = (code: string, down: boolean) => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          keysRef.current.up = down;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keysRef.current.down = down;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keysRef.current.left = down;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keysRef.current.right = down;
          break;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !isTypingTarget(e.target)) {
        e.preventDefault();
        chatInputRef.current?.focus();
        return;
      }
      if (isTypingTarget(e.target)) {
        if (e.code === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      setKey(e.code, true);

      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        network.send({
          type: 'player:attack_probe',
          aimAngle: aimAngleRef.current,
          kind: 'basic',
        });
      } else if (e.code === 'KeyE') {
        network.send({
          type: 'player:attack_probe',
          aimAngle: aimAngleRef.current,
          kind: 'tactical',
        });
      } else if (e.code === 'KeyI') {
        setArmamentOpen((v) => !v);
      } else if (e.code === 'KeyM') {
        setActivitiesOpen((v) => !v);
      } else if (e.code === 'Escape') {
        setArmamentOpen(false);
        setActivitiesOpen(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      setKey(e.code, false);
    };

    const onBlur = () => {
      keysRef.current = { up: false, down: false, left: false, right: false };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [network]);

  // 60 FPS Canvas animation + client movement prediction loop
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
          attack: false,
          aimAngle: aimAngleRef.current,
        };

        const seq = predictionRef.current.allocateSeq();
        predictionRef.current.predictStep(seq, input, dtSec, currentMap, srvLocal);
        predictionRef.current.decayVisualOffset(dtSec);
        network.sendInput(input, seq);

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

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    aimAngleRef.current = Math.atan2(e.clientY - cy, e.clientX - cx);
  };

  const handleCanvasClick = () => {
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
  const defaultWeaponCooldownMs =
    serverLocalPlayer.tacticalCooldownsMs[`tac_${serverLocalPlayer.heroClass}_bulwark_dash`] ??
    serverLocalPlayer.tacticalCooldownsMs[`tac_${serverLocalPlayer.heroClass}_frost_volley`] ??
    serverLocalPlayer.tacticalCooldownsMs[`tac_${serverLocalPlayer.heroClass}_astral_nova`] ??
    serverLocalPlayer.tacticalCooldownsMs[`tac_${serverLocalPlayer.heroClass}_sanctified_pulse`] ??
    0;

  const canSwitchArmament =
    serverLocalPlayer.zone === 'safe' &&
    !serverLocalPlayer.inCombat &&
    serverLocalPlayer.combatLockRemainingMs <= 0;

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#181820]">
      {/* Full-viewport World Canvas */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleCanvasMouseMove}
        onClick={handleCanvasClick}
        className="block w-full h-full pixel-canvas cursor-crosshair"
      />

      {/* Top-Left Character & Authoritative Zone HUD */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-auto">
        <div className="stone-panel rounded-sm p-2.5 flex items-center gap-3">
          <div className="w-11 h-11 stone-plaque rounded-sm flex items-center justify-center shrink-0">
            <PixelHeroPreview
              heroClass={serverLocalPlayer.heroClass}
              size={38}
              animate={false}
            />
          </div>

          <div className="min-w-[165px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm text-[#f5f1e8]">
                {serverLocalPlayer.username}
              </span>
              <span className="text-[10px] font-mono-stat text-[#d9aa52]">
                Lv.{serverLocalPlayer.level} {classDef.name}
              </span>
            </div>

            <div className="mt-1 h-2 w-full bg-[#141319] border border-[#322f3c] rounded-sm overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-100"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (serverLocalPlayer.hp / serverLocalPlayer.maxHp) * 100)
                  )}%`,
                }}
              />
            </div>

            <div className="mt-1 flex items-center justify-between text-[10px] font-mono-stat text-[#b9b4c6]">
              <span>
                HP {serverLocalPlayer.hp}/{serverLocalPlayer.maxHp}
              </span>
              <span>
                {snapshot.players.length}/100
                {pingMs !== null ? ` · ${pingMs}ms` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="stone-plaque px-3 py-1.5 rounded-sm flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            {serverLocalPlayer.zone === 'safe' ? (
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ShieldOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span
              className="font-display text-xs"
              style={{ color: zoneMeta.accentColor }}
            >
              {zoneMeta.label}
            </span>
          </div>

          {serverLocalPlayer.combatLockRemainingMs > 0 ? (
            <span className="text-[10px] font-mono-stat text-red-300">
              Combat Lock {(serverLocalPlayer.combatLockRemainingMs / 1000).toFixed(1)}s
            </span>
          ) : (
            <span className="text-[10px] text-[#9e99ad]">
              {serverLocalPlayer.zone === 'safe' ? 'Attacks Disabled' : 'PvP Permitted'}
            </span>
          )}
        </div>
      </div>

      {/* Top-Center Non-Final World Notice & Controls */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
        {map.isDevelopmentStub && (
          <div className="stone-plaque px-3 py-1 rounded-sm text-[11px] text-[#c7c2d2]">
            {snapshot.instanceName} · {map.title}
          </div>
        )}
        {actionBanner && (
          <div className="stone-plaque border-[#d9aa52] px-3 py-1.5 rounded-sm text-xs text-amber-200">
            {actionBanner}
          </div>
        )}
      </div>

      {/* Top-Right Shard Exit */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => setActivitiesOpen((v) => !v)}
          className={`stone-button px-3 py-1.5 rounded-sm text-xs font-semibold flex items-center gap-1.5 ${
            activitiesOpen ? 'stone-button-gold' : ''
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Activities [M]
        </button>
        <button
          type="button"
          onClick={onLeaveInstance}
          className="stone-button px-3 py-1.5 rounded-sm text-xs font-semibold flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          Lobby
        </button>
      </div>

      {/* Right Drawer: Activity Module Boundaries */}
      {activitiesOpen && (
        <div className="absolute top-14 right-3 w-80 stone-panel rounded-sm p-4 space-y-3 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-[#34313d] pb-2">
            <h3 className="font-display text-base text-[#f5f1e8]">
              Overworld Activity Modules
            </h3>
            <button
              type="button"
              onClick={() => setActivitiesOpen(false)}
              className="text-xs text-[#a7a2b5] hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            {snapshot.activities.map((act) => (
              <div key={act.id} className="stone-plaque p-2.5 rounded-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm text-[#f5f1e8]">{act.name}</span>
                  <span className="text-[10px] font-mono-stat text-[#d9aa52]">
                    {act.participantsInZone} in zone
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-amber-300/90">
                  Awaiting Design Approval
                </div>
                <p className="text-[11px] text-[#aca7ba] leading-snug">{act.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Center-Right Drawer: Shared Armament Manager (DD-014..DD-021) */}
      {armamentOpen && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[92vw] max-w-md stone-panel rounded-sm p-4 space-y-3 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-[#34313d] pb-2">
            <div>
              <h3 className="font-display text-base text-[#f5f1e8]">
                Shared Armament Slots
              </h3>
              <p className="text-[11px] text-[#b4afc2]">
                {canSwitchArmament
                  ? 'Safe Zone Ready: switching Weapon or Vestment permitted.'
                  : serverLocalPlayer.combatLockRemainingMs > 0
                  ? 'Locked during active combat (DD-021).'
                  : 'Move into Safe Zone to switch Armament.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setArmamentOpen(false)}
              className="text-xs text-[#a7a2b5] hover:text-white"
            >
              [Esc]
            </button>
          </div>

          <div className="space-y-2.5">
            {/* Weapon Slot */}
            <div className="stone-plaque p-3 rounded-sm flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#d9aa52]">
                  Weapon Slot
                </div>
                <div className="text-xs font-semibold text-[#f3efe6]">
                  {serverLocalPlayer.weaponId
                    ? BASE_ARMAMENTS[serverLocalPlayer.weaponId]?.name
                    : 'Unequipped (Tactical Skill Inactive)'}
                </div>
                {defaultWeaponCooldownMs > 0 && (
                  <div className="text-[10px] font-mono-stat text-amber-300 mt-0.5">
                    Skill Cooldown Ticking: {(defaultWeaponCooldownMs / 1000).toFixed(1)}s
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
                className="stone-button px-3 py-1.5 rounded-sm text-xs font-semibold shrink-0"
              >
                {serverLocalPlayer.weaponId ? 'Unequip' : 'Equip'}
              </button>
            </div>

            {/* Vestment Slot */}
            <div className="stone-plaque p-3 rounded-sm flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#d9aa52]">
                  Vestment Slot
                </div>
                <div className="text-xs font-semibold text-[#f3efe6]">
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
                className="stone-button px-3 py-1.5 rounded-sm text-xs font-semibold shrink-0"
              >
                {serverLocalPlayer.vestmentId ? 'Unequip' : 'Equip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-Left Compact Instance Chat */}
      <div className="hidden sm:flex flex-col absolute bottom-3 left-3 w-72 stone-panel rounded-sm p-2.5 gap-2 pointer-events-auto">
        <div className="flex items-center gap-1.5 text-[11px] font-display text-[#d9aa52]">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Instance Chat</span>
        </div>
        <div className="h-28 overflow-y-auto space-y-1 pr-1 text-[11px]">
          {chat.slice(-24).map((m) => (
            <div key={m.id} className="leading-snug">
              <span
                className={
                  m.system ? 'text-[#d9aa52] font-semibold' : 'text-sky-300 font-semibold'
                }
              >
                {m.sender}:
              </span>{' '}
              <span className="text-[#e4e0ec]">{m.text}</span>
            </div>
          ))}
        </div>
        <form onSubmit={handleSendChat} className="flex gap-1.5">
          <input
            ref={chatInputRef}
            type="text"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Say something [Enter]..."
            maxLength={240}
            className="stone-input flex-1 px-2 py-1 rounded-sm text-[11px]"
          />
          <button
            type="submit"
            className="stone-button px-2 py-1 rounded-sm"
            title="Send Chat"
          >
            <Send className="w-3 h-3" />
          </button>
        </form>
      </div>

      {/* Bottom-Center Action Bar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 stone-panel rounded-sm p-1.5 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() =>
            network.send({
              type: 'player:attack_probe',
              aimAngle: aimAngleRef.current,
              kind: 'basic',
            })
          }
          className="stone-plaque hover:border-[#d9aa52] px-3 py-1.5 rounded-sm flex items-center gap-2 text-xs"
        >
          <Swords className="w-4 h-4 text-amber-300" />
          <div className="text-left">
            <div className="font-display text-xs text-[#f5f1e8]">Basic Probe</div>
            <div className="text-[10px] font-mono-stat text-[#9f9aaf]">
              {serverLocalPlayer.zone === 'safe' ? 'Blocked (Safe)' : '[Space / Click]'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            network.send({
              type: 'player:attack_probe',
              aimAngle: aimAngleRef.current,
              kind: 'tactical',
            })
          }
          className="stone-plaque hover:border-[#d9aa52] px-3 py-1.5 rounded-sm flex items-center gap-2 text-xs"
        >
          <Zap className="w-4 h-4 text-sky-300" />
          <div className="text-left">
            <div className="font-display text-xs text-[#f5f1e8]">
              {activeSkillId ? classDef.tacticalName : 'No Weapon Skill'}
            </div>
            <div className="text-[10px] font-mono-stat text-[#d9aa52]">
              {activeCooldownMs > 0
                ? `${(activeCooldownMs / 1000).toFixed(1)}s CD`
                : serverLocalPlayer.zone === 'safe'
                ? 'Blocked (Safe)'
                : '[E] Ready'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setArmamentOpen((v) => !v)}
          className={`stone-button px-3 py-2 rounded-sm text-xs font-semibold flex items-center gap-1.5 ${
            armamentOpen ? 'stone-button-gold' : ''
          }`}
        >
          <Backpack className="w-3.5 h-3.5" />
          Armament [I]
        </button>
      </div>
    </div>
  );
};
