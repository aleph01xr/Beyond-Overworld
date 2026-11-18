import React, { useEffect, useState } from 'react';
import type {
  ButtonSizeOption,
  JoystickModeOption,
  JoystickSizeOption,
  TouchSettings,
} from './TouchControls.tsx';

interface TouchSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TouchSettings;
  onUpdateSettings: (newSettings: TouchSettings) => void;
  forceTouchGamepad: boolean;
  onToggleForceGamepad: (val: boolean) => void;
}

function useFullscreenState(): [boolean, () => void] {
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return [isFullscreen, toggle];
}

export const TouchSettingsModal: React.FC<TouchSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  forceTouchGamepad,
  onToggleForceGamepad,
}) => {
  const [activeTab, setActiveTab] = useState<'touch' | 'display'>('touch');
  const [isFullscreen, toggleFullscreenState] = useFullscreenState();

  if (!isOpen) return null;

  const triggerVibrate = (pattern: number | number[] = 15) => {
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // ignore unsupported
      }
    }
  };

  const setJoystickSize = (joystickSize: JoystickSizeOption) => {
    triggerVibrate(15);
    onUpdateSettings({ ...settings, joystickSize });
  };

  const setJoystickMode = (joystickMode: JoystickModeOption) => {
    triggerVibrate(15);
    onUpdateSettings({ ...settings, joystickMode });
  };

  const setButtonSize = (buttonSize: ButtonSizeOption) => {
    triggerVibrate(15);
    onUpdateSettings({ ...settings, buttonSize });
  };

  const setOpacity = (opacity: number) => {
    triggerVibrate(15);
    onUpdateSettings({ ...settings, opacity });
  };

  const toggleHaptics = () => {
    const haptics = !settings.haptics;
    if (haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([20, 30, 20]);
      } catch {
        // ignore
      }
    }
    onUpdateSettings({ ...settings, haptics });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="touch-settings-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 select-none pb-safe pt-safe pl-safe pr-safe"
    >
      <div className="stone-panel max-w-lg w-full p-3.5 sm:p-6 space-y-3 sm:space-y-4 my-auto max-h-[92dvh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#434152] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#D9AA52]" />
            <h2
              id="touch-settings-title"
              className="font-display text-lg sm:text-xl text-white"
            >
              Settings: Touch &amp; Display
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-mono text-[#A8A6B8] hover:text-white px-2 py-1 min-h-[36px] flex items-center cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#363546] pb-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('touch')}
            className={`px-3 py-1.5 border font-semibold cursor-pointer transition-colors min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'touch'
                ? 'bg-[#5B5870] border-[#F4D378] text-white'
                : 'bg-[#242330] border-[#3B394A] text-[#A8A6B8] hover:text-white'
            }`}
          >
            <span>Touch Controls</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('display')}
            className={`px-3 py-1.5 border font-semibold cursor-pointer transition-colors min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'display'
                ? 'bg-[#5B5870] border-[#F4D378] text-white'
                : 'bg-[#242330] border-[#3B394A] text-[#A8A6B8] hover:text-white'
            }`}
          >
            <span>Display &amp; Controls</span>
          </button>
        </div>

        {/* TAB 1: TOUCH CONTROLS */}
        {activeTab === 'touch' && (
          <div className="space-y-4 text-xs font-mono">
            {/* Joystick Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#C9C7D6]">
                <span className="font-semibold text-white">Virtual Joystick Size</span>
                <span className="text-[#F4D378] capitalize">{settings.joystickSize}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['small', 'medium', 'large', 'huge'] as const).map((opt) => {
                  const active = settings.joystickSize === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setJoystickSize(opt)}
                      className={`py-2 px-1 border cursor-pointer min-h-[40px] capitalize transition-colors ${
                        active
                          ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                          : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Joystick Mode */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#C9C7D6]">
                <span className="font-semibold text-white">Joystick Style</span>
                <span className="text-[#F4D378] capitalize">{settings.joystickMode}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setJoystickMode('floating')}
                  className={`py-2 px-2 border cursor-pointer min-h-[44px] flex flex-col items-center justify-center text-center transition-colors ${
                    settings.joystickMode === 'floating'
                      ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                      : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                  }`}
                >
                  <span>Floating</span>
                  <span className="text-[10px] opacity-75">Appears where thumb touches</span>
                </button>
                <button
                  type="button"
                  onClick={() => setJoystickMode('fixed')}
                  className={`py-2 px-2 border cursor-pointer min-h-[44px] flex flex-col items-center justify-center text-center transition-colors ${
                    settings.joystickMode === 'fixed'
                      ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                      : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                  }`}
                >
                  <span>Fixed Base</span>
                  <span className="text-[10px] opacity-75">Bottom-left corner</span>
                </button>
              </div>
            </div>

            {/* Action Button Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#C9C7D6]">
                <span className="font-semibold text-white">Action Buttons</span>
                <span className="text-[#F4D378] capitalize">{settings.buttonSize}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'compact', label: 'Compact', desc: 'Space-saving' },
                  { id: 'standard', label: 'Standard', desc: 'Balanced' },
                  { id: 'large', label: 'Large', desc: 'Comfortable' },
                ].map((opt) => {
                  const active = settings.buttonSize === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setButtonSize(opt.id as ButtonSizeOption)}
                      className={`py-2 px-1 border cursor-pointer min-h-[44px] flex flex-col items-center justify-center text-center transition-colors ${
                        active
                          ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                          : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-[10px] opacity-75">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Controls Opacity */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#C9C7D6]">
                <span className="font-semibold text-white">Controls Opacity</span>
                <span className="text-[#F4D378]">{Math.round(settings.opacity * 100)}%</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0.5, 0.75, 0.9, 1.0].map((val) => {
                  const active = Math.abs(settings.opacity - val) < 0.05;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setOpacity(val)}
                      className={`py-2 border cursor-pointer min-h-[40px] flex items-center justify-center transition-colors ${
                        active
                          ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                          : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                      }`}
                    >
                      {Math.round(val * 100)}%
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Haptics & Force Touch Toggle */}
            <div className="pt-2 border-t border-[#3B3A4C] space-y-2">
              <button
                type="button"
                onClick={toggleHaptics}
                className="w-full py-2.5 px-3 bg-[#242330] hover:bg-[#302F3E] border border-[#3E3C4E] flex items-center justify-between cursor-pointer min-h-[44px]"
              >
                <span className="text-white">Haptic Vibration on Touch Tap</span>
                <span
                  className={`px-2 py-0.5 text-[11px] font-bold ${
                    settings.haptics
                      ? 'bg-[#22C55E]/20 text-[#86EFAC]'
                      : 'bg-[#EF4444]/20 text-[#FCA5A5]'
                  }`}
                >
                  {settings.haptics ? 'ENABLED' : 'DISABLED'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleForceGamepad(!forceTouchGamepad)}
                className="w-full py-2.5 px-3 bg-[#242330] hover:bg-[#302F3E] border border-[#3E3C4E] flex items-center justify-between cursor-pointer min-h-[44px]"
              >
                <div className="text-left">
                  <span className="text-white block">Always Show Touch Gamepad</span>
                  <span className="text-[10px] text-[#8E8C9F] block">
                    Force display on desktop browsers for touch control testing
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[11px] font-bold shrink-0 ml-2 ${
                    forceTouchGamepad
                      ? 'bg-[#EAB308]/20 text-[#FDE047]'
                      : 'bg-[#4B495C]/30 text-[#9E9CAF]'
                  }`}
                >
                  {forceTouchGamepad ? 'ALWAYS ON' : 'AUTO'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: DISPLAY & CONTROLS */}
        {activeTab === 'display' && (
          <div className="space-y-4 text-xs font-mono">
            <div className="p-3.5 bg-[#242330] border border-[#3E3C4E] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-white block">Full Screen Mode</span>
                  <span className="text-[10.5px] text-[#8E8C9F] block">
                    Expand game viewport cleanly on desktop or mobile
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleFullscreenState}
                  className={`px-3 py-1.5 text-xs font-bold border cursor-pointer min-h-[36px] flex items-center gap-1.5 transition-colors ${
                    isFullscreen
                      ? 'bg-[#EAB308]/20 border-[#EAB308] text-[#FDE047]'
                      : 'bg-[#5B5870] border-[#F4D378] text-white hover:bg-[#6D6A85]'
                  }`}
                >
                  <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#1C1B26] border border-[#333144] space-y-1.5 text-[11px] text-[#B8B6C7]">
              <span className="font-semibold text-white block font-display">
                Overworld Controls Reference
              </span>
              <div className="grid grid-cols-2 gap-1 pt-1">
                <span>W / A / S / D / Arrows</span>
                <span className="text-[#FCD34D]">Move</span>
                <span>Space / Left Click</span>
                <span className="text-[#FCD34D]">Basic Attack Probe</span>
                <span>Q</span>
                <span className="text-[#FCD34D]">Tactical Skill Probe</span>
                <span>I / M / Enter</span>
                <span className="text-[#FCD34D]">Armament / Map / Chat</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="stone-button stone-button-gold w-full py-2.5 font-display text-sm cursor-pointer min-h-[44px] flex items-center justify-center"
          >
            Apply &amp; Return to World
          </button>
        </div>
      </div>
    </div>
  );
};
