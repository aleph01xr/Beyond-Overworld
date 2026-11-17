Beyond: Overworld — Game Design Document

Document Type: Core Gameplay Specification
Project: Beyond: Overworld
Universe: Beyond
Status: Design in progress

---

1. Game Identity

Beyond: Overworld is a multiplayer social and activity-focused game connected to Beyond: Dungeons.

Its primary purpose is to provide a shared environment where players can:

- Meet and interact with other players.
- Participate in open-world PvP.
- Compete in the Arena.
- Participate in PvPvE Survival.
- Join shared public events.
- Obtain exclusive equipment and rewards.

Overworld is not intended to be a second dungeon progression game.

Its activities complement the primary progression experience provided by Beyond: Dungeons.

2. Relationship With Beyond: Dungeons

Both games belong to the same universe.

System| Beyond: Dungeons| Beyond: Overworld
Character identity| Shared| Shared
Class| Shared| Shared
Level and EXP| Primary progression| Secondary rewards
Attributes| Shared| Shared
Weapons| Dungeon equipment| Overworld equipment
Vestments| Dungeon equipment| Overworld equipment
Boss encounters| Primary| Not currently specified
PvP| Not established here| Core activity
Survival| Dungeon runs| PvPvE activity
Public events| Not established here| Core activity

Both games must use a common character identity and permanent progression system.

Neither game should create conflicting character records.

3. Character System

Players retain the same character when moving between the two games.

The shared character includes:

- Character ID.
- Account ID.
- Username.
- Class.
- Level.
- Permanent EXP.
- Attributes.
- Weapon.
- Vestment.
- Permanent unlocks.

The character's permanent data must be synchronized through a shared service or API.

Overworld must not independently determine permanent character progression.

Class Compatibility

Equipment is class-specific.

A Weapon or Vestment must only be usable by its compatible class or classes.

The existing class definitions from Beyond: Dungeons must be inspected before implementing class-specific equipment.

Do not invent replacement class identities or alter existing class mechanics without approval.

4. Progression and Rewards

Beyond: Dungeons remains the main source of permanent EXP.

Overworld can provide permanent EXP, but its rewards must be lower than comparable dungeon progression rewards.

Overworld should focus more heavily on activity-specific rewards.

Reward Categories

Permanent Rewards

- Permanent EXP.
- Equipment.
- Titles.
- Cosmetics.
- Permanent unlocks.

Activity-Specific Rewards

- Arena Honor.
- Survival rewards.
- Event rewards.
- Competitive recognition.

Arena Honor must remain separate from permanent EXP.

The exact reward amounts, progression curves, and shop prices are not yet finalized.

Do not invent final economy values.

5. Armament System

The shared Armament system contains two equipment slots:

1. Weapon.
2. Vestment.

Both equipment types can introduce distinct mechanics.

5.1 Weapons

Weapons may:

- Change or replace the class Basic Attack.
- Introduce their own passive effect.
- Completely replace the class's default Tactical Skill.

A Tactical Replacement Weapon makes the default Tactical Skill unavailable while that weapon is equipped.

5.2 Vestments

Vestments may:

- Introduce passive effects.
- Modify existing abilities.
- Replace appropriate class abilities.
- Provide defensive or utility mechanics.

Vestments do not modify Basic Attacks.

5.3 Tactical Skill Cooldowns

Each Tactical Skill has its own independent cooldown.

Rules:

- Cooldowns continue while equipment is unequipped.
- Re-equipping an item cannot reset its cooldown.
- Different Tactical Skills do not share cooldowns.
- Cooldowns are validated by the server.
- Cooldowns must reflect the strength and utility of each ability.

High-damage abilities must not be excessively spammable.

5.4 Equipment Switching

Players cannot switch Armament during active combat.

This restriction applies to:

- Open-world PvP.
- Arena combat.
- Survival combat.
- Dungeon combat.
- Active public event combat.

Equipment changes are allowed in safe zones and appropriate preparation areas when the player is not in active combat.

6. World and Instance Design

Overworld uses shared multiplayer instances.

Instance Capacity

Target capacity: 100 players per instance.

The server must manage:

- Player connections.
- Instance allocation.
- Player positions.
- World state.
- Instance capacity.
- Disconnections and reconnections.

The capacity target must be verified through load testing.

World Zones

Safe Zones

Safe zones provide protected areas for players.

Rules:

- Player attacks are disabled.
- Players can socialize.
- Players can prepare for activities.
- Equipment changes are allowed outside active combat.

Open World

Outside safe zones, player combat is permitted.

Environmental threats may also exist.

Arena

A designated competitive PvP area.

Arena participation contributes to Arena Honor.

Survival Grounds

A dedicated PvPvE activity area where players face both environmental enemies and other players.

7. PvP System

Overworld supports open-world PvP.

Open-World Combat

- Players can attack other players outside safe zones.
- Safe zones prevent player attacks.
- The server validates all player damage.
- Client-side combat results are never trusted.

Arena

The Arena provides a competitive environment.

It has its own Honor reward system.

The detailed matchmaking, ranking, scoring, and reward formulas remain undecided.

Do not invent these systems without approval.

Equipment Restrictions

Armament cannot be changed during active PvP combat.

Death or respawning must not automatically provide an equipment-switching exploit during an ongoing encounter.

8. PvPvE Survival

Survival combines environmental threats and player combat.

Players must contend with:

- Environmental enemies.
- Other players.
- Survival challenges.

Survival has its own temporary session state.

Temporary Survival state must not overwrite permanent character progression.

Survival rewards may include:

- Permanent EXP.
- Exclusive equipment.
- Cosmetics.
- Survival-specific rewards.

The exact Survival rules, session duration, enemy scaling, and reward calculations remain undecided.

9. Public Events

Public events are shared multiplayer activities.

All participating players in the same event must receive consistent event state.

The server controls:

- Event activation.
- Event progression.
- Objective completion.
- Event rewards.
- Event termination.

Events may provide:

- EXP.
- Equipment.
- Cosmetics.
- Honor.
- Event-exclusive rewards.

The actual event types and mechanics will be designed separately.

10. Death and Revive Behavior

The established Overworld death behavior is revive.

Death should not automatically erase permanent character progression.

Temporary activity state must be handled separately from permanent character data.

The exact revive rules, respawn locations, timers, and penalties remain to be designed.

Do not invent these details during implementation.

11. Multiplayer and Networking

Overworld must use server-authoritative multiplayer architecture.

The server is responsible for:

- Player movement validation.
- Collision handling.
- Combat validation.
- Damage calculation.
- Ability cooldowns.
- Player death and revival.
- Activity state.
- Reward distribution.
- World synchronization.

The client is responsible for:

- Rendering.
- Input collection.
- User interface.
- Visual effects.
- Audio.
- Local responsiveness and prediction where appropriate.

The server must never trust client-reported damage, rewards, EXP, or cooldown completion.

12. Game Integration

Beyond: Overworld and Beyond: Dungeons are separate games.

Integration should eventually support:

- Shared account identity.
- Shared character identity.
- Shared permanent EXP.
- Shared attributes.
- Shared Armament.
- Transfers between game experiences.

Game transfers must preserve permanent character data.

Temporary gameplay state must remain isolated within its respective game.

Do not implement direct database sharing or assume an existing shared API without first inspecting Beyond: Dungeons.

13. Unspecified Systems

The following are intentionally not finalized:

- Exact world map layout.
- Movement speed and movement abilities.
- Arena matchmaking.
- Arena ranking formulas.
- Honor prices and reward economy.
- Survival session rules.
- Survival enemy scaling.
- Death penalties and revive timers.
- Public event types.
- Public event schedules.
- Exact EXP rewards.
- Equipment statistics and individual effects.
- PvP stat normalization.
- Party and guild systems.
- Trading and player economy.

These require explicit design approval before implementation.

14. Design Enforcement

All implementation must follow this document and the project README.

When Gemini encounters an unspecified mechanic:

1. Identify the missing decision.
2. Explain the available design choices.
3. Ask for approval.
4. Wait for confirmation before implementing it.

Do not silently fill design gaps with generic MMORPG mechanics.

The goal is to implement Beyond: Overworld as designed, not to independently redesign the game.
