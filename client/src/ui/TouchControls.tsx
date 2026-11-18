import React, { useEffect, useRef, useState } from 'react';
import { HERO_CLASSES, MAX_LEVEL } from '../../../shared/constants/classes.ts';
import type { OverworldPlayerState } from '../../../shared/types/domain.ts';

export type JoystickSizeOption = 'small' | 'medium' | 'large' | 'huge';
export type JoystickModeOption = 'fixed' | 'floating';
export type ButtonSizeOption = 'compact' | 'standard' | 'large';

export interface TouchSettings {
  joystickSize: JoystickSizeOption;
  joystickMode: JoystickModeOption;
  buttonSize: ButtonSizeOption;
  opacity: number;
  haptics: boolean;
}

const TOUCH_SETTINGS_KEY = 'beyond_overworld_touch_settings';

export const DEFAULT_TOUCH_SETTINGS: TouchSettings = {
  joystickSize: 'medium',
  joystickMode: 'floating',
  buttonSize: 'compact',
  opacity: 0.88,
  haptics: true,
};

const JOYSTICK_CONFIGS: Record<
  JoystickSizeOption,
  { basePx: number; knobPx: number; maxRadius: number }
> = {
  small: { basePx: 100, knobPx: 44, maxRadius: 34 },
  medium: { basePx: 125, knobPx: 52, maxRadius: 42 },
  large: { basePx: 160, knobPx: 64, maxRadius: 56 },
  huge: { basePx: 200, knobPx: 78, maxRadius: 72 },
};

const BUTTON_CONFIGS: Record<
  ButtonSizeOption,
  { util: number; skill: number; attack: number; icon: number }
> = {
  compact: { util: 36, skill: 46, attack: 64, icon: 16 },
  standard: { util: 42, skill: 54, attack: 76, icon: 20 },
  large: { util: 48, skill: 64, attack: 90, icon: 24 },
};

export function loadSavedTouchSettings(): TouchSettings {
  try {
    const raw = localStorage.getItem(TOUCH_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TouchSettings>;
      return { ...DEFAULT_TOUCH_SETTINGS, ...parsed };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_TOUCH_SETTINGS;
}

export function saveTouchSettings(s: TouchSettings): void {
  try {
    localStorage.setItem(TOUCH_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

interface TouchControlsProps {
  player: OverworldPlayerState;
  settings: TouchSettings;
  controlsBlocked: boolean;
  onStickMove: (stickX: number, stickY: number, aimAngle?: number) => void;
  onAttackProbe: (kind: 'basic' | 'tactical', aimAngle: number) => void;
  onOpenArmament: () => void;
  onOpenSettings: () => void;
}

/**
 * Mobile virtual joystick & action cluster adapted faithfully from Beyond: Dungeons
 * (TouchControls.tsx) for Overworld's analog movement & server-supported probes.
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  player,
  settings,
  controlsBlocked,
  onStickMove,
  onAttackProbe,
  onOpenArmament,
  onOpenSettings,
}) => {
  const joystickTouchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStickActive, setIsStickActive] = useState(false);
  const [floatingOrigin, setFloatingOrigin] = useState<{ x: number; y: number } | null>(null);
  const fixedBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastStickAngleRef = useRef<number>(player.aimAngle || 0);

  const heroDef = HERO_CLASSES[player.heroClass] ?? HERO_CLASSES.vanguard;
  const activeSkillId = player.activeTacticalSkillId;
  const tacCooldownMs = activeSkillId ? player.tacticalCooldownsMs[activeSkillId] ?? 0 : 0;
  const tacSec = Math.ceil(tacCooldownMs / 1000);
  const inSafeZone = player.zone === 'safe';

  const mobileViewportScale = React.useMemo(() => {
    if (typeof window === 'undefined') return 1;
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    if (minDim < 380) return 0.8;
    if (minDim < 480) return 0.88;
    if (minDim < 640) return 0.94;
    return 1;
  }, []);

  const baseJoySpec = JOYSTICK_CONFIGS[settings.joystickSize] ?? JOYSTICK_CONFIGS.medium;
  const joySpec = React.useMemo(() => {
    if (mobileViewportScale === 1) return baseJoySpec;
    return {
      basePx: Math.round(baseJoySpec.basePx * mobileViewportScale),
      knobPx: Math.round(baseJoySpec.knobPx * mobileViewportScale),
      maxRadius: Math.round(baseJoySpec.maxRadius * mobileViewportScale),
    };
  }, [baseJoySpec, mobileViewportScale]);

  const baseBtnSpec = BUTTON_CONFIGS[settings.buttonSize] ?? BUTTON_CONFIGS.compact;
  const btnSpec = React.useMemo(() => {
    if (mobileViewportScale === 1) return baseBtnSpec;
    return {
      util: Math.round(baseBtnSpec.util * mobileViewportScale),
      skill: Math.round(baseBtnSpec.skill * mobileViewportScale),
      attack: Math.round(baseBtnSpec.attack * mobileViewportScale),
      icon: Math.round(baseBtnSpec.icon * mobileViewportScale),
    };
  }, [baseBtnSpec, mobileViewportScale]);

  const triggerHaptic = (ms = 12) => {
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore haptic unsupported
      }
    }
  };

  // Immediately release joystick if UI overlays block controls or component unmounts
  useEffect(() => {
    if (controlsBlocked && joystickTouchIdRef.current !== null) {
      joystickTouchIdRef.current = null;
      setKnobPos({ x: 0, y: 0 });
      setIsStickActive(false);
      setFloatingOrigin(null);
      onStickMove(0, 0, lastStickAngleRef.current);
    }
  }, [controlsBlocked, onStickMove]);

  useEffect(() => {
    return () => {
      joystickTouchIdRef.current = null;
      onStickMove(0, 0, lastStickAngleRef.current);
    };
  }, [onStickMove]);

  const handleLeftZoneTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (controlsBlocked) return;
    e.stopPropagation();
    if (joystickTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    joystickTouchIdRef.current = touch.identifier;
    let cx = touch.clientX;
    let cy = touch.clientY;

    if (settings.joystickMode === 'floating') {
      setFloatingOrigin({ x: cx, y: cy });
    } else {
      const rect = fixedBaseRef.current?.getBoundingClientRect();
      if (rect) {
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
      }
    }

    joystickCenterRef.current = { x: cx, y: cy };
    setKnobPos({ x: 0, y: 0 });
    setIsStickActive(true);
    triggerHaptic(10);
  };

  const handleLeftZoneTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (controlsBlocked) return;
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier !== joystickTouchIdRef.current) continue;

      const cx = joystickCenterRef.current.x;
      const cy = joystickCenterRef.current.y;
      const dx = touch.clientX - cx;
      const dy = touch.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const maxR = joySpec.maxRadius;
      const clampedDist = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);

      setKnobPos({
        x: Math.cos(angle) * clampedDist,
        y: Math.sin(angle) * clampedDist,
      });

      const deadzone = 8;
      if (clampedDist > deadzone) {
        const normMagnitude = Math.min(1, (clampedDist - deadzone) / (maxR - deadzone));
        const normX = Math.cos(angle) * normMagnitude;
        const normY = Math.sin(angle) * normMagnitude;
        lastStickAngleRef.current = angle;
        onStickMove(normX, normY, angle);
      } else {
        onStickMove(0, 0, lastStickAngleRef.current);
      }
      break;
    }
  };

  const handleLeftZoneTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchIdRef.current) {
        joystickTouchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        setIsStickActive(false);
        setFloatingOrigin(null);
        onStickMove(0, 0, lastStickAngleRef.current);
        break;
      }
    }
  };

  return (
    <div
      aria-label="Mobile Touch Gamepad"
      style={{ opacity: settings.opacity }}
      className="fixed inset-0 pointer-events-none select-none z-20 touch-none"
    >
      {/* LEFT HALF SCREEN: Joystick Touch Catch Area (kept clear of top header) */}
      <div
        onTouchStart={handleLeftZoneTouchStart}
        onTouchMove={handleLeftZoneTouchMove}
        onTouchEnd={handleLeftZoneTouchEnd}
        onTouchCancel={handleLeftZoneTouchEnd}
        className="pointer-events-auto absolute left-0 bottom-0 top-14 sm:top-16 w-[48vw] touch-none flex items-end p-2.5 sm:p-5 pl-safe pb-safe"
      >
        {/* Floating Joystick Base */}
        {settings.joystickMode === 'floating' && floatingOrigin && isStickActive && (
          <div
            style={{
              position: 'fixed',
              left: `${floatingOrigin.x}px`,
              top: `${floatingOrigin.y}px`,
              width: `${joySpec.basePx}px`,
              height: `${joySpec.basePx}px`,
              marginLeft: `-${joySpec.basePx / 2}px`,
              marginTop: `-${joySpec.basePx / 2}px`,
            }}
            className="rounded-full bg-[#181822]/85 border-3 border-[#5B5872] shadow-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-40">
              <div className="w-full h-0.5 bg-[#A19EB3]" />
              <div className="h-full w-0.5 bg-[#A19EB3] absolute" />
            </div>
            <div
              style={{
                width: `${joySpec.knobPx}px`,
                height: `${joySpec.knobPx}px`,
                transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
              }}
              className="rounded-full bg-[#7D7B91] border-3 border-[#343243] shadow-[0_4px_16px_rgba(0,0,0,0.6)] flex items-center justify-center"
            >
              <div className="w-4 h-4 rounded-full bg-[#E5E3F2]" />
            </div>
          </div>
        )}

        {/* Fixed Joystick Base */}
        {settings.joystickMode === 'fixed' && (
          <div
            ref={fixedBaseRef}
            style={{
              width: `${joySpec.basePx}px`,
              height: `${joySpec.basePx}px`,
            }}
            className="relative rounded-full bg-[#181822]/85 border-3 border-[#5B5872] shadow-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-35">
              <div className="w-full h-0.5 bg-[#A19EB3]" />
              <div className="h-full w-0.5 bg-[#A19EB3] absolute" />
            </div>
            <div
              style={{
                width: `${joySpec.knobPx}px`,
                height: `${joySpec.knobPx}px`,
                transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
                transition: isStickActive
                  ? 'none'
                  : 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="rounded-full bg-[#7D7B91] border-3 border-[#343243] shadow-[0_4px_16px_rgba(0,0,0,0.6)] flex items-center justify-center"
            >
              <div className="w-4 h-4 rounded-full bg-[#E5E3F2]" />
            </div>
          </div>
        )}

        {settings.joystickMode === 'floating' && !isStickActive && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#9D9AAC]/80 bg-[#161622]/60 px-2.5 py-1 border border-[#3C3A4D] pointer-events-none">
            <span>Touch to Move</span>
          </div>
        )}
      </div>

      {/* RIGHT BOTTOM CORNER: Utility & Action Cluster */}
      <div className="pointer-events-auto absolute right-0 bottom-0 p-2.5 sm:p-5 pr-safe pb-safe flex flex-col items-end gap-2 touch-none">
        {/* Level Readout */}
        <div className="flex items-center gap-1.5 px-1 pointer-events-none">
          <div className="text-[9px] font-mono font-bold text-[#FCD34D] bg-[#181822]/75 px-1.5 py-0.5 border border-[#3C3A4D]">
            {player.level >= MAX_LEVEL ? 'MAX LEVEL' : `LV.${player.level}`}
          </div>
        </div>

        {/* Upper Utility Row: Touch Settings + Armament */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              triggerHaptic(12);
              onOpenSettings();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            style={{ width: `${btnSpec.util}px`, height: `${btnSpec.util}px` }}
            className="rounded-full bg-[#242332]/90 border border-[#525066] text-white flex items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
            aria-label="Touch Controls Settings"
            title="Touch Controls Settings"
          >
            <svg
              width={btnSpec.icon}
              height={btnSpec.icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>

          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              triggerHaptic(12);
              onOpenArmament();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenArmament();
            }}
            style={{ width: `${btnSpec.util + 6}px`, height: `${btnSpec.util + 6}px` }}
            className="rounded-full bg-[#242332]/95 border border-[#D9AA52]/80 text-[#FDE68A] flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
            aria-label="Open Armament"
          >
            <span className="text-[9px] font-mono font-bold leading-none">ARM</span>
            <span className="text-[7px] font-mono leading-none mt-0.5 opacity-80">[I]</span>
          </button>
        </div>

        {/* Lower Combat Probe Cluster */}
        <div
          style={{
            width: `${btnSpec.attack * 2.0}px`,
            height: `${btnSpec.attack * 1.35}px`,
          }}
          className="relative flex items-end justify-end gap-3"
        >
          {/* Tactical Probe [Q] */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              triggerHaptic(16);
              onAttackProbe('tactical', lastStickAngleRef.current);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAttackProbe('tactical', lastStickAngleRef.current);
            }}
            style={{
              width: `${btnSpec.skill}px`,
              height: `${btnSpec.skill}px`,
            }}
            className={`rounded-full border-2 flex flex-col items-center justify-center transition-transform shadow-lg cursor-pointer ${
              inSafeZone || !activeSkillId
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#8E8C9E]'
                : tacSec > 0
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#716F82]'
                : 'bg-[#282738]/95 border-[#818CF8] text-[#C7D2FE] active:scale-95'
            }`}
            aria-label={heroDef.tacticalName}
          >
            <span className="text-xs font-mono font-bold leading-none">
              {tacSec > 0 ? `${tacSec}s` : 'Q'}
            </span>
            <span className="text-[7.5px] font-display truncate max-w-[42px] mt-0.5">
              {inSafeZone
                ? 'Safe'
                : !activeSkillId
                ? 'None'
                : tacSec > 0
                ? 'Wait'
                : heroDef.tacticalName.split(' ')[0]}
            </span>
          </button>

          {/* Primary Attack Probe */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              triggerHaptic(18);
              onAttackProbe('basic', lastStickAngleRef.current);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAttackProbe('basic', lastStickAngleRef.current);
            }}
            style={{
              width: `${btnSpec.attack}px`,
              height: `${btnSpec.attack}px`,
            }}
            className={`rounded-full border-3 flex flex-col items-center justify-center shadow-2xl transition-transform cursor-pointer ${
              inSafeZone
                ? 'bg-[#3A282D]/90 border-[#6F4D54] text-[#C5A7AC]'
                : 'bg-[#B91C1C] border-[#F87171] text-white active:scale-95'
            }`}
            aria-label="Attack Probe"
          >
            <svg
              width={btnSpec.attack * 0.38}
              height={btnSpec.attack * 0.38}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
              <path d="M13 19l6-6" />
              <path d="M16 16l4 4" />
              <path d="M19 21l2-2" />
            </svg>
            <span className="text-[8px] font-mono leading-none mt-0.5 opacity-90">
              {inSafeZone ? 'SAFE' : 'ATK'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
