Beyond: Overworld — Technical Architecture

Project: Beyond: Overworld
Universe: Beyond
Status: Initial Architecture Specification
Architecture Type: Standalone Multiplayer Game with Shared Universe Integration

---

1. Architectural Vision

Beyond: Overworld is an independent multiplayer game connected to Beyond: Dungeons.

It must operate independently while preparing for shared character identity, permanent progression, and equipment integration.

The architecture must prioritize:

- Modularity.
- Server-authoritative gameplay.
- Multiplayer scalability.
- Maintainability.
- Visual consistency.
- Future integration.
- Separation of temporary and permanent data.

Do not build unnecessary systems before they are needed.

2. Technology Stack

The proposed technology stack is:

Layer| Technology
Frontend| React
Build Tool| Vite
Language| TypeScript
Backend| Node.js
HTTP Server| Express
Multiplayer| WebSocket ("ws")
Database| PostgreSQL
Validation| Zod or equivalent
Testing| Vitest

Inspect the repository before selecting or replacing dependencies.

Do not introduce additional infrastructure without explaining why it is necessary.

3. Project Structure

Use a modular client/server structure.

Proposed structure:

Beyond-Overworld/
│
├── client/
│   ├── src/
│   │   ├── game/
│   │   │   ├── world/
│   │   │   ├── entities/
│   │   │   ├── characters/
│   │   │   ├── combat/
│   │   │   ├── activities/
│   │   │   └── rendering/
│   │   │
│   │   ├── systems/
│   │   ├── networking/
│   │   ├── assets/
│   │   ├── ui/
│   │   └── main/
│   │
│   └── public/
│
├── server/
│   ├── src/
│   │   ├── auth/
│   │   ├── characters/
│   │   ├── world/
│   │   ├── instances/
│   │   ├── movement/
│   │   ├── combat/
│   │   ├── pvp/
│   │   ├── arena/
│   │   ├── survival/
│   │   ├── events/
│   │   ├── progression/
│   │   ├── networking/
│   │   └── persistence/
│   │
│   └── tests/
│
├── shared/
│   ├── types/
│   ├── protocols/
│   ├── constants/
│   └── validation/
│
├── database/
│   ├── migrations/
│   └── schemas/
│
├── docs/
│
├── README.md
├── GAME_DESIGN.md
├── ARCHITECTURE.md
├── ART_DIRECTION.md
├── CHANGELOG.md
└── DESIGN_DECISIONS.md

This is a proposed organization, not a requirement to create every directory immediately.

4. Client Architecture

The client handles presentation and player interaction.

Responsibilities:

- Rendering the world.
- Rendering player characters.
- Rendering enemies and objects.
- Playing animations.
- Collecting player input.
- Displaying UI.
- Displaying combat effects.
- Displaying activity information.
- Managing local prediction where appropriate.

The client must not determine authoritative gameplay outcomes.

Rendering System

Keep rendering independent from gameplay logic.

World rendering, entity rendering, character animation, UI, and visual effects should be separate modules.

This makes future visual improvements easier without rewriting game logic.

5. Visual Asset Architecture

Visual consistency with Beyond: Dungeons is mandatory.

Existing visual assets and character references must be treated as authoritative references.

The architecture must support reusable assets for:

- Character sprites.
- Class appearances.
- Character animations.
- Weapons.
- Vestments.
- Enemies.
- Environmental objects.
- Tilesets.
- UI elements.
- Visual effects.

Asset Preservation Rules

1. Never casually redesign established characters.
2. Never change character proportions without approval.
3. Preserve established pixel-art rendering style.
4. Preserve sprite scale and animation conventions.
5. Reuse original assets when appropriate and available.
6. Keep original reference assets unchanged.
7. Do not generate replacement sprites when original assets are available.
8. New assets must visually belong to the Beyond universe.

Create an organized asset manifest so assets can be identified and reused consistently.

If source assets or visual references are unavailable, request them instead of guessing.

6. Server Architecture

The server is authoritative.

It controls:

- Player movement validation.
- Collision detection.
- World state.
- Combat calculations.
- Damage validation.
- Ability cooldowns.
- Player death and revival.
- PvP rules.
- Activity progression.
- Event state.
- Reward distribution.

The client may predict movement and display immediate visual feedback, but the server determines actual outcomes.

7. World Instance Manager

The World Instance Manager controls shared Overworld instances.

Responsibilities:

- Instance creation.
- Instance allocation.
- Player admission.
- Player removal.
- Instance capacity.
- Instance state.
- Disconnection handling.
- Reconnection handling.

Target capacity is 100 players per instance.

Do not assume this capacity is achieved until load tests verify it.

The architecture should avoid placing all world logic into one global server state.

8. Multiplayer Networking

Use WebSocket communication for real-time multiplayer.

The networking system must support:

- Connection authentication.
- Player joining.
- Player leaving.
- Movement updates.
- State synchronization.
- Combat requests.
- Activity updates.
- Reconnection.
- Message validation.

Use structured and versioned message protocols.

Validate incoming messages on the server.

Never trust client-reported damage, EXP, rewards, or cooldown completion.

Network messages should distinguish between:

- Player inputs.
- Server-authoritative state updates.
- Reliable gameplay events.
- Non-critical visual or synchronization updates.

9. Combat Architecture

Combat logic must be separate from rendering.

Suggested modules:

- Combat Controller.
- Ability Manager.
- Damage Calculator.
- Cooldown Manager.
- Status Effect Manager.
- Collision and Hit Detection.
- Death and Revive Manager.

All important combat decisions must be validated by the server.

Combat must respect the shared class and Armament definitions.

Do not invent or replace existing class mechanics.

10. PvP Architecture

PvP rules should be handled by dedicated server-side systems.

The server determines whether a player can attack another player based on:

- Current zone.
- Safe-zone protection.
- Activity rules.
- Combat state.
- Valid target state.

Arena and open-world PvP may have different rules, but their exact differences must be approved before implementation.

11. Activity Architecture

Activities must be modular.

Each activity should manage its own temporary state while using shared world and character services.

Initial activity modules:

- Arena.
- Survival.
- Public Events.

An activity must not directly modify permanent character records without going through the progression integration layer.

12. Character Integration Layer

Overworld must not create an independent permanent character progression database.

Create a Character Integration Layer that provides a consistent interface for:

- Character identity.
- Class.
- Level.
- EXP.
- Attributes.
- Weapon.
- Vestment.
- Permanent unlocks.

During early development, a temporary adapter may provide test characters.

Later, this adapter will connect to the shared Beyond Universe character service.

Do not assume the existing Dungeons database structure. Inspect Beyond: Dungeons before defining the final integration contract.

13. Progression Integration

Permanent progression must be handled through a dedicated integration layer.

This layer is responsible for requesting and applying approved permanent rewards.

Examples:

- Permanent EXP.
- Equipment acquisition.
- Permanent unlocks.
- Character progression updates.

Activity-specific rewards such as Arena Honor must remain distinct from permanent EXP.

Temporary activity state must never overwrite permanent character progression.

14. Database Architecture

Use PostgreSQL for persistent Overworld-specific data.

The database may store:

- Overworld activity records.
- Arena Honor transactions.
- Survival results.
- Public event records.
- Instance-related persistent information.
- Overworld-specific reward records.

Do not duplicate permanent account and character progression records.

The final database ownership boundaries must be established during Beyond Universe integration planning.

Use migrations for schema changes.

Never make undocumented destructive database changes.

15. Security

Security responsibilities include:

- Authentication validation.
- Authorization checks.
- Server-side combat validation.
- Server-side reward validation.
- Input validation.
- Rate limiting.
- WebSocket connection protection.
- Database access controls.
- Protection against duplicate reward claims.

Never trust client-side values for permanent progression.

16. Testing and Performance

Every major system must have appropriate tests.

Testing should cover:

- Movement synchronization.
- Instance admission and capacity.
- Reconnection.
- Combat validation.
- Safe-zone enforcement.
- Cooldown persistence.
- Reward validation.
- Character adapter behavior.
- Database persistence.

Load testing must evaluate the 100-player target.

Do not claim scalability or reliability without actual measurements.

17. Integration With Beyond: Dungeons

Beyond: Overworld and Beyond: Dungeons remain independent runtime environments.

The intended integration boundary includes:

- Shared account identity.
- Shared character identity.
- Shared progression.
- Shared attributes.
- Shared Armament.
- Game-to-game transfers.

Integration should use clearly defined APIs or shared services.

Do not directly couple the two game servers.

Do not modify the Beyond: Dungeons repository while implementing Overworld unless explicitly authorized.

18. Architecture Enforcement

Gemini must:

1. Inspect the existing repository before implementation.
2. Read all project documentation.
3. Follow approved gameplay and visual specifications.
4. Preserve modular boundaries.
5. Avoid unnecessary dependencies.
6. Never silently replace architectural decisions.
7. Document significant changes.
8. Test implemented functionality.
9. Identify incomplete systems honestly.
10. Request approval when a change affects established design.

This document defines the intended architecture, not proof that the systems already exist.

The architecture must serve the design of Beyond: Overworld, never redefine it.
