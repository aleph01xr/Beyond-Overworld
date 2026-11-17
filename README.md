Beyond: Overworld

A connected multiplayer experience in the Beyond universe.

Beyond: Overworld is a standalone multiplayer game focused on social interaction, open-world PvP, PvPvE survival, and shared community events.

It is the second experience in the Beyond universe, alongside Beyond: Dungeons.

Related Repository

- Beyond: Dungeons: https://github.com/aleph01xr/Beyond-Dungeons
- Beyond: Overworld: This repository.

The two games operate independently but share the same permanent character identity and progression.

---

1. The Beyond Universe

The Beyond universe consists of two interconnected games.

Beyond: Dungeons

Beyond: Dungeons is the primary progression experience.

Its responsibilities include:

- Dungeon exploration.
- Boss encounters.
- Character development.
- Primary permanent EXP acquisition.
- Dungeon-exclusive rewards and equipment.

Beyond: Overworld

Beyond: Overworld is the shared multiplayer activity experience.

Its responsibilities include:

- Social interaction.
- Open-world PvP.
- Competitive Arena activities.
- PvPvE Survival.
- Shared public events.
- Overworld-exclusive equipment and rewards.

Important: Overworld is not intended to replace Dungeons as the primary progression experience.

---

2. Shared Character Identity

Both games use the same permanent character identity.

The following information is intended to be shared:

- Account and character identity.
- Character class.
- Character level and permanent EXP.
- Character attributes.
- Equipped Weapon.
- Equipped Vestment.
- Permanent unlocks and progression.

The exact shared data contract must be established through integration planning.

Overworld must not independently create a competing permanent character progression system.

Temporary gameplay state must remain separate between games.

Examples include:

- Dungeon run progress.
- Temporary dungeon artifacts.
- Survival session state.
- Active event participation.
- Temporary combat effects.

---

3. Progression Philosophy

Beyond: Dungeons remains the primary source of permanent character progression.

Overworld may award permanent EXP, but its rewards must be balanced so that Dungeons remains substantially more rewarding for character progression.

Overworld progression and rewards should emphasize:

- Arena Honor.
- Competitive recognition.
- Survival rewards.
- Public event rewards.
- Overworld-exclusive equipment.
- Titles and cosmetics.

Overworld activities must not become mandatory progression bottlenecks for dungeon players.

---

4. World Architecture

Overworld uses shared multiplayer world instances.

Instance Requirements

- Target capacity: 100 players per shared instance.
- Server-authoritative gameplay.
- Synchronized player movement.
- Shared public event state.
- Independent instance management.
- Reconnection support.

The 100-player target is a design requirement, not a claim of verified scalability. Performance must be measured through load testing.

World Zones

The world supports different gameplay zones.

Safe Zones

- Player attacks are disabled.
- Players can socialize and prepare.
- Armament changes are permitted when not in active combat.

Open World

- Player combat is permitted outside safe zones.
- Players can encounter other players and environmental threats.

Arena

- Designated competitive PvP environment.
- Players can earn Arena Honor.
- Competitive rewards and recognition.

Survival Grounds

- PvPvE activity.
- Players face environmental enemies and other players.
- Survival-specific rewards.

These are gameplay zones and do not necessarily require separate world instances.

---

5. Combat and Equipment

Overworld uses the shared Armament system.

Characters have two equipment slots:

- Weapon.
- Vestment.

Equipment obtained from either game can be used in the corresponding shared slot, subject to class compatibility.

Weapon Mechanics

Weapons may:

- Replace or modify a class's Basic Attack.
- Provide unique passive effects.
- Completely replace the class's default Tactical Skill.

Vestment Mechanics

Vestments may:

- Provide unique passive effects.
- Modify or replace appropriate class abilities.
- Introduce distinct defensive or utility mechanics.

Equipment must have meaningful mechanical differences, not merely different statistics or visual appearances.

Equipment Restrictions

- Equipment is class-specific.
- Tactical Skills maintain independent cooldowns.
- Cooldowns continue while their associated equipment is unequipped.
- Equipping or re-equipping an item must not reset its cooldown.
- Equipment cannot be switched during active combat, including PvP and Survival combat.

All combat validation must remain server-authoritative.

---

6. Activities

Arena PvP

The Arena provides structured competitive PvP.

Arena Honor is a separate reward currency from permanent EXP.

Its rewards may include:

- Competitive ranks.
- Titles.
- Cosmetics.
- Arena-exclusive equipment.

Open-World PvP

Players can fight outside designated safe zones.

Safe zones must always enforce their protection rules server-side.

PvPvE Survival

Survival combines environmental enemies with player-versus-player combat.

It should reward survival, adaptability, and successful participation.

Public Events

Public events are shared activities.

Players participating in the same event must receive consistent event state and outcomes from the authoritative server.

Event rewards may include equipment, cosmetics, Honor, and other event-specific rewards.

---

7. Technical Independence

Beyond: Overworld must operate as an independent game.

It must have its own:

- Client application.
- Game server.
- World simulation.
- Multiplayer sessions.
- Activity systems.
- Temporary gameplay state.

It must not require Beyond: Dungeons to be running.

Integration with the Beyond universe should happen through clearly defined shared services and APIs.

The initial implementation may use temporary development adapters, but these must not be mistaken for the final shared progression architecture.

---

8. Development Rules

These rules apply to all AI-assisted development, including Gemini AI Studio.

1. Read the project documentation before implementing features.
2. Do not invent unapproved gameplay mechanics.
3. Do not silently change established design decisions.
4. Ask for clarification when a requirement is ambiguous.
5. Do not modify Beyond: Dungeons when working in this repository.
6. Do not duplicate the permanent character progression database.
7. Preserve server authority over movement, combat, rewards, and world state.
8. Keep gameplay modules modular and independently testable.
9. Do not claim a feature works without testing it.
10. Document important architectural decisions and their consequences.
11. Avoid unnecessary abstractions and premature optimization.
12. Prioritize correctness, maintainability, and consistency with the Beyond universe.

When a proposed implementation conflicts with this document, stop and request clarification before proceeding.

---

9. Project Status

Status: Architecture and foundation planning.

Features described in this document represent the intended design. They must not be considered implemented merely because they appear here.

Implementation, integration, and scalability must be verified through actual testing.

---

Beyond: Overworld

One universe. Two experiences. One character.
