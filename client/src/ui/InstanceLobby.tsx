import React, { useState } from 'react';
import { Globe, Plus, Users, LogOut, ShieldAlert } from 'lucide-react';
import {
  BASE_ARMAMENTS,
  HERO_CLASSES,
  MAX_LEVEL,
} from '../../../shared/constants/classes.ts';
import type {
  CharacterIdentity,
  WorldInstanceSummary,
} from '../../../shared/types/domain.ts';
import { PixelHeroPreview } from './PixelHeroPreview.tsx';

interface InstanceLobbyProps {
  character: CharacterIdentity;
  instances: WorldInstanceSummary[];
  onlineCount: number;
  connectionState: 'connecting' | 'connected' | 'disconnected';
  errorBanner: string | null;
  onJoinInstance: (instanceId: string) => void;
  onCreateInstance: (name: string) => void;
  onLogout: () => void;
}

export const InstanceLobby: React.FC<InstanceLobbyProps> = ({
  character,
  instances,
  onlineCount,
  connectionState,
  errorBanner,
  onJoinInstance,
  onCreateInstance,
  onLogout,
}) => {
  const [newInstanceName, setNewInstanceName] = useState('');
  const classDef = HERO_CLASSES[character.heroClass];
  const weaponDef = character.equippedArmament.weaponId
    ? BASE_ARMAMENTS[character.equippedArmament.weaponId]
    : null;
  const vestmentDef = character.equippedArmament.vestmentId
    ? BASE_ARMAMENTS[character.equippedArmament.vestmentId]
    : null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newInstanceName.trim();
    if (trimmed.length < 2) return;
    onCreateInstance(trimmed);
    setNewInstanceName('');
  };

  return (
    <div className="min-h-screen w-full bg-[#181820] p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Top Bar */}
        <header className="stone-panel rounded-sm px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#d9aa52] font-semibold">
              Overworld Shard Directory
            </p>
            <h1 className="font-display text-2xl text-[#f5f1e8]">
              Select a World Instance
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="stone-plaque px-3 py-1.5 rounded-sm text-xs flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[#d9aa52]" />
              <span className="font-mono-stat text-[#f3efe6]">{onlineCount}</span>
              <span className="text-[#a8a3b6]">Connected</span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="stone-button px-3 py-1.5 rounded-sm text-xs font-semibold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </header>

        {errorBanner && (
          <div className="stone-plaque border-red-500/70 bg-red-950/40 px-4 py-2.5 rounded-sm text-xs text-red-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-300 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Shared Character Identity Card */}
          <section className="lg:col-span-4 stone-panel rounded-sm p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#34313d] pb-3">
              <div className="w-16 h-16 stone-plaque rounded-sm flex items-center justify-center shrink-0">
                <PixelHeroPreview heroClass={character.heroClass} size={52} animate />
              </div>
              <div>
                <div className="font-display text-xl text-[#f5f1e8]">
                  {character.username}
                </div>
                <div className="text-xs text-[#d9aa52] font-semibold">
                  Lv. {character.level}/{MAX_LEVEL} {classDef.name}
                </div>
                <div className="text-[11px] font-mono-stat text-[#a7a2b5]">
                  Permanent EXP: {character.xp} | Honor: {character.arenaHonor}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#b5b0c4] font-semibold mb-2">
                Shared Attributes (Read-Only Adapter)
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {(
                  [
                    ['STR', character.attributes.strength],
                    ['VIT', character.attributes.vitality],
                    ['DEX', character.attributes.dexterity],
                    ['INT', character.attributes.intelligence],
                    ['FTH', character.attributes.faith],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="stone-plaque py-1.5 rounded-sm">
                    <div className="text-[10px] text-[#9b96a8]">{label}</div>
                    <div className="font-mono-stat text-xs font-bold text-[#f3efe6]">
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-[#b5b0c4] font-semibold">
                Equipped Armament
              </div>
              <div className="stone-plaque px-3 py-2 rounded-sm text-xs">
                <span className="text-[#9b96a8]">Weapon:</span>{' '}
                <span className="text-[#f3efe6] font-medium">
                  {weaponDef ? weaponDef.name : 'None'}
                </span>
              </div>
              <div className="stone-plaque px-3 py-2 rounded-sm text-xs">
                <span className="text-[#9b96a8]">Vestment:</span>{' '}
                <span className="text-[#f3efe6] font-medium">
                  {vestmentDef ? vestmentDef.name : 'None'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#9b96a8] leading-relaxed border-t border-[#34313d] pt-3">
              Permanent character progression originates from Beyond: Dungeons / shared universe services (DD-002, DD-027).
            </p>
          </section>

          {/* Right: Active Instances List */}
          <section className="lg:col-span-8 stone-panel rounded-sm p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-[#f5f1e8] flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#d9aa52]" />
                  Available Overworld Instances
                </h2>
                <span className="text-[11px] font-mono-stat text-[#a7a2b5]">
                  Target Cap: 100 / Shard
                </span>
              </div>

              {connectionState !== 'connected' ? (
                <div className="stone-plaque p-6 rounded-sm text-center text-xs text-[#b8b4c4]">
                  {connectionState === 'connecting'
                    ? 'Opening authenticated WebSocket link...'
                    : 'Disconnected from Overworld gateway.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {instances.map((inst) => (
                    <div
                      key={inst.instanceId}
                      className="stone-plaque px-4 py-3 rounded-sm flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-base text-[#f5f1e8]">
                            {inst.name}
                          </span>
                          <span className="text-[10px] font-mono-stat px-1.5 py-0.5 bg-[#16151c] border border-[#3a3745] text-[#d9aa52]">
                            {inst.instanceId}
                          </span>
                        </div>
                        <div className="text-xs text-[#9e99ad] mt-0.5">
                          {inst.regionLabel}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-mono-stat text-sm font-bold text-[#f3efe6]">
                            {inst.playerCount} / {inst.maxPlayers}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-emerald-400">
                            {inst.status}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={inst.status === 'full'}
                          onClick={() => onJoinInstance(inst.instanceId)}
                          className="stone-button stone-button-gold px-4 py-2 rounded-sm font-display text-sm"
                        >
                          {inst.status === 'full' ? 'Full' : 'Join Shard'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={handleCreate}
              className="pt-4 border-t border-[#34313d] flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                placeholder="Spin up new shard name (2–40 chars)..."
                minLength={2}
                maxLength={40}
                className="stone-input flex-1 px-3 py-2 rounded-sm text-xs"
              />
              <button
                type="submit"
                disabled={connectionState !== 'connected' || newInstanceName.trim().length < 2}
                className="stone-button px-4 py-2 rounded-sm text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-[#d9aa52]" />
                Create Shard
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};
