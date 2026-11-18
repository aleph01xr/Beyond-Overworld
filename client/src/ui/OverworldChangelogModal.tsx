import React from 'react';

export interface OverworldChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const OVERWORLD_CHANGELOG: readonly OverworldChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-11-17',
    title: 'Phase 1 — Client Visual Parity & Reliable Movement',
    highlights: [
      'Login, stone-bevel HUD, desktop WASD/Arrow keys, and mobile virtual joystick parity with Beyond: Dungeons.',
      'Fixed analog stickX/stickY WebSocket input signature and zero-idle-churn networking.',
      '40 Hz server-authoritative instances targeting 100 players with delta snapshot sync.',
      'Safe-Zone attack blocking (DD-010), Armament swap locks (DD-021), and independent cooldowns (DD-020).',
    ],
  },
];

interface ChangelogPanelProps {
  onOpenFullChangelog: () => void;
  className?: string;
}

export const OverworldChangelogPanel: React.FC<ChangelogPanelProps> = ({
  onOpenFullChangelog,
  className = '',
}) => {
  const latest = OVERWORLD_CHANGELOG[0];
  return (
    <aside
      aria-label="Latest Updates"
      className={`stone-panel relative w-full max-w-[400px] p-5 sm:p-6 pt-8 space-y-3 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute top-1.5 left-1.5 w-2 h-2 border-t-2 border-l-2 border-[#8B8996]/60 pointer-events-none"
      />
      <span
        aria-hidden="true"
        className="absolute top-1.5 right-1.5 w-2 h-2 border-t-2 border-r-2 border-[#8B8996]/60 pointer-events-none"
      />
      <div className="stone-plaque absolute -top-5 left-1/2 -translate-x-1/2 px-5 py-1 flex items-center justify-center whitespace-nowrap">
        <span className="font-display text-lg font-semibold text-[#F5F5F7] drop-shadow-[0_2px_0_#2F2E3A]">
          Update Log
        </span>
      </div>

      <div className="flex items-center justify-between text-xs font-mono border-b border-[#434150] pb-2">
        <span className="text-[#FCD34D] font-bold">v{latest.version}</span>
        <span className="text-[#C7C5D4]">{latest.date}</span>
      </div>

      <h3 className="font-display text-base text-white">{latest.title}</h3>

      <ul className="space-y-1.5 text-xs text-[#E4E2EC] leading-relaxed list-disc pl-4">
        {latest.highlights.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>

      <div className="pt-1">
        <button
          type="button"
          onClick={onOpenFullChangelog}
          className="stone-button stone-button-dark w-full text-xs py-1.5"
        >
          View Full Patch Archive
        </button>
      </div>
    </aside>
  );
};

interface FullChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullChangelogModal: React.FC<FullChangelogModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Overworld Update Archive"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 pb-safe pt-safe pl-safe pr-safe"
    >
      <div className="stone-panel max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[85dvh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between border-b border-[#3F3D4B] pb-3">
          <div>
            <h2 className="font-display text-xl text-white">
              Beyond: Overworld — Release Notes
            </h2>
            <p className="text-[11px] font-mono text-[#D9AA52]">
              Chronological Foundation Record
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="stone-button stone-button-dark text-xs py-1 px-3"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          {OVERWORLD_CHANGELOG.map((entry) => (
            <div
              key={entry.version}
              className="bg-[#242330] border border-[#3C3A4A] p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#FCD34D] font-bold">v{entry.version}</span>
                <span className="text-[#9E9CAE]">{entry.date}</span>
              </div>
              <div className="font-display text-sm text-white">{entry.title}</div>
              <ul className="space-y-1 text-xs text-[#D5D3E0] list-disc pl-4">
                {entry.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
