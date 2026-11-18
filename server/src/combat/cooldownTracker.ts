import {
  BASE_ARMAMENTS,
  type HeroClassId,
} from '../../../shared/constants/classes.ts';

export interface ActiveTacticalSkillInfo {
  skillId: string | null;
  cooldownDurationMs: number;
}

/**
 * Authoritative independent per-Tactical-Skill cooldown tracker (DD-019, DD-020).
 *
 * Rules strictly enforced:
 * 1. Every Tactical Skill maintains its own independent remaining cooldown timer keyed by skillId.
 * 2. Cooldowns continue ticking down even while the associated Weapon is unequipped.
 * 3. Re-equipping an Armament never resets or bypasses its remaining cooldown.
 */
export class CooldownTracker {
  resolveActiveTacticalSkill(
    _heroClass: HeroClassId,
    weaponId: string | null
  ): ActiveTacticalSkillInfo {
    if (!weaponId) {
      return { skillId: null, cooldownDurationMs: 0 };
    }
    const weapon = BASE_ARMAMENTS[weaponId];
    if (!weapon || !weapon.tacticalSkillId) {
      return { skillId: null, cooldownDurationMs: 0 };
    }
    return {
      skillId: weapon.tacticalSkillId,
      cooldownDurationMs: weapon.tacticalCooldownMs ?? 4500,
    };
  }

  tickCooldowns(cooldownsMs: Record<string, number>, dtMs: number): void {
    if (dtMs <= 0) return;
    for (const skillId of Object.keys(cooldownsMs)) {
      const next = Math.max(0, cooldownsMs[skillId] - dtMs);
      if (next <= 0) {
        delete cooldownsMs[skillId];
      } else {
        cooldownsMs[skillId] = next;
      }
    }
  }

  getRemainingCooldownMs(cooldownsMs: Record<string, number>, skillId: string | null): number {
    if (!skillId) return 0;
    return Math.max(0, cooldownsMs[skillId] ?? 0);
  }

  triggerTacticalCooldown(
    cooldownsMs: Record<string, number>,
    skillId: string,
    durationMs: number
  ): { triggered: boolean; remainingMs: number } {
    const existing = this.getRemainingCooldownMs(cooldownsMs, skillId);
    if (existing > 0) {
      return { triggered: false, remainingMs: existing };
    }
    cooldownsMs[skillId] = Math.max(0, Math.round(durationMs));
    return { triggered: true, remainingMs: cooldownsMs[skillId] };
  }
}
