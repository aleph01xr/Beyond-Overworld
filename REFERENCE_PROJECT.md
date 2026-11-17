Beyond Universe — Reference Project Specification

1. Primary Reference Repository

Beyond: Dungeons is the primary reference implementation for Beyond: Overworld.

Repository:
https://github.com/aleph01xr/Beyond-Dungeons

Beyond: Overworld must be developed with a comprehensive understanding of the existing Dungeons project.

The reference is not limited to visual assets.

2. Full Repository Inspection

Before major implementation, inspect the entire accessible Beyond: Dungeons repository.

This includes:

Game Systems

- Character systems.
- Classes and abilities.
- Attributes and progression.
- Combat calculations.
- Cooldowns and status effects.
- Equipment and Armament.
- Enemy AI and behavior.
- World and dungeon systems.
- Interactions and activities.

Visual Systems

- Character sprites.
- Animations.
- Rendering implementation.
- UI components.
- Visual effects.
- Environmental assets.
- Asset loading and management.

Technical Systems

- Frontend architecture.
- Backend architecture.
- Networking.
- WebSocket protocols.
- Server simulation.
- Authentication.
- Database schemas.
- Persistence.
- APIs.
- Shared types and validation.
- Deployment configuration.

3. Reference and Compatibility

Existing Beyond: Dungeons implementations must be treated as authoritative references for established Beyond systems.

Do not independently recreate an existing system without first understanding how it works.

When Overworld needs an equivalent system, determine whether it should:

1. Reuse an existing implementation or asset.
2. Adapt an existing implementation for Overworld.
3. Create a separate implementation that preserves compatibility.
4. Introduce an entirely new system with Game Director approval when it affects established design.

Not every Dungeons system needs to exist in Overworld.

Only reuse systems relevant to Overworld's intended gameplay.

4. Repository Independence

Beyond: Overworld remains a separate project.

Do not:

- Merge the two repositories.
- Copy the entire Dungeons codebase.
- Modify the Dungeons repository.
- Assume both games share the same runtime.
- Duplicate permanent character progression unnecessarily.

Reuse and integration must respect the independent architecture of both games.

5. Inspection Report

Before major implementation, produce a reference audit containing:

- Existing systems and their locations.
- Relevant source files.
- Existing reusable assets.
- Existing reusable logic.
- Existing APIs and data structures.
- Systems requiring adaptation.
- Systems that must remain separate.
- Potential integration conflicts.
- Missing information.

Distinguish verified findings from assumptions.

6. Change Control

The reference project must not be treated as permission to change Beyond: Dungeons.

All work in the Overworld repository must remain isolated unless the Game Director explicitly authorizes changes to the Dungeons repository.

Core principle: Understand Beyond before expanding Beyond.
