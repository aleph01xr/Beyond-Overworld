Beyond: Overworld — Design Decisions

Project: Beyond: Overworld
Document Type: Approved Design Decisions
Authority: Game Director
Status: Initial Decisions Recorded

This document records established and approved design decisions for Beyond: Overworld.

These decisions must be preserved throughout development.

Gemini and other AI development assistants must not independently change, reinterpret, or discard them.

---

1. Universe Structure

DD-001: Two Connected Games

Status: Approved

The Beyond universe consists of two separate games:

- Beyond: Dungeons.
- Beyond: Overworld.

They operate independently but belong to the same universe.

DD-002: Shared Character Identity

Status: Approved

Both games use the same permanent character identity and progression.

Players do not create separate permanent characters for each experience.

DD-003: Hybrid Connection

Status: Approved

The games are independent experiences with a connection that allows players to travel between them.

---

2. Game Purpose

DD-004: Dungeons Is the Primary Progression Experience

Status: Approved

Beyond: Dungeons is the primary source of permanent character progression.

It provides the main progression experience through dungeon exploration, bosses, EXP, and equipment.

DD-005: Overworld Is Activity-Focused

Status: Approved

Beyond: Overworld primarily exists for:

- Social interaction.
- Open-world PvP.
- Arena competition.
- PvPvE Survival.
- Public events.

It must not become a second dungeon-focused progression game.

DD-006: Overworld EXP

Status: Approved

Overworld may provide permanent EXP.

However, Dungeons must remain substantially more rewarding for permanent character progression.

---

3. Multiplayer World

DD-007: Instance Capacity

Status: Approved

The target capacity is 100 players per shared Overworld instance.

Actual capacity must be verified through testing.

DD-008: Shared Public Events

Status: Approved

Public events are shared activities.

Players participating in the same event must interact with consistent event state.

DD-009: Death Behavior

Status: Approved

Overworld uses a revive-based death behavior.

The exact revive mechanics remain to be designed.

---

4. PvP and Activities

DD-010: Safe Zones

Status: Approved

Player attacks are disabled inside safe zones.

DD-011: Open-World PvP

Status: Approved

Players can attack other players outside safe zones.

DD-012: Arena Honor

Status: Approved

The designated Arena provides Honor rewards.

Honor is separate from permanent EXP.

DD-013: PvPvE Survival

Status: Approved

Survival combines environmental enemies and player-versus-player combat.

Players can be threatened by both.

---

5. Character and Equipment

DD-014: Shared Armament

Status: Approved

Both games use the same Weapon and Vestment equipment slots.

Equipment obtained from either game can be used in the corresponding shared slot, subject to class compatibility.

DD-015: Class-Specific Equipment

Status: Approved

Weapons and Vestments are class-specific.

DD-016: Distinct Equipment Mechanics

Status: Approved

Equipment must introduce meaningful mechanical differences.

It should not merely be a different visual appearance or a minor statistical variation.

DD-017: Weapon Mechanics

Status: Approved

Weapons may:

- Change or replace the class Basic Attack.
- Introduce their own passive.
- Completely replace the class Tactical Skill.

DD-018: Vestment Mechanics

Status: Approved

Vestments may:

- Introduce their own passive.
- Modify appropriate abilities.
- Replace appropriate abilities.
- Introduce defensive or utility mechanics.

Vestments do not modify Basic Attacks.

DD-019: Tactical Skill Replacement

Status: Approved

A Weapon that replaces a Tactical Skill completely replaces the class's default Tactical Skill while equipped.

The default Tactical Skill becomes unavailable until the Weapon is unequipped.

DD-020: Independent Tactical Cooldowns

Status: Approved

Every Tactical Skill maintains its own independent cooldown.

Cooldowns continue while the associated equipment is unequipped.

Re-equipping an item cannot reset or bypass its cooldown.

DD-021: No Equipment Switching During Combat

Status: Approved

Players cannot switch Armament during active combat.

This includes:

- PvP.
- Arena combat.
- Survival combat.
- Dungeon combat.
- Active public event combat.

---

6. Visual Identity

DD-022: Preserve Beyond's Established Visual Identity

Status: Approved

Beyond: Overworld must visually belong to the same universe as Beyond: Dungeons.

Established visual references must be preserved.

This includes:

- Character designs.
- Class appearances.
- Character proportions.
- Sprite style.
- Animations.
- Weapons.
- Vestments.
- Enemy designs.
- Environmental art.
- UI design.
- Visual effects.
- Color palettes.

DD-023: Original Assets Must Be Respected

Status: Approved

Existing Beyond: Dungeons assets must be reused where appropriate.

AI development tools must not casually redesign, replace, or overwrite original assets.

When references are missing, request them instead of inventing replacements.

DD-024: Visual Consistency for New Content

Status: Approved

New Overworld content must follow the established Beyond visual identity.

New environments, equipment, characters, enemies, animations, and UI elements must look like they belong to the same universe.

---

7. Technical Principles

DD-025: Independent Runtime Architecture

Status: Approved

Overworld must operate independently from Dungeons.

It has its own client, server, simulation, multiplayer sessions, and temporary gameplay state.

DD-026: Server Authority

Status: Approved

The server is authoritative over important gameplay outcomes.

This includes movement validation, combat, damage, cooldowns, death, rewards, and event state.

DD-027: No Duplicate Permanent Progression

Status: Approved

Overworld must not create a competing permanent character progression database.

Permanent character data must eventually be managed through shared Beyond Universe services.

DD-028: No Unauthorized Dungeons Changes

Status: Approved

Working in the Overworld repository does not authorize modifications to Beyond: Dungeons.

Changes to the Dungeons repository require explicit authorization.

---

8. Unresolved Decisions

The following decisions are not yet finalized:

- Exact Overworld map layout.
- Character movement parameters.
- Arena matchmaking and ranking.
- Arena reward formulas.
- PvP stat normalization.
- Survival session rules.
- Survival enemy scaling.
- Revive timers and penalties.
- Public event types and schedules.
- Equipment statistics and individual effects.
- Trading and player economy.
- Exact EXP reward amounts.
- Character transfer procedure.
- Shared API implementation.

These must not be treated as approved merely because an AI assistant proposes them.

---

9. Decision Change Protocol

Only the Game Director can approve changes to established design decisions.

When a change is proposed:

1. Identify the affected decision ID.
2. Explain why the change is necessary.
3. Describe its gameplay and technical consequences.
4. Wait for explicit approval.
5. Update this document.
6. Record the change in CHANGELOG.md.

Never silently modify an approved decision.

---

Final Authority

The Game Director has final authority over Beyond: Overworld's gameplay, visual identity, and creative direction.

AI assistants are responsible for implementation, analysis, and recommendations.

They are not authorized to independently redesign the game.

Preserve the vision. Implement the decisions. Ask before changing them.
