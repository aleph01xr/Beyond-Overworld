Beyond: Overworld — Changelog

All notable changes to Beyond: Overworld must be documented here.

This changelog records implemented changes, approved design changes, bug fixes, architectural modifications, and known limitations.

Documentation alone does not mean a feature has been implemented.

---

[Unreleased]

Project Status

- Initial project documentation and architecture planning.
- Core gameplay specifications established.
- Technical architecture proposed.
- Integration with Beyond: Dungeons planned.

Planned

- [x] Initial client and server foundation.
- [x] Database foundation.
- [x] Authentication foundation.
- [x] Character integration adapter.
- [x] Multiplayer WebSocket foundation.
- [x] World instance manager.
- [x] Server-authoritative movement.
- [x] Safe-zone protection.
- [ ] Open-world PvP foundation. (Awaiting PvP stat normalization & combat formula approval)
- [ ] Arena system. (Scaffold boundary only; matchmaking, ranking & Honor formulas awaiting design approval)
- [ ] PvPvE Survival system. (Scaffold boundary only; session rules & enemy scaling awaiting design approval)
- [ ] Public event system. (Scaffold boundary only; event types & schedules awaiting design approval)
- [ ] Shared Beyond Universe integration. (DevCharacterAdapter active; live Beyond API awaiting integration milestone)

Visual Development

- [x] Audit Beyond: Dungeons visual assets.
- [x] Establish Overworld art direction.
- [x] Establish reusable character asset references.
- [ ] Establish environment and tileset references. (Foundation stub grid active; final world biome art awaiting approval)
- [x] Establish animation and visual effect standards.
- [x] Establish UI visual standards.

---

[0.1.1] — 2026-11-17 (Phase 1 — UI & Controls Parity)

Added

- Mobile touch gamepad (`client/src/ui/TouchControls.tsx`) with floating & fixed virtual joysticks, smooth analog movement, multitouch handling, safe-area support, and Overworld-supported combat probes.
- Saved touch & display settings (`client/src/ui/TouchSettingsModal.tsx`) persisted in `localStorage` (`beyond_overworld_touch_settings`) plus `Always Show Touch Gamepad` testing toggle and Fullscreen mode.
- Update Log panel and modal (`client/src/ui/OverworldChangelogModal.tsx`) displayed alongside the login card.

Changed

- Rebuilt `AuthScreen.tsx`, `InstanceLobby.tsx`, `OverworldHud.tsx`, and `.stone-*` theme rules (`client/src/ui/index.css`) to match `Beyond: Dungeons`' dark fantasy atmosphere, floating pixel embers, stone-bevel layout, password visibility toggle, top HUD action bar, and responsive spacing while retaining Overworld auth APIs and Overworld-specific readouts.
- Remapped desktop Tactical Skill probe binding from `[E]` to `[Q]` alongside `WASD` / Arrow movement and `[Space / LMB]` Basic Attack probe to match `Beyond: Dungeons`, keeping inputs blocked during chat typing and released cleanly on blur/visibility/modal focus/leave.

Fixed

- Updated `OverworldNetworkClient.sendInput()` to include normalized analog `stickX` and `stickY` in the input-change signature and `isMoving` check, transmit stop packets immediately on release, maintain sequence reconciliation, and eliminate idle WebSocket traffic.
- Updated `normalizePlayerInputDirection` and `hasMovementInput` (`shared/movement/playerMovement.ts`) to use a consistent `> 0.05` radial magnitude threshold and normalized diagonal movement.

Testing

- Vitest suite (`server/tests/foundation.test.ts`): 9/9 tests passing, including analog `stickX`/`stickY` movement, diagonal normalization, wall collision, `OverworldNetworkClient.sendInput` analog deduplication/idle silence, and `LocalPredictionController` bounds/reconciliation.
- Live HTTP + WebSocket smoke test against port 3000 passed (register, login, `OVERWORLD-1` join, analog diagonal `player:input`, immediate velocity stop on release, Safe Zone `Q` tactical probe rejection).
- Interactive touchscreen drag/multitouch gestures on physical mobile hardware not tested in this headless container (desktop + headless WS + unit suites verified).

---

[0.1.0] — 2026-11-17

Added

- Full-stack React 19 + Vite 6 + Tailwind v4 + Express + `ws` server foundation (`server.ts`, `client/`, `shared/`).
- Overworld-only PostgreSQL schema and initial migration (`database/schemas/overworld.sql`, `database/migrations/001_initial_overworld.sql`) with in-memory fallback when `DATABASE_URL` is unset and strict isolation from permanent character progression (`DD-027`).
- Session authentication (`scryptSync` password hashing, 24-hour tokens, HTTP auth routes, WebSocket `Sec-WebSocket-Protocol` handshake).
- `CharacterIntegrationLayer` (`DevCharacterAdapter`) mirroring `Beyond: Dungeons` classes (`vanguard`, `ranger`, `arcanist`, `cleric`), `MAX_LEVEL = 50`, 5 attributes, and shared `Weapon`/`Vestment` slots (`DD-014`–`DD-015`).
- `WorldInstanceManager` and `WorldInstance` with `100`-player target shard capacity (`DD-007`), `O(instanceSize)` `InstanceClientIndex`, backpressure protection, 40 Hz (`25ms`) simulation loop, entity-diff delta snapshots, and 15-second disconnect/reconnect grace handling.
- Deterministic shared movement and wall-sliding collision (`shared/movement/playerMovement.ts`) paired with client sequence-based prediction/reconciliation (`client/src/game/world/prediction.ts`) and a clearly marked non-final **Development Foundation Map**.
- Server-authoritative Safe-Zone attack blocking (`DD-010`), combat lock (`DD-021`) restricting Armament swaps to Safe Zones outside active combat, and independent per-Tactical-Skill cooldown persistence across unequip/re-equip (`DD-019`, `DD-020`).
- Isolated placeholder module boundaries for Arena, PvPvE Survival, and Shared Public Events reporting `awaiting_design_approval`.

Visual

- Audited `Beyond: Dungeons` (see `REFERENCE_AUDIT.md`) and integrated verbatim Canvas 2D procedural hero sprites (`heroSprites.ts`, `directionalFacing.ts`, `PixelHeroPreview.tsx`) and `.stone-*` UI theme tokens (`ART_DIRECTION.md`).

Testing

- Vitest foundation suite (`server/tests/foundation.test.ts`): 100-player instance capacity cap & reconnect state preservation, Safe-Zone attack blocking (`DD-010`), non-Safe-Zone attack probes (`DD-011`), independent tactical cooldowns across unequip/re-equip (`DD-020`), active combat / Safe-Zone Armament switch locks (`DD-021`), wall collision & zone detection, entity-diff delta reconstruction, and Zod protocol schema validation.
- Live WebSocket 100-socket network load benchmark not yet executed.

---

Changelog Rules

Every meaningful implementation change must include:

- Date.
- Version or commit reference, when available.
- Category.
- Description.
- Affected systems.
- Testing status.

Categories

- "Added" — New functionality.
- "Changed" — Modifications to existing functionality.
- "Fixed" — Bug fixes.
- "Removed" — Removed functionality.
- "Security" — Security-related changes.
- "Performance" — Performance improvements.
- "Visual" — Art, animation, UI, and visual changes.
- "Architecture" — Structural or technical changes.
- "Documentation" — Documentation changes.

Entry Requirements

1. Only document changes that were actually made.
2. Never describe planned features as completed.
3. Identify incomplete or partially tested features.
4. Record changes that affect established gameplay mechanics.
5. Record changes that affect character appearance or visual assets.
6. Identify any deviation from approved documentation.
7. Reference relevant commits when possible.
8. Do not silently overwrite historical entries.

Example Entry

[0.1.0] — YYYY-MM-DD

Added

- Initial multiplayer connection system.

Architecture

- Established server-authoritative player movement.

Visual

- Integrated approved character sprite assets.

Testing

- Basic connection test completed.
- 100-player capacity not yet verified.

---

Versioning Guidelines

Use semantic-style versioning where appropriate:

- "0.x.x" — Early development and foundational systems.
- "1.0.0" — First stable release.
- Minor increments — Significant feature additions.
- Patch increments — Fixes and small improvements.

Version numbers must reflect actual development progress.

---

Development principle: The changelog is a historical record of what happened, not a list of promises about what will happen.
