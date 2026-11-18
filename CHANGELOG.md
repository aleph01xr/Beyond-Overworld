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

[0.1.3] — 2026-11-18 (Shared Beyond: Dungeons Account Integration)

Added

- Persistent PostgreSQL & fallback table `overworld_character_links` via migration `database/migrations/002_overworld_character_links.sql` mapping authoritative Beyond `account_id` to persistent Overworld `character_id`, Overworld Arena Honor, and equipped Armament slots without duplicating Dungeons permanent progression.
- Persistent assertion replay tracking table `identity_assertion_replays` via migration `database/migrations/003_identity_assertion_replays.sql` with atomic PostgreSQL consumption (`consumeAssertionReplay`), preserving replay protection across restarts and multiple Overworld instances.
- Backend HTTP endpoint `POST /api/auth/external-assertion` verifying HMAC-SHA256 signed Beyond: Dungeons identity assertions (`exp` expiration validation, clock-skew bounds, and persistent single-use replay protection) alongside public capability endpoint `GET /api/auth/config` and URL `?assertion=` handoff support in `App.tsx`.
- Modular Express app factory `server/src/httpApp.ts` cleanly mapping unreachable/failing Dungeons responses to structured HTTP `503`/`409`/`403`/`401`/`400` errors.

Changed

- Activated `DungeonsIdentityProvider` (`server/src/auth/identityProvider.ts`) and `AuthService.register()` to execute authenticated server-to-server `POST ${DUNGEONS_API_URL}/api/internal/identity/verify-credentials`, `POST ${DUNGEONS_API_URL}/api/internal/identity/register`, and `GET ${DUNGEONS_API_URL}/api/internal/identity/account/:accountId` requests matching `Beyond-Dungeons` (`Authorization: Bearer` + `X-Beyond-Identity-Secret`), enabling both login and Dungeons-owned account creation through Overworld.
- Updated `initDatabase()` (`server/src/persistence/database.ts`) and `server.ts` so production (`NODE_ENV=production`) fails fast on startup if `DATABASE_URL` is missing or PostgreSQL is unreachable instead of silently falling back to temporary in-memory storage.
- Updated `DevCharacterAdapter` (`server/src/characters/characterIntegrationAdapter.ts`) so re-syncing authoritative Dungeons progression preserves existing `characterId`, Overworld `arenaHonor`, and compatible equipped Armament across reconnects and restarts.
- Configured production mode (`NODE_ENV=production`) across `identityConfig.ts`, `authService.ts`, `httpApp.ts`, and `AuthScreen.tsx` to enforce Beyond: Dungeons as the sole identity provider for login and registration while strictly disabling Dev Login and local authentication fallbacks.

Testing

- Expanded `server/tests/identityIntegration.test.ts` verifying live HTTP mock Dungeons verification & registration (`/api/internal/identity/verify-credentials`, `/api/internal/identity/register`, `/api/internal/identity/account/:accountId`), unreachable/5xx failure handling, cross-instance persistent replay protection, production DB fail-fast startup, exclusive Dungeons-driven `isAdmin` enforcement, and Honor/`characterId` preservation across restarts.

---

[0.1.2] — 2026-11-17 (Shared Identity Integration Preparation)

Added

- Backend-only external identity configuration resolver (`server/src/auth/identityConfig.ts`) supporting `DUNGEONS_API_URL` and `BEYOND_IDENTITY_SECRET` with safe unconfigured/partial diagnostics and zero client secret exposure.
- Identity provider abstraction (`server/src/auth/identityProvider.ts`) separating `LocalIdentityProvider` (`local_dev`) from the prepared `DungeonsIdentityProvider` (`dungeons`, `isOperational: false` until Dungeons backend becomes available) with strict HMAC-SHA256 assertion verification helpers (`verifySignedAssertion`).
- Server-side administrator authorization guard (`server/src/auth/adminAuthorization.ts`) with `isServerAdmin`, `assertServerAdmin`, `requireAdminSession`, and `/api/admin/status` foundation endpoint.
- Shared authoritative account contract (`SharedAccountIdentity` in `shared/types/domain.ts`) supporting `accountId`, `username`, `isAdmin`, `preferredClass`, `lockedClass`, `level`, `xp`, `strength`, `vitality`, `dexterity`, `intelligence`, `faith`, and `attributePoints`.

Changed

- Refactored `AuthService` (`server/src/auth/authService.ts`) to issue local Overworld sessions bound to authoritative `accountId`, `isAdmin`, and `provider`, while preserving existing local login, registration, and `wanderer` dev seed account flows.
- Extended `CharacterIntegrationLayer` and `DevCharacterAdapter` (`server/src/characters/characterIntegrationAdapter.ts`) with non-destructive `syncAuthoritativeIdentity()` keyed by `accountId`.
- Propagated server-verified `isAdmin` and `provider` onto `/api/auth/me`, `AuthenticatedWsClient` (`wsTransport.ts`, `wsGateway.ts`), and sanitized `identityProvider` status onto `/api/health`.

Testing

- Vitest suite (`server/tests/foundation.test.ts` & `server/tests/identityIntegration.test.ts`): 13/13 tests passing.
- Verified local auth/registration/dev-seed continuity, rejection of unsigned/tampered assertions, refusal of client/username-based admin elevation (`Aleph` remains non-admin), missing/partial external config safety, and `DevCharacterAdapter` authoritative sync.
- Live Beyond: Dungeons backend login/transfer remains inactive until the Dungeons backend service is connected.

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
