import React, { useState } from 'react';
import { Shield, Swords, Sparkles, Sun, LogIn, UserPlus } from 'lucide-react';
import {
  HERO_CLASSES,
  HERO_CLASS_LIST,
  type HeroClassId,
} from '../../../shared/constants/classes.ts';
import type { CharacterIdentity } from '../../../shared/types/domain.ts';
import { PixelHeroPreview } from './PixelHeroPreview.tsx';

interface AuthScreenProps {
  onAuthenticated: (payload: { token: string; character: CharacterIdentity }) => void;
}

const CLASS_ICON_MAP: Record<HeroClassId, React.ReactNode> = {
  vanguard: <Shield className="w-4 h-4 text-amber-300" />,
  ranger: <Swords className="w-4 h-4 text-emerald-300" />,
  arcanist: <Sparkles className="w-4 h-4 text-indigo-300" />,
  cleric: <Sun className="w-4 h-4 text-yellow-200" />,
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [heroClass, setHeroClass] = useState<HeroClassId>('vanguard');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedDef = HERO_CLASSES[heroClass];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { username, password }
          : { username, password, heroClass };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        token?: string;
        character?: CharacterIdentity;
        error?: string;
      };

      if (!res.ok || !data.token || !data.character) {
        setError(data.error ?? 'Authentication failed.');
        return;
      }

      onAuthenticated({ token: data.token, character: data.character });
    } catch {
      setError('Unable to reach Beyond: Overworld server.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDevCredentials = () => {
    setMode('login');
    setUsername('wanderer');
    setPassword('wanderer123');
    setError(null);
  };

  return (
    <div className="min-h-screen w-full bg-[#181820] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Auth Form */}
        <div className="lg:col-span-5 stone-panel rounded-sm p-6 flex flex-col justify-between">
          <div>
            <div className="border-b border-[#34313d] pb-4 mb-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#d9aa52] font-semibold">
                Beyond Universe
              </p>
              <h1 className="font-display text-3xl text-[#f5f1e8] mt-1 tracking-wide">
                Beyond: Overworld
              </h1>
              <p className="text-xs text-[#b8b4c4] mt-1 leading-relaxed">
                Enter shared multiplayer instances with your persistent Beyond character identity.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`stone-button py-2 px-3 rounded-sm text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  mode === 'login' ? 'stone-button-gold' : ''
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`stone-button py-2 px-3 rounded-sm text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  mode === 'register' ? 'stone-button-gold' : ''
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#d2cedc] mb-1.5">
                  Adventurer Name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="2–20 characters"
                  required
                  minLength={2}
                  maxLength={20}
                  className="stone-input w-full px-3 py-2 rounded-sm text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#d2cedc] mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                  className="stone-input w-full px-3 py-2 rounded-sm text-sm"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-[#d2cedc] mb-1.5">
                    Shared Class Identity
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {HERO_CLASS_LIST.map((def) => (
                      <button
                        key={def.id}
                        type="button"
                        onClick={() => setHeroClass(def.id)}
                        className={`stone-plaque px-2.5 py-2 rounded-sm text-left flex items-center gap-2 transition-colors ${
                          heroClass === def.id
                            ? 'border-[#d9aa52] bg-[#2f2b38]'
                            : 'hover:border-[#6a6578]'
                        }`}
                      >
                        {CLASS_ICON_MAP[def.id]}
                        <div>
                          <div className="font-display text-sm text-[#f5f1e8]">
                            {def.name}
                          </div>
                          <div className="text-[10px] text-[#9b96a8]">
                            {def.roleBadge}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="stone-plaque border-red-500/60 bg-red-950/40 px-3 py-2 rounded-sm text-xs text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="stone-button stone-button-gold w-full py-2.5 rounded-sm font-display text-base tracking-wide"
              >
                {submitting
                  ? 'Connecting...'
                  : mode === 'login'
                  ? 'Enter Overworld'
                  : 'Forge Identity & Enter'}
              </button>
            </form>
          </div>

          <div className="mt-5 pt-4 border-t border-[#34313d] flex items-center justify-between text-[11px] text-[#a6a1b5]">
            <span>Server-authoritative session</span>
            <button
              type="button"
              onClick={fillDevCredentials}
              className="text-[#d9aa52] hover:underline font-medium"
            >
              Use Dev Account (wanderer)
            </button>
          </div>
        </div>

        {/* Right: Beyond Class Showcase */}
        <div className="lg:col-span-7 stone-panel rounded-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#34313d] pb-3 mb-4">
              <div>
                <h2 className="font-display text-xl text-[#f5f1e8]">
                  Shared Beyond Class Archive
                </h2>
                <p className="text-xs text-[#b8b4c4]">
                  Character classes, proportions, and sprites preserved from Beyond: Dungeons
                </p>
              </div>
              <span className="text-[11px] font-mono-stat px-2 py-1 stone-plaque rounded-sm text-[#d9aa52]">
                {selectedDef.roleBadge}
              </span>
            </div>

            <div className="stone-plaque rounded-sm p-5 flex flex-col sm:flex-row items-center gap-6">
              <div className="w-32 h-32 stone-input rounded-sm flex items-center justify-center shrink-0">
                <PixelHeroPreview heroClass={heroClass} size={96} animate />
              </div>

              <div className="space-y-2 text-center sm:text-left">
                <div>
                  <h3 className="font-display text-2xl text-[#f5f1e8]">
                    {selectedDef.name}
                  </h3>
                  <p className="text-xs font-semibold text-[#d9aa52]">
                    {selectedDef.title} — {selectedDef.role}
                  </p>
                </div>
                <p className="text-xs text-[#c7c3d1] leading-relaxed">
                  {selectedDef.lore}
                </p>
                <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="stone-input px-2.5 py-1.5 rounded-sm">
                    <span className="text-[#9b96a8]">Default Weapon:</span>{' '}
                    <span className="text-[#f3efe6] font-medium">{selectedDef.weapon}</span>
                  </div>
                  <div className="stone-input px-2.5 py-1.5 rounded-sm">
                    <span className="text-[#9b96a8]">Tactical Skill:</span>{' '}
                    <span className="text-[#d9aa52] font-medium">{selectedDef.tacticalName}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
            {HERO_CLASS_LIST.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => setHeroClass(def.id)}
                className={`stone-plaque p-2 rounded-sm flex flex-col items-center gap-1 transition-all ${
                  heroClass === def.id
                    ? 'border-[#d9aa52] bg-[#2e2a37]'
                    : 'opacity-80 hover:opacity-100'
                }`}
              >
                <PixelHeroPreview heroClass={def.id} size={44} animate={heroClass === def.id} />
                <span className="font-display text-xs text-[#f3efe6]">{def.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
