# Beyond: Overworld — Reference Project Audit (`Beyond-Dungeons`)

- **Audited Repository:** `https://github.com/aleph01xr/Beyond-Dungeons` (inspected read-only at commit `481bd69` — `feat: release v1.7.0 balancing and fixes`)
- **Audit Target:** `Beyond-Overworld` (per `REFERENCE_PROJECT.md` Section 5: Inspection Report)
- **Audit Scope:** Full inspection of Game Systems, Visual Systems, Technical Systems, Assets, Persistence, and Integration Boundaries.
- **Modification Guarantee:** Zero modifications made to `Beyond-Dungeons`. No gameplay implemented in `Beyond-Overworld`.

---

## 1. Executive Summary (Verified Findings vs. Assumptions)

`Beyond-Dungeons` is a full-stack real-time co-op action RPG built with React 19, Tailwind CSS v4, TypeScript, Express, raw `ws` WebSockets, PostgreSQL (`pg`), and LiveKit spatial voice (`livekit-client` / `livekit-server-sdk`).

Key verified findings that directly govern `Beyond-Overworld` planning:

1. **No Dynamic Weapon/Vestment Armament Item System Exists Yet:** While `Beyond-Overworld` specifications (`README.md`, `GAME_DESIGN.md`, `DESIGN_DECISIONS` DD-014 through DD-021) assume switchable `Weapon` and `Vestment` items with distinct active/passive replacements, `Beyond-Dungeons` currently defines **one fixed Weapon and one static Vestment label per class** in `HERO_CLASSES` (`src/shared/types.ts`) and `CharacterInventoryModal.tsx`. The actual equippable/storable gear system in `Beyond-Dungeons` is the **14-item Relic system** (`RELIC_CATALOG` + `RELIC_SYNERGIES`, max 5 equipped + 12 in Storage Vault).
2. **All Character, Enemy, NPC, and Tile Visuals Are Procedural Canvas 2D Pixel Art:** `Beyond-Dungeons` does **not** use external character/enemy sprite sheets. Heroes, enemies, bosses, NPCs, fallen ghosts, dungeon tiles, and most combat particles are drawn procedurally via HTML5 `<canvas>` 2D API calls in `src/client/*.ts` and `src/components/GameCanvas.tsx`.
3. **Auth & Sessions Are Local to the Monolithic `server.ts` Process:** Authentication uses Express REST endpoints backed by an in-memory `sessionsByToken` `Map` (24h TTL) and a PostgreSQL `accounts` table (with JSON file fallback `data/accounts.json`). There is no external/shared identity provider, JWT token service, or cross-game character API yet.
4. **PostgreSQL vs. JSON Storage Divergence:** `AccountRecord.storedRelics` is persisted in `data/accounts.json`, but the PostgreSQL `accounts` table created in `server.ts` lacks a `stored_relics` column.
5. **Existing 50-Player Social Hub Precedent:** `TAVERN-HUB` in `src/server/gameEngine.ts` and `src/server/partyCoordinator.ts` already runs a multi-player social hub (`maxPlayers = 50`, `floor = 0`, NPCs, dialogue choices, training dummies) over the same `ws` + `snapshotDelta` architecture.

---

## 2. Existing Systems and Their Locations

### 2.1 Root & Configuration Files
| File | Purpose / Verified Role |
|---|---|
| `package.json` | Node `>=22.0.0`, ESM (`"type": "module"`). Scripts: `dev` (`tsx server.ts`), `build` (`vite build && esbuild server.ts ... --outfile=server.js`), `start` (`node server.js`), `lint` (`tsc --noEmit`), `test` (`tsx test_regression.ts`). |
| `server.ts` | Single-process monolithic Express + `ws` server (1,790 lines): PostgreSQL/JSON account persistence, auth routes, LiveKit voice token/report routes, admin import/export routes, WebSocket message routing, 40 Hz simulation loop, Vite dev middleware / static `dist/` serving. |
| `server.js` | Committed esbuild production bundle of `server.ts` (8,270 lines). |
| `render.yaml` | Render Singapore deployment (`beyond-game-sg`, PostgreSQL `beyond-db-sg`, `LIVEKIT_*` env vars, `MIGRATION_ADMIN_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD`). |
| `.github/workflows/deploy-itchio.yml` | Builds dist with `VITE_SERVER_URL=https://beyond-game-sg.onrender.com` and pushes HTML5 build to itch.io via `butler`. |
| `.env.example` | Lists `DATABASE_URL`, `MAINTENANCE_MODE`, `MIGRATION_ADMIN_SECRET`, `TARGET_SERVER_URL`, `VITE_SERVER_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. |
| `index.html` & `src/index.css` | Loads Google Fonts (`Pixelify Sans`, `Plus Jakarta Sans`, `JetBrains Mono`), dark theme `#181820` / `#ECEAF2`, Tailwind v4 `@import "tailwindcss"`, `.pixelated`, and `.stone-*` UI theme classes. |
| `test_regression.ts` | Regression test suite run via `tsx test_regression.ts` covering `GameRoom`, targeting, movement, sprites, particles, and changelog data. |

### 2.2 Shared Modules (`src/shared/`)
| File | Lines | Verified Responsibilities |
|---|---|---|
| `src/shared/types.ts` | 842 | Core domain types and constants: `HeroClassId`, `HERO_CLASSES`, `RELIC_CATALOG`, `FLOOR_BLESSINGS`, `MAX_LEVEL = 50`, `MAX_ATTRIBUTE = 100`, `CRIT_DAMAGE_MULTIPLIER = 1.25`, `TILE_SIZE = 32`, `AccountRecord`, `UserProfile`, `PlayerState`, `EnemyState`, `ProjectileState`, `PropState`, `FieldZoneState`, `DungeonMap`, `GameSnapshot`, `ClientMessage`, `ServerMessage`. |
| `src/shared/statUtils.ts` | 340 | Deterministic stat projection calculator (`calculatePlayerStatProjections`) and `RELIC_SYNERGIES` (4 dual-relic combos). Mirrors server combat/DoT/CDR/resist scaling. |
| `src/shared/statusEffects.ts` | 338 | Metadata registry for 10 boss-inflicted `GUARDIAN_STATUS_EFFECTS` and 9 `COMBAT_STATUS_EFFECTS` (`burn`, `freeze`, `shock`, `poison`, `bleed`, `stun`, `slow`, `silence`, `marked`). |
| `src/shared/playerMovement.ts` | 311 | Deterministic movement & collision math shared identically between server simulation and client prediction: `isWallAtWorld`, `hasLineOfSight`, `collidesCircle`, `moveWithCollision`, `computePlayerMoveSpeed`, `normalizePlayerInputDirection`, `stepPlayerMovement`. |
| `src/shared/abilityTargeting.ts` | 304 | Shared ability aim specs (`DASH_TARGET_SPEC`, `CLASS_ABILITY_SPECS`, `PRIMARY_ATTACK_RANGES`), `simulateDashEndpoint`, `computeGroundTargetPosition`, `findBestAutoTarget`. |
| `src/shared/snapshotDelta.ts` | 390 | Authoritative delta compression: `cloneSnapshotBaseline`, `computeSnapshotDelta`, `applySnapshotDelta` (entity-level field diffs for `players` and `enemies`, array replacement for projectiles/zones/props/NPCs/dummies/flags). |

### 2.3 Server Modules (`src/server/`)
| File | Lines | Verified Responsibilities |
|---|---|---|
| `src/server/gameEngine.ts` | 5,766 | `GameRoom` class: 40 Hz room tick, player join/reconnect, class stats/combat/abilities/cooldowns, hard-CC diminishing returns, DoT & status effect ticks, 14 relics + synergies, XP/leveling, enemy AI + 10 floor bosses, death/downed/revive (`downedTimerMs = 18000`), Tavern Hub NPCs/dummies, admin cheats, snapshot building. |
| `src/server/dungeonGenerator.ts` | 1,141 | Deterministic PRNG (`mulberry32`), 10 dungeon biomes (`courtyard` through `wardengate`), 64x48 tile dungeon floor generator (`generateDungeonFloor`), enemy/boss stat scaling (`getEnemyResistances`), and 48x34 Tavern Hub generator (`generateTavernFloor`). |
| `src/server/partyCoordinator.ts` | 511 | `PartyCoordinator`: room lifecycle (`TAVERN-HUB` + `BYND-XXXX` expedition rooms), capacity checks, host transfer, ready checks, 60s expedition disconnect grace timer vs. immediate removal in Tavern/waiting lobby. |
| `src/server/wsTransport.ts` | 210 | `sendRawFrame`, `sendJsonMessage`, `broadcastSerialized`, `RoomClientIndex`: O(roomSize) room membership index and WebSocket backpressure shedding (`64 KB` high-water droppable ticks, `512 KB` critical disconnect, `100` max consecutive drops). |

### 2.4 Client Modules (`src/client/`) & UI (`src/components/`)
| File | Lines | Verified Responsibilities |
|---|---|---|
| `src/App.tsx` | 623 | Auth state (`sessionStorage` token), WebSocket lifecycle + auto-reconnect, `room:tick` / `room:delta` sequence reconciliation, HUD key throttling, screen state (`AUTH`, `LOBBY`, `PLAYING`). |
| `src/client/apiConfig.ts` | 30 | `BACKEND_URL` resolution (`VITE_SERVER_URL`, auto-fallback to Render SG on `itch.io`/`vercel.app`, relative URL otherwise), `getApiEndpoint()`, `getWsUrl()`. |
| `src/client/networkStats.ts` | 401 | `SERVER_TICK_MS = 25` (40 Hz), `PingTracker`, `buildSnapshotHudKey`, `ReliableInputDispatcher` (quantized input dedup, 34ms continuous throttle, zero-loss key-up/attack retry). |
| `src/client/prediction.ts` | 264 | `LocalPredictionController`: runs `stepPlayerMovement` every render frame with server sequence ack reconciliation (`HARD_SNAP_ERROR_PX = 96`, exponential error decay `18/s`). |
| `src/client/camera.ts` | 98 | Orientation-independent zoom (`MIN_CAMERA_ZOOM = 1.2`, `MAX_CAMERA_ZOOM = 1.65`), `stepCameraFollow`, `computeWorldAimAngle`, `getWorldViewBounds`. |
| `src/client/directionalFacing.ts` | 231 | 8-way directional quantization (`E, SE, S, SW, W, NW, N, NE`), `VerticalPlane` (`front`, `side`, `back`), `resolvePlayerDirection8`, `resolveEnemyDirection8`, `resolveNpcDirection8`. |
| `src/client/heroSprites.ts` | 1,246 | Procedural Canvas 2D 8-directional pixel-art rendering for all 4 hero classes (`drawHeroSprite`), walking/dashing bob, weapon aim, swing arcs. |
| `src/client/enemySprites.ts` | 1,562 | Procedural Canvas 2D pixel-art rendering for 12 enemy types (`slime`, `goblin`, `skeleton`, `cultist`, `knight`, `shadow_stalker`, `astral_sentinel`, `hymn_phantom`, `relic_golem`, `veiled_heretic`, `celestial_arbiter`, `warden_enforcer`, plus generic fallback). |
| `src/client/npcSprites.ts` | 2,775 | Procedural Canvas 2D pixel-art rendering for Tavern NPCs (`drawInnkeeperBram`, `drawBarkeeperLena` / generic, `Veteran Jorah`, `Aleph`) and 5 humanoid floor bosses (`Elyndor`, `Zadkiel`, `Sariel`, `Seraphel`, `Oriphiel` via `drawHumanoidBoss`). |
| `src/client/fallenPlayerSprite.ts` | 507 | Procedural downed body & hovering ghost spirit renderer (`drawFallenAndGhostPlayer`) with class-specific attire. |
| `src/client/dungeonDecorations.ts` | 1,479 | Procedural tile/prop/portal/shrine/chest/crate/dummy/Tavern decoration renderers. |
| `src/client/canvasEffects.ts` | 6,541 | Pooled procedural particle engine (`ParticleManager`, 12 geometric pixel-art particle shapes), `drawEnhancedProjectile`, and optional `/assets/slash_fx/` overlay loader. |
| `src/client/abilityIndicator.ts` | 496 | Ground/dash/cone/AoE targeting preview indicators drawn on canvas. |
| `src/client/desktopInput.ts` | 88 | Desktop input angle-delta and editable-element focus helpers. |
| `src/client/fullscreen.ts` | 68 | Fullscreen toggle hook (`useFullscreenState`). |
| `src/client/sound.ts`, `soundManager.ts`, `soundManagerDiagnostic.ts`, `bossSfxRedesign_v2.ts` | 3,912 | Web Audio API procedural synthesizer SFX & ambient audio system (zero external audio files). |
| `src/client/voice/voiceClient.ts` | 654 | LiveKit WebRTC spatial proximity voice manager (`MAX_HEAR_DISTANCE_PX = 600`, `STEREO_PAN_SPAN_PX = 360`, push-to-talk & toggle, per-user mute/deafen). |
| `src/components/*.tsx` | ~15k | `GameCanvas.tsx` (5,262 lines), `DungeonRunView.tsx` (2,058), `SanctuaryLobby.tsx` (1,068), `TouchControls.tsx` (976), `CharacterInventoryModal.tsx` (865), `VoiceHUD.tsx` (751), `AdminPanel.tsx` (733), `LoginScreen.tsx` (477), `PartyLobbyView.tsx` (578), `TouchSettingsModal.tsx` (585), `GameMenuModal.tsx` (400), `PixelHeroPreview.tsx` (381), `ExpandedMapModal.tsx` (318), `ExpeditionGateModal.tsx` (473), `CinematicIntroOverlay.tsx` (181), `CombatEffects.tsx` (134), `ChangelogPanel.tsx` (144), `FullChangelogModal.tsx` (333). |

---

## 3. Existing Reusable Visual & Audio Assets

### 3.1 Procedural Visual Assets (Authoritative Character, Enemy, & World Style)
- **Hero Sprites (`src/client/heroSprites.ts`, `src/components/PixelHeroPreview.tsx`, `src/client/fallenPlayerSprite.ts`):**
  - 4 established classes with fixed palettes and silhouettes in `HERO_CLASSES`:
    - `vanguard` (Tank — Ironcrest Bastion): `#64748B` primary, `#CBD5E1` secondary, `#991B1B` cape, `#F59E0B` accent, `#FBBF24` glow; Sunforged Claymore & Tower Greatshield.
    - `ranger` (Marksman — Thornwood Marksman): `#2D5A3C` primary, `#4ADE80` secondary, `#1A3826` cape, `#FBBF24` accent, `#34D399` glow; Ashwood Recurve & Barbed Quiver.
    - `arcanist` (Caster — Astral Conduit): `#4338CA` primary, `#818CF8` secondary, `#312E81` cape, `#38BDF8` accent, `#60A5FA` glow; Runebound Spire & Orbiting Astral Orbs.
    - `cleric` (Support — Sunbrand Prelate): `#E2E8F0` primary, `#FDE047` secondary, `#854D0E` cape, `#FACC15` accent, `#FEF08A` glow; Dawnstar Flanged Mace & Reliquary.
  - Rendering conventions: `ctx.imageSmoothingEnabled = false`, CSS `.pixelated` (`image-rendering: pixelated; crisp-edges`), `TILE_SIZE = 32`, player collision radius `9` (`stepPlayerMovement`), camera zoom `1.2x`–`1.65x`, 8-directional facing (`N, NE, E, SE, S, SW, W, NW`) with horizontal Y-axis mirroring for `W/NW/SW` and un-mirrored symmetry for pure `N/S`.
- **NPCs (`src/client/npcSprites.ts`):** Handcrafted pixel-art renderers for `npc_lena` (Barkeep Lena), `npc_bram` (Innkeeper Bram), `npc_jorah` (Veteran Jorah), and `npc_aleph` (Aleph, `mysterious_cloak`), plus generic fallback.
- **Enemies & Bosses (`src/client/enemySprites.ts`, `src/client/npcSprites.ts`):** 12 regular/elite enemy kinds (`radius` varies, e.g., boss `28`) and 10 floor bosses (Floors 6–10 bosses have dedicated humanoid pixel renderers).
- **UI Visual Standard (`src/index.css`):** Stone-bevel aesthetic (`.stone-panel`, `.stone-plaque`, `.stone-input`, `.stone-button` with gold/red/blue/green/dark variants), `Pixelify Sans` headings, `Plus Jakarta Sans` body, `JetBrains Mono` numerical HUD.

### 3.2 Static Image & Binary Assets in Repository
| Location | Contents | Verified Usage |
|---|---|---|
| `public/assets/slash_fx/` | `slash_combo1..3.png` (896x128, 768x128, 512x128), `slash_simple1..3.png` (384x128, 384x128, 512x128), `slash_small1..3.png` (384x128, 512x128, 512x128), plus `.gif` and `* sheet.png` variants. | Preloaded by `src/components/CombatEffects.tsx` (`slash_*.png`) and `src/client/canvasEffects.ts`. |
| `public/assets/aistudio/4603091-200_1d82cf7b.png` | 200x200 PNG microphone/voice icon. | Used in `src/components/VoiceHUD.tsx`. |
| `src/assets/images/` | 7 JPEG images (1408x768): `elyndor_boss_*.jpg`, `oriphiel_boss_*.jpg`, `sariel_boss_*.jpg`, `sariel_boss_2_*.jpg`, `seraphel_boss_*.jpg`, `seraphel_oriphiel_elyndor_*.jpg`, `zadkiel_boss_*.jpg`. | **Unreferenced** in `src/`; boss concept/reference illustrations. |
| `public/assets/aistudio/*.md`, `*.txt`, `*.jpg`, `*.zip` | Design notes (`Beyond___Boss_Overhaul...md`, `Beyond_Crowd_Control_Balance_Plan...md`, `Combat___Relic_Balance___Hybrid_DoT_Scaling...md`), `bossSfxRedesign_v2_*.txt`, screenshot, and `SlashFX_Combos_*.zip`. | Reference/archive artifacts, not loaded at runtime. |
| `public/assets/icons/status/*.png` | **Missing on disk.** | Referenced by `iconAssetPath` in `src/shared/statusEffects.ts`, but `public/assets/icons/` does not exist. |

### 3.3 Audio Assets
- **100% Procedural Web Audio API (`src/client/sound.ts`, `soundManager.ts`, `bossSfxRedesign_v2.ts`):** Synthesizes UI clicks, attack/ability SFX, boss cues, and tavern ambience without external `.mp3`/`.wav` files.

---

## 4. Existing Reusable Logic

1. **Shared Deterministic Movement & Collision (`src/shared/playerMovement.ts`):**
   - Server (`GameRoom.tick`) and client (`LocalPredictionController`) execute the exact same `stepPlayerMovement` / `moveWithCollision` / `computePlayerMoveSpeed` functions with circle perimeter probes (radius `9` for players) and wall sliding. Directly reusable for Overworld movement & safe-zone/arena boundaries (if using a 32px tile grid or adapted collider abstraction).
2. **Ability Targeting & Aim Spec Contract (`src/shared/abilityTargeting.ts` & `src/client/abilityIndicator.ts`):**
   - Unified `AbilityTargetSpec` for Dash (`range: 110`), Tactical, and Ultimate abilities per class, plus `PRIMARY_ATTACK_RANGES` (`vanguard: 81`, `ranger: 210`, `arcanist: 195`, `cleric: 175`). Directly reusable to keep combat feel identical across games.
3. **Character Stat, Resistance, & DoT Formulas (`src/shared/statUtils.ts` & `src/server/gameEngine.ts`):**
   - `MAX_LEVEL = 50`, `MAX_ATTRIBUTE = 100`, `CRIT_DAMAGE_MULTIPLIER = 1.25`.
   - `HP = baseHp + (level - 1) * 12 + vitality * 5 (+ 30 if bastion_pauldron)`.
   - `DamageMult = (1 + (level - 1) * 0.025) * (1 + primaryAttr * 0.008)` (`Strength` for Vanguard, `Dexterity` for Ranger, `Intelligence` for Arcanist, `Faith` for Cleric), plus `sunfire_signet` (`* 1.12`).
   - `Cleric Healing = baseHeal * (1 + (level - 1) * 0.015) * (1 + faith * 0.006)`.
   - `AttackCooldownMs = max(100, (baseCooldown * haste * frostbite) / ((1 + dex * 0.004) * swift))`.
   - `CDR = min(50%, min(20%, int * 0.2) + (hourglass_shard ? 25 : 0) + swift * 8)`.
   - `XP curve`: `round(80 + (lvl - 1) * 60 + pow(lvl - 1, 1.75) * 12)`, granting `+3 attributePoints` per level-up.
   - `Hard CC Diminishing Returns` and resistance caps (`75%` phys/elem cap, `40%` Faith CC tenacity cap).
4. **Network Transport, Delta Snapshots, & Input Reliability (`src/server/wsTransport.ts`, `src/shared/snapshotDelta.ts`, `src/client/networkStats.ts`, `src/client/prediction.ts`):**
   - 40 Hz (`25ms`) drift-free server loop, entity-diff delta snapshots (`computeSnapshotDelta` / `applySnapshotDelta`), O(roomSize) `RoomClientIndex`, WebSocket backpressure dropping (`64 KB` / `512 KB`), and `ReliableInputDispatcher` + `LocalPredictionController`.
5. **Spatial Voice Chat (`src/client/voice/voiceClient.ts` & `/api/voice/*`):**
   - LiveKit proximity voice attenuation (`600px` max hearing range, `360px` stereo pan) and abuse reporting pipeline.

---

## 5. Existing APIs and Data Structures

### 5.1 HTTP REST Endpoints (`server.ts`)
| Method & Path | Auth | Request / Response |
|---|---|---|
| `POST /api/auth/login` | None | `{ username, password }` -> `{ token, user: UserProfile }` (24h in-memory session token; maintenance mode 503 if account missing). |
| `POST /api/auth/register` | None | `{ username, password, preferredClass }` -> `201 { token, user: UserProfile }`. Password min 8 chars; username `^[a-zA-Z0-9_-]{2,20}$`. Note: `username.toLowerCase() === 'aleph'` auto-grants `isAdmin`. |
| `POST /api/auth/change-password` | `Bearer <token>` | `{ currentPassword, newPassword }` -> `{ message, token }`; invalidates other sessions for user. |
| `GET /api/auth/me` | `Bearer <token>` | `{ user: UserProfile }`. |
| `POST /api/auth/logout` | `Bearer <token>` | Deletes session token -> `{ ok: true }`. |
| `POST /api/voice/token` | `Bearer <token>` + Room Member | `{ roomId }` -> `{ token: livekitJwt, url: wssUrl }`. |
| `POST /api/voice/report` | `Bearer <token>` + Room Member | `{ roomId, reportedUserId, reason }` -> persists to `voice_reports` PG table or `data/voice_reports.json`. |
| `GET /api/admin/export-accounts` | `Bearer <MIGRATION_ADMIN_SECRET>` | Timing-safe check -> `{ exportTimestamp, count, accounts: AccountRecord[] }`. |
| `POST /api/admin/import-accounts` | `Bearer <MIGRATION_ADMIN_SECRET>` | `{ accounts: [...] }` -> upserts into storage. **Warning:** hardcodes fallback `dexterity: ... || 10`, `vitality: ... || 10`, and omits `level`, `xp`, `strength`, `intelligence`, `faith`, `storedRelics`. |

### 5.2 WebSocket Protocol (`/ws`)
- **Handshake:** Auth token passed via `Sec-WebSocket-Protocol` header (`new WebSocket(wsUrl, [token])`), checked against `sessionsByToken` and `isOriginAllowed()` CORS allowlist (`localhost`, `127.0.0.1`, `.onrender.com`, `.run.app`, `.vercel.app`, `.itch.io`, `.itch.zone`, or `ALLOWED_ORIGINS`). `maxPayload: 64 KB`, `perMessageDeflate: false`, TCP `setNoDelay(true)`.
- **Client -> Server (`ClientMessage`):**
  - Lobby/Room: `lobby:subscribe`, `room:create`, `room:join`, `room:leave`, `room:start`, `room:set_ready`, `room:return_to_lobby`, `room:restart`, `room:resync`.
  - Gameplay: `player:input` (`{ up, down, left, right, attack, aimAngle, stickX?, stickY? }`, `seq`), `player:action` (`'tactical' | 'ult' | 'potion' | 'interact' | 'dash'`), `player:ping`, `chat:send`.
  - Inventory/Progression: `player:select_relic`, `player:unequip_relic`, `player:store_relic`, `player:equip_stored_relic`, `player:delete_relic`, `player:discard_potion`, `player:spend_attribute`, `player:reset_attributes` (only in `TAVERN-HUB` within 180px of `npc_aleph`), `player:dialogue_close`, `player:dialogue_pick`, `player:change_class` (admin-only; non-admins are permanently locked to `lockedClass`).
  - Admin & Telemetry: `admin:*` (16 commands gated by `acc.isAdmin`), `ping`.
- **Server -> Client (`ServerMessage`):**
  - `lobby:rooms`, `room:joined`, `room:map`, `room:tick` (full keyframe `GameSnapshot`), `room:delta` (`SnapshotDelta`), `chat:message`, `room:left`, `error`, `pong`.

### 5.3 Database Schema (PostgreSQL in `server.ts`)
- **`accounts` table:**
  - `id VARCHAR(64) PRIMARY KEY` (`usr_<12 hex>`)
  - `username VARCHAR(32) NOT NULL`, `username_lower VARCHAR(32) UNIQUE NOT NULL`
  - `password_hash VARCHAR(255) NOT NULL` (`scrypt:<salt>:<hash>` or legacy SHA-256)
  - `locked_class VARCHAR(24) DEFAULT 'vanguard'`, `preferred_class VARCHAR(24) DEFAULT 'vanguard'`
  - `runs_completed INT`, `highest_floor INT`, `total_kills INT`, `total_revives INT`, `gold INT`, `is_admin BOOLEAN`
  - `level INT DEFAULT 1`, `xp INT DEFAULT 0`
  - `strength INT`, `vitality INT`, `dexterity INT`, `intelligence INT`, `faith INT`, `attribute_points INT`
  - `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
  - **Notable omission:** `stored_relics` is NOT a column in PostgreSQL `accounts` (only saved in `data/accounts.json`).
- **`schema_migrations` table:** `(version VARCHAR(64) PRIMARY KEY, applied_at TIMESTAMPTZ)` (records `'20261106_reset_attributes'`).
- **`voice_reports` table (lazy-created on report):** `(id SERIAL PRIMARY KEY, room_id, reporter_id, reported_id, reason, created_at)`.

---

## 6. Systems Requiring Adaptation for `Beyond: Overworld`

| System | `Beyond-Dungeons` Implementation | Required Adaptation for `Beyond: Overworld` |
|---|---|---|
| **World & Instance Scale** | `GameRoom` holds a 64x48 dungeon (`maxPlayers = 4`) or 48x34 Tavern (`maxPlayers = 50`). Snapshots send all players/enemies/props in the room every tick. | Overworld targets **100 players per instance** (`DD-007`) with Safe Zones, Open World, Arena, and Survival zones. Sending full-map 100-player snapshots at 40 Hz will require **spatial interest management / area-of-interest (AOI) filtering** and load testing, plus zone-aware boundary checks instead of single-dungeon rooms. |
| **Combat Targeting & Friendly Fire** | `GameRoom` only resolves Player -> Enemy/Dummy and Enemy -> Player damage; `damagePlayer()` has no attacker ID or PvP damage calculation. | Must adapt combat pipeline for **PvP & PvPvE damage validation** (`DD-010`, `DD-011`, `DD-013`), enforcing safe-zone immunity server-side, separating PvE vs. PvP damage/CC scaling (pending Game Director PvP normalization approval), and resolving player-on-player projectile/AoE hits. |
| **Equipment / Armament System** | Fixed class weapon + static `"<Class> Vestments"` + 14 Relics (`relics` max 5, `storage` max 12). No `Weapon` or `Vestment` item registry. | Must design a shared `Weapon` and `Vestment` item model (and clarify how Relics relate to Armaments) that can override Basic Attacks, passives, and Tactical Skills with **independent per-Tactical-Skill cooldown tracking** (`DD-014`..`DD-021`) while preserving existing `HERO_CLASSES` defaults as baseline armaments. |
| **Death & Revive** | `damagePlayer()` sets `downed = true`, `downedTimerMs = 18000`; party wipe (`all downed`) ends the expedition in `defeat`. Solo players cannot self-revive outside `TAVERN-HUB`. | Overworld uses **revive-based death** (`DD-009`) across solo/open-world/Arena/Survival encounters without ending a shared 100-player instance. Exact revive timers/locations/penalties await design approval. |
| **Character & Progression Sync** | `server.ts` directly reads/writes `accounts` in PostgreSQL and mutates `acc.level`, `acc.xp`, `acc.attributePoints`, and attributes via `onProgressionUpdateCallback`. | Per `DD-002` & `DD-027`, Overworld must **not** own a competing permanent character DB. Requires a `CharacterIntegrationLayer` / shared Beyond Universe Account & Progression API (starting with a development adapter matching `UserProfile` / `AccountRecord` shapes). |
| **Class Selection & Admin/Lobby Rules** | Accounts permanently lock to 1 `lockedClass` at registration (only admins can switch via `player:change_class`). | Overworld must respect the same permanent `lockedClass` / character identity from `Beyond: Dungeons` unless multi-character slots are introduced at the universe level. |

---

## 7. Systems That Must Remain Separate

Per `README.md`, `ARCHITECTURE.md`, `GAME_DESIGN.md`, `REFERENCE_PROJECT.md`, and `DESIGN_DECISIONS` (`DD-001`, `DD-004`, `DD-005`, `DD-025`, `DD-027`, `DD-028`):

1. **Runtime Processes & Servers:** `Beyond: Overworld` must have its own independent Express/WebSocket server, world instance manager, and game loop — never coupled to or requiring `Beyond: Dungeons` (`server.ts`) to be running.
2. **Dungeon Floor Progression & Encounters:** `src/server/dungeonGenerator.ts` (floors 1–10, biomes, boss wards, guardian rooms, dungeon floor mastery) and expedition room states (`waiting` / `playing` / `victory` / `defeat`) are exclusive to `Beyond: Dungeons`.
3. **Temporary Activity State:**
   - Dungeons keeps: run-local `gold`, `potions`, run `relics` (5 active slots), `floorBlessings`, `kills`, `damageDealt`, `revives`, and dungeon map discovery flags.
   - Overworld keeps (in its own Overworld PostgreSQL database): Arena Honor & ranks, Survival session state, Public Event state/records, Overworld instance state, and Overworld reward claim ledgers.
4. **Dungeons Source Repository:** Must remain untouched.

---

## 8. Potential Integration Conflicts

1. **Armament Model Mismatch (High Priority):**
   - *Conflict:* `Beyond-Overworld` specs mandate two shared equipment slots (`Weapon` and `Vestment`) that modify/replace Basic Attacks, Passives, and Tactical Skills (`DD-014`..`DD-021`). `Beyond-Dungeons` has **only** class-locked default Weapons/Vestments and a **14-Relic** system (`relics` + `storage`).
   - *Impact:* Shared character transfer cannot exchange Weapons/Vestments with `Beyond-Dungeons` until a unified Armament schema is defined across both projects (or Dungeons adds Armament slots / maps Relics).
2. **`storedRelics` Persistence Gap in PostgreSQL (High Priority):**
   - *Conflict:* `server.ts` writes `acc.storedRelics` to `data/accounts.json` but omits `stored_relics` from PostgreSQL `CREATE TABLE accounts`, `INSERT/UPDATE` in `persistAccount()`, and `SELECT * FROM accounts` in `initStorage()`.
   - *Impact:* On PostgreSQL-backed production (`Render`), stored relics are lost on server restart/deploy and cannot be queried from SQL by a shared character service.
3. **In-Memory Session Auth (`sessionsByToken`) (High Priority):**
   - *Conflict:* `Beyond-Dungeons` authenticates via opaque random hex tokens stored in an in-memory `Map` inside a single Node process. There is no JWT, OAuth, or shared SSO endpoint.
   - *Impact:* Players cannot seamlessly transfer or authenticate into `Beyond-Overworld` using their `Beyond-Dungeons` session without either a shared Auth/SSO service (e.g., signed JWTs or shared session/account API) or a login integration contract.
4. **Account Import Route Stat Defaults Bug (Medium Priority):**
   - *Conflict:* `/api/admin/import-accounts` in `server.ts` (lines 1165–1181) drops `level`, `xp`, `strength`, `intelligence`, `faith`, and `storedRelics`, and defaults `dexterity` and `vitality` to `10` instead of `0`.
   - *Impact:* Must NOT be reused as a character-transfer endpoint between Dungeons and Overworld.
5. **Dual Class-Lock & Balance Drift (Medium Priority):**
   - *Conflict:* `Beyond-Dungeons` binds each account to a single `lockedClass` (`vanguard | ranger | arcanist | cleric`) and hardcodes combat/stat formulas in both `src/shared/statUtils.ts` and `src/server/gameEngine.ts` (including Relic bonuses and `MAX_LEVEL = 50`).
   - *Impact:* If Overworld duplicates formulas independently, balance patches (like `v1.7.0`) will cause character power mismatches between games. Shared formulas or a shared stats package/spec should be kept aligned.
6. **Hardcoded Deployment Origins & Missing Status Icon Assets (Low Priority):**
   - *Conflict:* `src/client/apiConfig.ts` and `server.ts` reference `beyond-game-sg.onrender.com`; `src/shared/statusEffects.ts` points to `/assets/icons/status/*.png` which do not exist on disk; `@google/genai` is in `package.json` but unused.
   - *Impact:* Do not assume `status/*.png` files exist when reusing `statusEffects.ts` metadata in Overworld UI.

---

## 9. Missing Information & Unresolved Decisions

### Missing Information from `Beyond-Dungeons`
1. **Shared Character Service / API Contract:** No cross-game REST/gRPC/DB contract exists in `Beyond-Dungeons` for reading/updating permanent character identity (`AccountRecord`), permanent EXP awards from external experiences, or cross-game transfers.
2. **Weapon & Vestment Definitions:** Neither `Beyond-Dungeons` nor `Beyond-Overworld` currently defines concrete Weapon/Vestment item IDs, class-specific equipment lists, cooldown values for replacement Tactical Skills, or how Relics interact with Armaments.
3. **Production Database Credentials / Migration Ownership:** `Beyond-Dungeons` runs `CREATE TABLE` / `ALTER TABLE` inline inside `server.ts` rather than separate `.sql` migration files, and has no formal API boundary separating account auth from dungeon telemetry.
4. **Canonical Icon Set:** Status effect icon PNGs referenced by `src/shared/statusEffects.ts` (`/assets/icons/status/*.png`) and any item/weapon/vestment icons are not present in `Beyond-Dungeons`.
5. **100-Player Load Benchmarks:** `Beyond-Dungeons` is tested up to 4-player dungeon runs and a 50-player `TAVERN-HUB` cap, with no load-test measurements confirming 100 concurrent players in active combat.

### Unresolved Design Decisions (Confirmed Still Open in `DESIGN_DECISIONS` & `GAME_DESIGN.md`)
- Exact Overworld world map layout & zone boundaries (Safe Zones, Open World, Arena, Survival Grounds).
- Movement parameters (whether Overworld adopts `HERO_CLASSES[id].speed` + `computePlayerMoveSpeed` verbatim).
- PvP stat normalization, damage scaling, and whether/how `Beyond-Dungeons` Relics apply in Overworld PvP/Arena.
- Arena matchmaking, ranking, scoring, and Honor economy.
- PvPvE Survival rules, session duration, enemy scaling, and loot/reward calculations.
- Public event types, schedules, and reward tables.
- Revive timers, respawn locations, and penalties in Overworld (`GameRoom` uses 18s downed timer in co-op, which does not apply directly to solo/PvP Overworld).
- Exact permanent EXP award ratios (must remain substantially lower than `Beyond: Dungeons` per `DD-006`).
- Character transfer flow and shared authentication mechanism between both games.

---

## 10. Recommended Pre-Implementation Clarifications for the Game Director

Before implementing Overworld core systems, the following should be confirmed:
1. **Armament vs. Relic Relationship:** Should `Beyond-Overworld` define new `Weapon` and `Vestment` items starting from the 4 `HERO_CLASSES` defaults while keeping Dungeons' 14 Relics separate (Dungeons-only), or should a shared Armament catalog be designed across both games?
2. **Shared Identity & Auth Integration:** Should Overworld initially use a local Character Integration Adapter seeded from the `Beyond-Dungeons` `UserProfile`/`AccountRecord` schema (with `vanguard`, `ranger`, `arcanist`, `cleric`, `MAX_LEVEL = 50`, and the 5 attributes `STR/VIT/DEX/INT/FTH`), or will a shared auth/character service be stood up first?
3. **Visual Reuse Strategy:** Confirm reuse of `Beyond-Dungeons`' procedural Canvas 2D renderers (`heroSprites.ts`, `directionalFacing.ts`, `fallenPlayerSprite.ts`, `enemySprites.ts`, `canvasEffects.ts`, and `.stone-*` UI theme) as the baseline visual runtime for Overworld.
