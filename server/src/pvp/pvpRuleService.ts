import {
  BASE_ARMAMENTS,
  type ArmamentSlot,
} from '../../../shared/constants/classes.ts';
import { getZoneAtWorld } from '../../../shared/movement/playerMovement.ts';
import type { OverworldPlayerState, WorldMapData } from '../../../shared/types/domain.ts';
import type { CooldownTracker } from '../combat/cooldownTracker.ts';

export const COMBAT_LOCK_DURATION_MS = 5000;

export interface CombatProbeEvaluation {
  allowed: boolean;
  code?: string;
  reason?: string;
  combatLockMs?: number;
  triggeredSkillId?: string;
  cooldownRemainingMs?: number;
}

export interface ArmamentSwitchEvaluation {
  allowed: boolean;
  code?: string;
  reason?: string;
}

/**
 * Enforces Safe-Zone protection (DD-010), open-world PvP zone boundary checks (DD-011),
 * and active-combat / Safe-Zone Armament switching restrictions (DD-021).
 *
 * Unapproved PvP damage formulas and stat normalization are intentionally omitted
 * pending Game Director design approval (GAME_DESIGN.md Section 13).
 */
export class PvpRuleService {
  evaluateCombatProbe(
    player: OverworldPlayerState,
    map: WorldMapData,
    kind: 'basic' | 'tactical',
    cooldownTracker: CooldownTracker
  ): CombatProbeEvaluation {
    const authoritativeZone = getZoneAtWorld(map, player.x, player.y);
    player.zone = authoritativeZone;

    if (authoritativeZone === 'safe') {
      return {
        allowed: false,
        code: 'SAFE_ZONE_PROTECTED',
        reason: 'Player attacks are disabled inside Safe Zones (DD-010).',
      };
    }

    if (kind === 'tactical') {
      const skillInfo = cooldownTracker.resolveActiveTacticalSkill(
        player.heroClass,
        player.weaponId
      );
      if (!skillInfo.skillId) {
        return {
          allowed: false,
          code: 'NO_TACTICAL_SKILL',
          reason: 'No Weapon Tactical Skill is currently equipped (DD-019).',
        };
      }

      const result = cooldownTracker.triggerTacticalCooldown(
        player.tacticalCooldownsMs,
        skillInfo.skillId,
        skillInfo.cooldownDurationMs
      );
      if (!result.triggered) {
        return {
          allowed: false,
          code: 'SKILL_ON_COOLDOWN',
          reason: `Tactical Skill is on cooldown (${(result.remainingMs / 1000).toFixed(1)}s remaining).`,
          cooldownRemainingMs: result.remainingMs,
        };
      }

      return {
        allowed: true,
        combatLockMs: COMBAT_LOCK_DURATION_MS,
        triggeredSkillId: skillInfo.skillId,
        cooldownRemainingMs: result.remainingMs,
      };
    }

    return {
      allowed: true,
      combatLockMs: COMBAT_LOCK_DURATION_MS,
    };
  }

  validateArmamentSwitch(
    player: OverworldPlayerState,
    map: WorldMapData,
    slot: ArmamentSlot,
    itemId: string | null
  ): ArmamentSwitchEvaluation {
    const authoritativeZone = getZoneAtWorld(map, player.x, player.y);
    player.zone = authoritativeZone;

    if (authoritativeZone !== 'safe') {
      return {
        allowed: false,
        code: 'OUTSIDE_SAFE_ZONE',
        reason: 'Armaments may only be switched inside Safe Zones or preparation areas.',
      };
    }

    if (player.inCombat || player.combatLockRemainingMs > 0) {
      return {
        allowed: false,
        code: 'IN_ACTIVE_COMBAT',
        reason: `Cannot switch Armaments during active combat (${(
          player.combatLockRemainingMs / 1000
        ).toFixed(1)}s lock remaining, DD-021).`,
      };
    }

    if (itemId !== null) {
      const item = BASE_ARMAMENTS[itemId];
      if (!item) {
        return {
          allowed: false,
          code: 'UNKNOWN_ARMAMENT',
          reason: `Unknown Armament "${itemId}".`,
        };
      }
      if (item.slot !== slot) {
        return {
          allowed: false,
          code: 'INVALID_ARMAMENT_SLOT',
          reason: `${item.name} must be equipped in the ${item.slot} slot.`,
        };
      }
      if (!item.compatibleClasses.includes(player.heroClass)) {
        return {
          allowed: false,
          code: 'CLASS_INCOMPATIBLE',
          reason: `${item.name} is incompatible with ${player.heroClass} (DD-015).`,
        };
      }
    }

    return { allowed: true };
  }
}
