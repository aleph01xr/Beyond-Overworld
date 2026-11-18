// server.ts
import "dotenv/config";
import fs2 from "node:fs";
import http from "node:http";
import path2 from "node:path";
import express2 from "express";

// server/src/auth/authService.ts
import { randomBytes as randomBytes2 } from "node:crypto";

// server/src/auth/identityConfig.ts
function normalizeHttpUrl(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return { valid: false, value: null };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        valid: false,
        value: null,
        reason: "DUNGEONS_API_URL must use http:// or https://."
      };
    }
    return { valid: true, value: parsed.toString().replace(/\/+$/, "") };
  } catch {
    return {
      valid: false,
      value: null,
      reason: "DUNGEONS_API_URL is not a valid URL."
    };
  }
}
function resolveIdentityConfig(env = process.env, options) {
  const isProduction = options?.isProduction ?? env.NODE_ENV === "production";
  const localFallbackActive = !isProduction;
  const devLoginEnabled = !isProduction;
  const localRegistrationEnabled = !isProduction;
  const rawUrl = env.DUNGEONS_API_URL?.trim() || "";
  const rawSecret = env.BEYOND_IDENTITY_SECRET?.trim() || "";
  if (!rawUrl && !rawSecret) {
    return {
      isProduction,
      mode: "unconfigured",
      dungeonsApiUrl: null,
      identitySecret: null,
      hasIdentitySecret: false,
      localFallbackActive,
      devLoginEnabled,
      localRegistrationEnabled,
      diagnosticMessage: isProduction ? "Production mode requires DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET; local fallback and Dev Login are disabled." : "External Beyond: Dungeons identity provider is not configured (DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET unset). Using local development identity provider."
    };
  }
  const urlCheck = normalizeHttpUrl(rawUrl);
  const issues = [];
  if (!rawUrl) {
    issues.push("DUNGEONS_API_URL is missing");
  } else if (!urlCheck.valid) {
    issues.push(urlCheck.reason ?? "DUNGEONS_API_URL is invalid");
  }
  if (!rawSecret) {
    issues.push("BEYOND_IDENTITY_SECRET is missing");
  } else if (rawSecret.length < 16) {
    issues.push("BEYOND_IDENTITY_SECRET should be at least 16 characters");
  }
  if (issues.length > 0) {
    return {
      isProduction,
      mode: "partial_or_invalid",
      dungeonsApiUrl: urlCheck.valid ? urlCheck.value : null,
      identitySecret: rawSecret || null,
      hasIdentitySecret: Boolean(rawSecret),
      localFallbackActive,
      devLoginEnabled,
      localRegistrationEnabled,
      diagnosticMessage: isProduction ? `Production Beyond: Dungeons identity configuration invalid (${issues.join("; ")}). Local authentication fallback is disabled.` : `External Beyond: Dungeons identity configuration incomplete (${issues.join("; ")}). Local development identity provider remains active.`
    };
  }
  return {
    isProduction,
    mode: "configured",
    dungeonsApiUrl: urlCheck.value,
    identitySecret: rawSecret,
    hasIdentitySecret: true,
    localFallbackActive,
    devLoginEnabled,
    localRegistrationEnabled,
    diagnosticMessage: isProduction ? "Production authentication is configured to use Beyond: Dungeons as the authoritative identity provider (Dev Login and local fallback disabled)." : "Beyond: Dungeons external identity adapter is configured alongside local development authentication."
  };
}
function toPublicIdentityConfigStatus(config) {
  return {
    isProduction: config.isProduction,
    mode: config.mode,
    dungeonsApiConfigured: Boolean(config.dungeonsApiUrl),
    identitySecretConfigured: config.hasIdentitySecret,
    localFallbackActive: config.localFallbackActive,
    devLoginEnabled: config.devLoginEnabled,
    localRegistrationEnabled: config.localRegistrationEnabled,
    diagnosticMessage: config.diagnosticMessage
  };
}

// server/src/auth/identityProvider.ts
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { z as z2 } from "zod";

// shared/validation/schemas.ts
import { z } from "zod";

// shared/constants/zones.ts
var OVERWORLD_INSTANCE_CAPACITY = 100;
var SERVER_TICK_MS = 25;
var PROTOCOL_VERSION = 1;
var OVERWORLD_ZONES = {
  safe: {
    id: "safe",
    label: "Safe Zone",
    pvpAllowed: false,
    armamentSwitchAllowed: true,
    accentColor: "#34D399",
    description: "Player attacks are disabled. Socialize, prepare, and switch Armaments outside active combat."
  },
  open_world: {
    id: "open_world",
    label: "Open World",
    pvpAllowed: true,
    armamentSwitchAllowed: false,
    accentColor: "#F59E0B",
    description: "Player combat is permitted outside safe zones (PvP formulas pending design approval)."
  },
  arena: {
    id: "arena",
    label: "Arena",
    pvpAllowed: true,
    armamentSwitchAllowed: false,
    accentColor: "#EF4444",
    description: "Competitive PvP zone awarding Arena Honor separately from EXP (rules pending approval)."
  },
  survival: {
    id: "survival",
    label: "Survival Grounds",
    pvpAllowed: true,
    armamentSwitchAllowed: false,
    accentColor: "#A855F7",
    description: "PvPvE activity grounds combining environmental threats and player combat (rules pending approval)."
  }
};

// shared/validation/schemas.ts
var HeroClassSchema = z.enum(["vanguard", "ranger", "arcanist", "cleric"]);
var AuthLoginSchema = z.object({
  username: z.string().trim().min(2).max(20),
  password: z.string().min(8).max(128)
});
var AuthRegisterSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_-]{2,20}$/, "Username must be 2\u201320 letters, numbers, underscores, or hyphens."),
  password: z.string().min(8).max(128),
  heroClass: HeroClassSchema.default("vanguard")
});
var ExternalAssertionSchema = z.object({
  assertion: z.string().trim().min(10, "Signed identity assertion is required.").max(8192)
});
var PlayerInputSchema = z.object({
  up: z.boolean(),
  down: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  attack: z.boolean(),
  aimAngle: z.number().finite(),
  stickX: z.number().finite().min(-1.1).max(1.1).optional(),
  stickY: z.number().finite().min(-1.1).max(1.1).optional()
});
var ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lobby:subscribe"),
    protocolVersion: z.number().int().min(1).max(PROTOCOL_VERSION).default(PROTOCOL_VERSION)
  }),
  z.object({
    type: z.literal("instance:create"),
    name: z.string().trim().min(2).max(40)
  }),
  z.object({
    type: z.literal("instance:join"),
    instanceId: z.string().trim().min(1).max(48)
  }),
  z.object({
    type: z.literal("instance:leave")
  }),
  z.object({
    type: z.literal("instance:resync")
  }),
  z.object({
    type: z.literal("player:input"),
    input: PlayerInputSchema,
    seq: z.number().int().nonnegative().optional()
  }),
  z.object({
    type: z.literal("player:attack_probe"),
    aimAngle: z.number().finite(),
    kind: z.enum(["basic", "tactical"])
  }),
  z.object({
    type: z.literal("player:equip_armament"),
    slot: z.enum(["weapon", "vestment"]),
    itemId: z.string().trim().min(1).max(64).nullable()
  }),
  z.object({
    type: z.literal("chat:send"),
    text: z.string().trim().min(1).max(240)
  }),
  z.object({
    type: z.literal("ping"),
    t: z.number().finite()
  })
]);

// server/src/auth/identityProvider.ts
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, "hex");
  const derivedBuf = scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return timingSafeEqual(keyBuf, derivedBuf);
}
function toSharedAccountIdentity(record) {
  return {
    accountId: record.accountId,
    username: record.username,
    isAdmin: record.isAdmin,
    preferredClass: record.preferredClass,
    lockedClass: record.lockedClass,
    level: record.level,
    xp: record.xp,
    strength: record.strength,
    vitality: record.vitality,
    dexterity: record.dexterity,
    intelligence: record.intelligence,
    faith: record.faith,
    attributePoints: record.attributePoints
  };
}
var LocalIdentityProvider = class {
  kind = "local_dev";
  isConfigured = true;
  isOperational;
  accountsByLower = /* @__PURE__ */ new Map();
  constructor(options) {
    this.isOperational = options?.enabled !== false;
    const shouldSeed = this.isOperational && (options?.seedDevAccount ?? process.env.NODE_ENV !== "production");
    if (shouldSeed) {
      this.seedAccountInternal({
        accountId: "acc_dev_wanderer",
        username: "wanderer",
        password: "wanderer123",
        preferredClass: "vanguard",
        isAdmin: false
      });
    }
  }
  /**
   * Internal server-only seed helper (never reachable from client payloads).
   * Used for the dev seed account and isolated server-side admin verification tests.
   */
  seedAccountInternal(params) {
    const username = params.username.trim();
    const usernameLower = username.toLowerCase();
    const heroClass = params.preferredClass ?? "vanguard";
    const record = {
      accountId: params.accountId,
      username,
      usernameLower,
      passwordHash: hashPassword(params.password),
      isAdmin: params.isAdmin === true,
      preferredClass: heroClass,
      lockedClass: heroClass,
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
      createdAt: Date.now()
    };
    this.accountsByLower.set(usernameLower, record);
    return toSharedAccountIdentity(record);
  }
  async registerAccount(params) {
    if (!this.isOperational) {
      return {
        ok: false,
        provider: this.kind,
        code: "LOCAL_REGISTRATION_DISABLED",
        error: "Local registration is disabled in production; use Beyond: Dungeons."
      };
    }
    const username = params.username.trim();
    const usernameLower = username.toLowerCase();
    if (this.accountsByLower.has(usernameLower)) {
      return {
        ok: false,
        provider: this.kind,
        code: "ACCOUNT_EXISTS",
        error: "That account name is already claimed."
      };
    }
    const record = {
      accountId: `acc_${randomUUID()}`,
      username,
      usernameLower,
      passwordHash: hashPassword(params.password),
      isAdmin: false,
      preferredClass: params.preferredClass,
      lockedClass: params.preferredClass,
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
      createdAt: Date.now()
    };
    this.accountsByLower.set(usernameLower, record);
    return {
      ok: true,
      provider: this.kind,
      identity: toSharedAccountIdentity(record)
    };
  }
  async authenticateWithCredentials(usernameRaw, password) {
    if (!this.isOperational) {
      return {
        ok: false,
        provider: this.kind,
        code: "LOCAL_AUTH_DISABLED",
        error: "Local authentication fallback is disabled in production."
      };
    }
    const usernameLower = usernameRaw.trim().toLowerCase();
    const account = this.accountsByLower.get(usernameLower);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return {
        ok: false,
        provider: this.kind,
        code: "INVALID_CREDENTIALS",
        error: "Invalid username or password."
      };
    }
    return {
      ok: true,
      provider: this.kind,
      identity: toSharedAccountIdentity(account)
    };
  }
  async verifySignedAssertion() {
    return {
      ok: false,
      provider: this.kind,
      code: "ASSERTION_NOT_SUPPORTED_LOCAL",
      error: "Local development provider does not validate external signed assertions."
    };
  }
};
var SharedAccountIdentitySchema = z2.object({
  accountId: z2.string().trim().min(1).max(128),
  username: z2.string().trim().min(2).max(32),
  isAdmin: z2.boolean(),
  preferredClass: HeroClassSchema,
  lockedClass: HeroClassSchema,
  level: z2.number().int().min(1).max(50),
  xp: z2.number().int().min(0),
  strength: z2.number().int().min(0).max(100),
  vitality: z2.number().int().min(0).max(100),
  dexterity: z2.number().int().min(0).max(100),
  intelligence: z2.number().int().min(0).max(100),
  faith: z2.number().int().min(0).max(100),
  attributePoints: z2.number().int().min(0)
});
var SignedDungeonsAssertionPayloadSchema = SharedAccountIdentitySchema.extend({
  iss: z2.literal("beyond-dungeons"),
  aud: z2.literal("beyond-overworld"),
  exp: z2.number().int().positive(),
  iat: z2.number().int().nonnegative().optional(),
  jti: z2.string().trim().min(4).max(128).optional()
});
var MAX_REPLAY_ENTRIES = 5e4;
var MAX_CLOCK_SKEW_MS = 6e4;
var DungeonsIdentityProvider = class {
  constructor(config, options) {
    this.config = config;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options?.timeoutMs ?? 5e3;
  }
  config;
  kind = "dungeons";
  fetchImpl;
  timeoutMs;
  consumedAssertions = /* @__PURE__ */ new Map();
  get isConfigured() {
    return this.config.mode === "configured";
  }
  get isOperational() {
    return this.isConfigured;
  }
  getDungeonsApiUrl() {
    return this.config.dungeonsApiUrl;
  }
  async authenticateWithCredentials(username, password) {
    if (!this.isConfigured || !this.config.dungeonsApiUrl || !this.config.identitySecret) {
      return {
        ok: false,
        provider: this.kind,
        code: "EXTERNAL_PROVIDER_NOT_CONFIGURED",
        error: "Beyond: Dungeons external identity provider is not configured (set DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET)."
      };
    }
    const endpoint = `${this.config.dungeonsApiUrl}/api/identity/verify`;
    const body = JSON.stringify({ username: username.trim(), password });
    const timestamp = String(Math.floor(Date.now() / 1e3));
    const requestSig = createHmac("sha256", this.config.identitySecret).update(`${timestamp}.${body}`).digest("hex");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.config.identitySecret}`,
          "X-Beyond-Service": "beyond-overworld",
          "X-Beyond-Timestamp": timestamp,
          "X-Beyond-Signature": requestSig
        },
        body,
        signal: controller.signal
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          provider: this.kind,
          code: "INVALID_CREDENTIALS",
          error: typeof payload?.error === "string" ? payload.error : "Invalid Beyond: Dungeons username or password."
        };
      }
      if (!response.ok || !payload) {
        return {
          ok: false,
          provider: this.kind,
          code: "DUNGEONS_AUTH_ERROR",
          error: typeof payload?.error === "string" ? payload.error : `Beyond: Dungeons identity verification failed (${response.status}).`
        };
      }
      if (typeof payload.assertion === "string") {
        return this.verifySignedAssertion(payload.assertion);
      }
      const rawIdentity = payload.identity ?? payload.account ?? payload.user;
      const parsedIdentity = SharedAccountIdentitySchema.safeParse(rawIdentity);
      if (!parsedIdentity.success) {
        return {
          ok: false,
          provider: this.kind,
          code: "INVALID_DUNGEONS_RESPONSE",
          error: "Beyond: Dungeons returned an invalid identity response."
        };
      }
      return {
        ok: true,
        provider: this.kind,
        identity: parsedIdentity.data
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        provider: this.kind,
        code: isTimeout ? "DUNGEONS_TIMEOUT" : "DUNGEONS_UNREACHABLE",
        error: isTimeout ? "Beyond: Dungeons identity service timed out." : "Beyond: Dungeons identity service is currently unreachable."
      };
    } finally {
      clearTimeout(timer);
    }
  }
  async registerAccount() {
    if (!this.isConfigured) {
      return {
        ok: false,
        provider: this.kind,
        code: "EXTERNAL_PROVIDER_NOT_CONFIGURED",
        error: "Beyond: Dungeons external identity provider is not configured."
      };
    }
    return {
      ok: false,
      provider: this.kind,
      code: "EXTERNAL_ACCOUNT_OWNED_BY_DUNGEONS",
      error: "Permanent Beyond accounts must be created in Beyond: Dungeons."
    };
  }
  async verifySignedAssertion(assertionToken) {
    const secret = this.config.identitySecret;
    if (!secret || this.config.mode !== "configured") {
      return {
        ok: false,
        provider: this.kind,
        code: "EXTERNAL_PROVIDER_NOT_CONFIGURED",
        error: "Cannot verify Beyond: Dungeons identity assertion: DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET must be configured."
      };
    }
    const normalizedToken = assertionToken.trim();
    const parts = normalizedToken.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        ok: false,
        provider: this.kind,
        code: "INVALID_ASSERTION_SIGNATURE",
        error: "Unsigned or malformed Beyond identity assertion."
      };
    }
    const [encodedPayload, providedSig] = parts;
    const expectedSig = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    const providedBuf = Buffer.from(providedSig, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      return {
        ok: false,
        provider: this.kind,
        code: "INVALID_ASSERTION_SIGNATURE",
        error: "Invalid Beyond identity assertion signature."
      };
    }
    let rawJson;
    try {
      rawJson = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    } catch {
      return {
        ok: false,
        provider: this.kind,
        code: "INVALID_ASSERTION_PAYLOAD",
        error: "Malformed Beyond identity assertion payload."
      };
    }
    const parsed = SignedDungeonsAssertionPayloadSchema.safeParse(rawJson);
    if (!parsed.success) {
      return {
        ok: false,
        provider: this.kind,
        code: "INVALID_ASSERTION_PAYLOAD",
        error: "Identity assertion does not match SharedAccountIdentity schema."
      };
    }
    const nowMs = Date.now();
    const expMs = parsed.data.exp < 1e12 ? parsed.data.exp * 1e3 : parsed.data.exp;
    if (nowMs >= expMs) {
      return {
        ok: false,
        provider: this.kind,
        code: "ASSERTION_EXPIRED",
        error: "Beyond identity assertion has expired."
      };
    }
    if (typeof parsed.data.iat === "number") {
      const iatMs = parsed.data.iat < 1e12 ? parsed.data.iat * 1e3 : parsed.data.iat;
      if (iatMs - nowMs > MAX_CLOCK_SKEW_MS) {
        return {
          ok: false,
          provider: this.kind,
          code: "INVALID_ASSERTION_PAYLOAD",
          error: "Beyond identity assertion issued-at timestamp is invalid."
        };
      }
    }
    this.pruneExpiredReplays(nowMs);
    const replayKey = parsed.data.jti ? `jti:${parsed.data.jti}` : `tok:${createHash("sha256").update(normalizedToken).digest("hex")}`;
    const priorExpiry = this.consumedAssertions.get(replayKey);
    if (priorExpiry && priorExpiry > nowMs) {
      return {
        ok: false,
        provider: this.kind,
        code: "ASSERTION_REPLAYED",
        error: "Beyond identity assertion has already been redeemed."
      };
    }
    this.consumedAssertions.set(replayKey, expMs);
    return {
      ok: true,
      provider: this.kind,
      identity: {
        accountId: parsed.data.accountId,
        username: parsed.data.username,
        isAdmin: parsed.data.isAdmin,
        preferredClass: parsed.data.preferredClass,
        lockedClass: parsed.data.lockedClass,
        level: parsed.data.level,
        xp: parsed.data.xp,
        strength: parsed.data.strength,
        vitality: parsed.data.vitality,
        dexterity: parsed.data.dexterity,
        intelligence: parsed.data.intelligence,
        faith: parsed.data.faith,
        attributePoints: parsed.data.attributePoints
      }
    };
  }
  pruneExpiredReplays(nowMs) {
    for (const [key, expMs] of this.consumedAssertions) {
      if (expMs <= nowMs) {
        this.consumedAssertions.delete(key);
      }
    }
    if (this.consumedAssertions.size >= MAX_REPLAY_ENTRIES) {
      const oldestKey = this.consumedAssertions.keys().next().value;
      if (oldestKey) this.consumedAssertions.delete(oldestKey);
    }
  }
};

// server/src/auth/authService.ts
var SESSION_TTL_MS = 24 * 60 * 60 * 1e3;
var AuthService = class {
  constructor(characterAdapter, options) {
    this.characterAdapter = characterAdapter;
    this.identityConfig = resolveIdentityConfig(options?.env ?? process.env, {
      isProduction: options?.isProduction
    });
    this.localProvider = new LocalIdentityProvider({
      enabled: !this.identityConfig.isProduction,
      seedDevAccount: !this.identityConfig.isProduction && (options?.seedDevAccount ?? true)
    });
    this.externalProvider = new DungeonsIdentityProvider(this.identityConfig, {
      fetchImpl: options?.fetchImpl,
      timeoutMs: options?.timeoutMs
    });
    console.log(`[Auth] ${this.identityConfig.diagnosticMessage}`);
    if (!this.identityConfig.isProduction && (options?.seedDevAccount ?? true)) {
      void this.ensureDevSeedCharacter();
    }
  }
  characterAdapter;
  sessionsByToken = /* @__PURE__ */ new Map();
  identityConfig;
  localProvider;
  externalProvider;
  async ensureDevSeedCharacter() {
    const devLogin = await this.localProvider.authenticateWithCredentials(
      "wanderer",
      "wanderer123"
    );
    if (devLogin.ok && devLogin.identity) {
      await this.characterAdapter.syncAuthoritativeIdentity(
        devLogin.identity,
        "local_dev"
      );
    }
  }
  /**
   * Returns sanitized configuration state (never includes BEYOND_IDENTITY_SECRET or internal URLs).
   */
  getIdentityProviderStatus() {
    return {
      environment: this.identityConfig.isProduction ? "production" : "development",
      authoritativeProvider: this.identityConfig.isProduction ? "dungeons" : this.externalProvider.isConfigured ? "dungeons" : "local_dev",
      activeLocalProvider: this.localProvider.kind,
      externalProviderConfigured: this.externalProvider.isConfigured,
      externalProviderOperational: this.externalProvider.isOperational,
      devLoginEnabled: this.identityConfig.devLoginEnabled,
      localRegistrationEnabled: this.identityConfig.localRegistrationEnabled,
      externalConfig: toPublicIdentityConfigStatus(this.identityConfig)
    };
  }
  /**
   * Safe public capability flags exposed to the browser AuthScreen via GET /api/auth/config.
   */
  getPublicClientAuthConfig() {
    return {
      environment: this.identityConfig.isProduction ? "production" : "development",
      authoritativeProvider: this.identityConfig.isProduction ? "dungeons" : this.externalProvider.isConfigured ? "dungeons" : "local_dev",
      devLoginEnabled: this.identityConfig.devLoginEnabled,
      localRegistrationEnabled: this.identityConfig.localRegistrationEnabled,
      externalAssertionEnabled: this.externalProvider.isConfigured
    };
  }
  getExternalProvider() {
    return this.externalProvider;
  }
  /**
   * Server-side seed helper for dev/test verification of server-authoritative admin privileges.
   */
  async seedLocalAccountForTest(params) {
    if (this.identityConfig.isProduction) {
      throw new Error("Cannot seed local accounts in production mode.");
    }
    const identity = this.localProvider.seedAccountInternal(params);
    return this.characterAdapter.syncAuthoritativeIdentity(identity, "local_dev");
  }
  async register(usernameRaw, password, heroClass) {
    if (this.identityConfig.isProduction) {
      const denied = await this.externalProvider.registerAccount();
      return {
        ok: false,
        provider: "dungeons",
        code: "LOCAL_REGISTRATION_DISABLED",
        error: denied.error ?? "Account registration is managed exclusively by Beyond: Dungeons in production."
      };
    }
    const verification = await this.localProvider.registerAccount({
      username: usernameRaw,
      password,
      preferredClass: heroClass
    });
    if (!verification.ok || !verification.identity) {
      return {
        ok: false,
        provider: verification.provider,
        code: verification.code,
        error: verification.error ?? "Registration failed."
      };
    }
    return this.createAuthorizedSessionResult(
      verification.identity,
      verification.provider
    );
  }
  async login(usernameRaw, password) {
    if (this.identityConfig.isProduction) {
      const externalResult = await this.externalProvider.authenticateWithCredentials(
        usernameRaw,
        password
      );
      if (!externalResult.ok || !externalResult.identity) {
        return {
          ok: false,
          provider: "dungeons",
          code: externalResult.code ?? "EXTERNAL_AUTH_FAILED",
          error: externalResult.error ?? "Invalid Beyond: Dungeons credentials."
        };
      }
      return this.createAuthorizedSessionResult(
        externalResult.identity,
        "dungeons"
      );
    }
    if (this.externalProvider.isConfigured) {
      const externalResult = await this.externalProvider.authenticateWithCredentials(
        usernameRaw,
        password
      );
      if (externalResult.ok && externalResult.identity) {
        return this.createAuthorizedSessionResult(
          externalResult.identity,
          "dungeons"
        );
      }
      const localFallback = await this.localProvider.authenticateWithCredentials(
        usernameRaw,
        password
      );
      if (localFallback.ok && localFallback.identity) {
        return this.createAuthorizedSessionResult(
          localFallback.identity,
          "local_dev"
        );
      }
      return {
        ok: false,
        provider: "dungeons",
        code: externalResult.code ?? "INVALID_CREDENTIALS",
        error: externalResult.error ?? "Invalid username or password."
      };
    }
    const verification = await this.localProvider.authenticateWithCredentials(
      usernameRaw,
      password
    );
    if (!verification.ok || !verification.identity) {
      return {
        ok: false,
        provider: verification.provider,
        code: verification.code,
        error: verification.error ?? "Invalid username or password."
      };
    }
    return this.createAuthorizedSessionResult(
      verification.identity,
      verification.provider
    );
  }
  /**
   * Verifies a signed identity assertion issued by Beyond: Dungeons,
   * validates signature + expiry + replay protection, syncs authoritative character
   * state while preserving Overworld Honor, and issues a server-verified Overworld session.
   */
  async authenticateExternalAssertion(assertionToken) {
    const verification = await this.externalProvider.verifySignedAssertion(
      assertionToken
    );
    if (!verification.ok || !verification.identity) {
      return {
        ok: false,
        provider: verification.provider,
        code: verification.code,
        error: verification.error ?? "External identity verification failed."
      };
    }
    return this.createAuthorizedSessionResult(
      verification.identity,
      verification.provider
    );
  }
  async getSessionCharacter(token) {
    const session = this.validateSessionToken(token);
    if (!session) return null;
    const character = await this.characterAdapter.getCharacterByAccountId(
      session.accountId
    );
    if (!character) return null;
    character.isAdmin = session.isAdmin;
    return { session, character };
  }
  validateSessionToken(token) {
    if (!token) return null;
    const session = this.sessionsByToken.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessionsByToken.delete(token);
      return null;
    }
    return session;
  }
  logout(token) {
    this.sessionsByToken.delete(token);
  }
  async createAuthorizedSessionResult(identity, provider) {
    const character = await this.characterAdapter.syncAuthoritativeIdentity(
      identity,
      provider
    );
    const authoritativeIsAdmin = identity.isAdmin === true;
    character.isAdmin = authoritativeIsAdmin;
    const token = this.issueSession({
      accountId: identity.accountId,
      username: identity.username,
      isAdmin: authoritativeIsAdmin,
      provider
    });
    return {
      ok: true,
      token,
      character,
      isAdmin: authoritativeIsAdmin,
      provider
    };
  }
  issueSession(params) {
    const token = randomBytes2(32).toString("hex");
    this.sessionsByToken.set(token, {
      token,
      accountId: params.accountId,
      username: params.username,
      isAdmin: params.isAdmin,
      provider: params.provider,
      expiresAt: Date.now() + SESSION_TTL_MS
    });
    return token;
  }
};

// server/src/characters/characterIntegrationAdapter.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// shared/constants/classes.ts
var TILE_SIZE = 32;
var PLAYER_COLLISION_RADIUS = 9;
var HERO_CLASSES = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    title: "Ironcrest Bastion",
    role: "Frontline Guardian & Juggernaut",
    roleBadge: "TANK",
    weapon: "Sunforged Claymore & Tower Greatshield",
    weaponType: "Heavy Cleave & Shield Wall",
    passiveName: "Iron Will",
    passiveDesc: "Absorbs 15% of all incoming damage. Striking stunned or burning foes restores +3 Shield.",
    maxHp: 155,
    speed: 175,
    damage: 28,
    attackCooldownMs: 400,
    range: 74,
    primaryColor: "#64748B",
    secondaryColor: "#CBD5E1",
    capeColor: "#991B1B",
    accentColor: "#F59E0B",
    glowColor: "#FBBF24",
    lore: "Sworn knights of the Sunken Bastion who bound their lifeblood into eternal steel. With unbroken wills and towering shields, they stand between ancient horrors and their comrades.",
    stats: { survivability: 5, damage: 3, range: 1, mobility: 2, utility: 4 },
    resistances: { physical: 0.28, fire: 0.15, frost: 0.15, lightning: 0.1, poison: 0.15, bleed: 0.3 },
    tacticalName: "Bulwark Dash",
    tacticalDesc: "Slam forward with tower shield, battering through monsters, stunning them for 1.7s and granting +28 Shield to nearby allies.",
    tacticalCooldownMs: 4800,
    ultName: "Aegis Sanctuary",
    ultDesc: "Plant your colossal shield into the earth, raising a gleaming dome that deflects projectile barrages and boosts party defense.",
    ultCooldownMs: 13e3
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    title: "Thornwood Marksman",
    role: "Long-Range Sniper & Scout",
    roleBadge: "MARKSMAN",
    weapon: "Ashwood Recurve & Barbed Quiver",
    weaponType: "Piercing Ranged Bow",
    passiveName: "Eagle Keenness",
    passiveDesc: "Attacks deal +25% Critical damage to targets beyond 180 units. Slaying a foe grants a 2s burst of swiftness.",
    maxHp: 110,
    speed: 210,
    damage: 24,
    attackCooldownMs: 320,
    range: 195,
    primaryColor: "#2D5A3C",
    secondaryColor: "#4ADE80",
    capeColor: "#1A3826",
    accentColor: "#FBBF24",
    glowColor: "#34D399",
    lore: "Sole survivors of the blighted Thornwood groves, master trackers capable of loose-drawing three enchanted shafts in the blink of an eye. Their arrows never falter.",
    stats: { survivability: 2, damage: 5, range: 5, mobility: 5, utility: 2 },
    resistances: { physical: 0.1, fire: 0.1, frost: 0.25, lightning: 0.15, poison: 0.45, bleed: 0.2 },
    tacticalName: "Frost Volley",
    tacticalDesc: "Loose a 5-arrow crystalline fan that pierces foes, slowing enemy advance by 50% and chilling their attacks.",
    tacticalCooldownMs: 4200,
    ultName: "Hunter Quarry",
    ultDesc: "Mark elites and bosses with radiant moonlight hunters-brand, exposing their weak points so all co-op allies deal +35% bonus strike damage.",
    ultCooldownMs: 11500
  },
  arcanist: {
    id: "arcanist",
    name: "Arcanist",
    title: "Astral Conduit",
    role: "AoE Spellweaver & Cosmic Blaster",
    roleBadge: "CASTER",
    weapon: "Runebound Spire & Orbiting Astral Orbs",
    weaponType: "Cosmic Shards & Starlight",
    passiveName: "Astral Resonance",
    passiveDesc: "Basic attacks loose homing cosmic shards that pierce an additional enemy. Spells leave lingering star rifts.",
    maxHp: 100,
    speed: 188,
    damage: 32,
    attackCooldownMs: 420,
    range: 185,
    primaryColor: "#4338CA",
    secondaryColor: "#818CF8",
    capeColor: "#312E81",
    accentColor: "#38BDF8",
    glowColor: "#60A5FA",
    lore: "Scholars of the shattered celestial spires who channel raw starlight through crystalline conduits. They weave time and void to obliterate dungeon hordes from afar.",
    stats: { survivability: 2, damage: 5, range: 4, mobility: 3, utility: 4 },
    resistances: { physical: 0.05, fire: 0.25, frost: 0.35, lightning: 0.45, poison: 0.15, bleed: 0.1 },
    tacticalName: "Astral Nova",
    tacticalDesc: "Unleash 8 piercing arcane shards in a starburst, knocking back surrounding monsters with void energy.",
    tacticalCooldownMs: 5e3,
    ultName: "Chrono Well",
    ultDesc: "Anchor a cosmic gravitational well that snares enemies, pulling them in while accelerating allied cooldowns by 50%.",
    ultCooldownMs: 13500
  },
  cleric: {
    id: "cleric",
    name: "Cleric",
    title: "Sunbrand Prelate",
    role: "Radiant Healer & Divine Enchanter",
    roleBadge: "SUPPORT",
    weapon: "Dawnstar Flanged Mace & Reliquary",
    weaponType: "Radiant Smite & Holy Relic",
    passiveName: "Radiant Aura",
    passiveDesc: "Emits a sacred 140-range warmth that heals wounded party members every 2 seconds (scales with Level & Faith, base 2 HP, +50% when critical), and increases revive speed by 40%.",
    maxHp: 128,
    speed: 185,
    damage: 22,
    attackCooldownMs: 380,
    range: 160,
    primaryColor: "#E2E8F0",
    secondaryColor: "#FDE047",
    capeColor: "#854D0E",
    accentColor: "#FACC15",
    glowColor: "#FEF08A",
    lore: "Devotees of the Eternal Dawn whose sacred chants can mend the gravest wounds and turn undead to ash. A cornerstone of every surviving expedition into the depths.",
    stats: { survivability: 4, damage: 3, range: 3, mobility: 2, utility: 5 },
    resistances: { physical: 0.15, fire: 0.4, frost: 0.2, lightning: 0.15, poison: 0.35, bleed: 0.25 },
    tacticalName: "Sanctified Pulse",
    tacticalDesc: "Release a blinding wave of golden light, healing you and all nearby party members (scales with Level & Faith, base 24 HP) while searing adjacent undead.",
    tacticalCooldownMs: 6800,
    ultName: "Solar Beacon",
    ultDesc: "Consecrate holy ground with an avatar of the Sun that continuously heals all allies (scales with Level & Faith, base 4 HP) and rapidly revives downed teammates who enter.",
    ultCooldownMs: 18e3
  }
};
var HERO_CLASS_LIST = [
  HERO_CLASSES.vanguard,
  HERO_CLASSES.ranger,
  HERO_CLASSES.arcanist,
  HERO_CLASSES.cleric
];
var BASE_ARMAMENTS = {
  wpn_vanguard_default: {
    id: "wpn_vanguard_default",
    slot: "weapon",
    name: HERO_CLASSES.vanguard.weapon,
    compatibleClasses: ["vanguard"],
    source: "dungeons_default",
    tacticalSkillId: "tac_vanguard_bulwark_dash",
    tacticalCooldownMs: HERO_CLASSES.vanguard.tacticalCooldownMs,
    summary: HERO_CLASSES.vanguard.weaponType
  },
  vest_vanguard_default: {
    id: "vest_vanguard_default",
    slot: "vestment",
    name: "Vanguard Vestments",
    compatibleClasses: ["vanguard"],
    source: "dungeons_default",
    summary: HERO_CLASSES.vanguard.passiveDesc
  },
  wpn_ranger_default: {
    id: "wpn_ranger_default",
    slot: "weapon",
    name: HERO_CLASSES.ranger.weapon,
    compatibleClasses: ["ranger"],
    source: "dungeons_default",
    tacticalSkillId: "tac_ranger_frost_volley",
    tacticalCooldownMs: HERO_CLASSES.ranger.tacticalCooldownMs,
    summary: HERO_CLASSES.ranger.weaponType
  },
  vest_ranger_default: {
    id: "vest_ranger_default",
    slot: "vestment",
    name: "Ranger Vestments",
    compatibleClasses: ["ranger"],
    source: "dungeons_default",
    summary: HERO_CLASSES.ranger.passiveDesc
  },
  wpn_arcanist_default: {
    id: "wpn_arcanist_default",
    slot: "weapon",
    name: HERO_CLASSES.arcanist.weapon,
    compatibleClasses: ["arcanist"],
    source: "dungeons_default",
    tacticalSkillId: "tac_arcanist_astral_nova",
    tacticalCooldownMs: HERO_CLASSES.arcanist.tacticalCooldownMs,
    summary: HERO_CLASSES.arcanist.weaponType
  },
  vest_arcanist_default: {
    id: "vest_arcanist_default",
    slot: "vestment",
    name: "Arcanist Vestments",
    compatibleClasses: ["arcanist"],
    source: "dungeons_default",
    summary: HERO_CLASSES.arcanist.passiveDesc
  },
  wpn_cleric_default: {
    id: "wpn_cleric_default",
    slot: "weapon",
    name: HERO_CLASSES.cleric.weapon,
    compatibleClasses: ["cleric"],
    source: "dungeons_default",
    tacticalSkillId: "tac_cleric_sanctified_pulse",
    tacticalCooldownMs: HERO_CLASSES.cleric.tacticalCooldownMs,
    summary: HERO_CLASSES.cleric.weaponType
  },
  vest_cleric_default: {
    id: "vest_cleric_default",
    slot: "vestment",
    name: "Cleric Vestments",
    compatibleClasses: ["cleric"],
    source: "dungeons_default",
    summary: HERO_CLASSES.cleric.passiveDesc
  }
};
function getDefaultWeaponId(heroClass) {
  return `wpn_${heroClass}_default`;
}
function getDefaultVestmentId(heroClass) {
  return `vest_${heroClass}_default`;
}

// server/src/persistence/database.ts
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
var pool = null;
var mode = "memory";
var initialized = false;
var memoryInstances = /* @__PURE__ */ new Map();
var memoryHonorLedger = [];
var memoryHonorKeys = /* @__PURE__ */ new Set();
var memoryRewardClaims = /* @__PURE__ */ new Map();
var memoryCharacterLinks = /* @__PURE__ */ new Map();
async function initDatabase() {
  if (initialized) return mode;
  initialized = true;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.warn(
      "[DB] DATABASE_URL is not configured. Using in-memory Overworld persistence fallback (no permanent progression stored here per DD-027)."
    );
    mode = "memory";
    return mode;
  }
  try {
    const candidatePool = new Pool({ connectionString: databaseUrl });
    await candidatePool.query("SELECT 1");
    const migrationsDir = path.resolve(process.cwd(), "database", "migrations");
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        await candidatePool.query(sql);
      }
      console.log(
        `[DB] Connected to PostgreSQL and verified ${files.length} Overworld migration(s): ${files.join(", ")}.`
      );
    }
    pool = candidatePool;
    mode = "postgres";
    return mode;
  } catch (err) {
    console.warn(
      "[DB] Failed to initialize PostgreSQL; falling back to in-memory Overworld store:",
      err instanceof Error ? err.message : String(err)
    );
    if (pool) {
      await pool.end().catch(() => {
      });
      pool = null;
    }
    mode = "memory";
    return mode;
  }
}
function getDatabaseStatus() {
  return { mode, connected: mode === "postgres" && pool !== null };
}
async function getOverworldCharacterLink(accountId) {
  if (pool) {
    const res = await pool.query(
      `SELECT account_id, character_id, identity_provider, arena_honor,
              equipped_weapon_id, equipped_vestment_id, last_known_username
       FROM overworld_character_links
       WHERE account_id = $1`,
      [accountId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      accountId: row.account_id,
      characterId: row.character_id,
      identityProvider: row.identity_provider === "local_dev" ? "local_dev" : "dungeons",
      arenaHonor: row.arena_honor,
      equippedWeaponId: row.equipped_weapon_id,
      equippedVestmentId: row.equipped_vestment_id,
      lastKnownUsername: row.last_known_username
    };
  }
  const existing = memoryCharacterLinks.get(accountId);
  return existing ? { ...existing } : null;
}
async function upsertOverworldCharacterLink(record) {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO overworld_character_links (
         account_id,
         character_id,
         identity_provider,
         arena_honor,
         equipped_weapon_id,
         equipped_vestment_id,
         last_known_username,
         last_synced_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         identity_provider = EXCLUDED.identity_provider,
         last_known_username = EXCLUDED.last_known_username,
         arena_honor = GREATEST(overworld_character_links.arena_honor, EXCLUDED.arena_honor),
         equipped_weapon_id = COALESCE(overworld_character_links.equipped_weapon_id, EXCLUDED.equipped_weapon_id),
         equipped_vestment_id = COALESCE(overworld_character_links.equipped_vestment_id, EXCLUDED.equipped_vestment_id),
         last_synced_at = NOW(),
         updated_at = NOW()
       RETURNING account_id, character_id, identity_provider, arena_honor,
                 equipped_weapon_id, equipped_vestment_id, last_known_username`,
      [
        record.accountId,
        record.characterId,
        record.identityProvider,
        Math.max(0, Math.trunc(record.arenaHonor)),
        record.equippedWeaponId,
        record.equippedVestmentId,
        record.lastKnownUsername
      ]
    );
    const row = res.rows[0];
    return {
      accountId: row.account_id,
      characterId: row.character_id,
      identityProvider: row.identity_provider === "local_dev" ? "local_dev" : "dungeons",
      arenaHonor: row.arena_honor,
      equippedWeaponId: row.equipped_weapon_id,
      equippedVestmentId: row.equipped_vestment_id,
      lastKnownUsername: row.last_known_username
    };
  }
  const existing = memoryCharacterLinks.get(record.accountId);
  if (existing) {
    const merged = {
      accountId: existing.accountId,
      characterId: existing.characterId,
      identityProvider: record.identityProvider,
      arenaHonor: Math.max(existing.arenaHonor, Math.max(0, Math.trunc(record.arenaHonor))),
      equippedWeaponId: existing.equippedWeaponId ?? record.equippedWeaponId,
      equippedVestmentId: existing.equippedVestmentId ?? record.equippedVestmentId,
      lastKnownUsername: record.lastKnownUsername ?? existing.lastKnownUsername
    };
    memoryCharacterLinks.set(record.accountId, merged);
    return { ...merged };
  }
  const created = {
    accountId: record.accountId,
    characterId: record.characterId,
    identityProvider: record.identityProvider,
    arenaHonor: Math.max(0, Math.trunc(record.arenaHonor)),
    equippedWeaponId: record.equippedWeaponId,
    equippedVestmentId: record.equippedVestmentId,
    lastKnownUsername: record.lastKnownUsername
  };
  memoryCharacterLinks.set(record.accountId, created);
  return { ...created };
}
async function updateOverworldCharacterHonor(accountId, newHonorBalance) {
  const safeBalance = Math.max(0, Math.trunc(newHonorBalance));
  if (pool) {
    await pool.query(
      `UPDATE overworld_character_links
       SET arena_honor = $2, updated_at = NOW()
       WHERE account_id = $1`,
      [accountId, safeBalance]
    );
    return;
  }
  const existing = memoryCharacterLinks.get(accountId);
  if (existing) {
    existing.arenaHonor = safeBalance;
  }
}
async function updateOverworldCharacterArmament(accountId, slot, itemId) {
  if (pool) {
    const column = slot === "weapon" ? "equipped_weapon_id" : "equipped_vestment_id";
    await pool.query(
      `UPDATE overworld_character_links
       SET ${column} = $2, updated_at = NOW()
       WHERE account_id = $1`,
      [accountId, itemId]
    );
    return;
  }
  const existing = memoryCharacterLinks.get(accountId);
  if (existing) {
    if (slot === "weapon") {
      existing.equippedWeaponId = itemId;
    } else {
      existing.equippedVestmentId = itemId;
    }
  }
}
async function upsertInstanceRecord(summary) {
  if (pool) {
    await pool.query(
      `INSERT INTO overworld_instances (instance_id, name, region_label, max_players, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (instance_id) DO UPDATE SET
         name = EXCLUDED.name,
         region_label = EXCLUDED.region_label,
         max_players = EXCLUDED.max_players,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [summary.instanceId, summary.name, summary.regionLabel, summary.maxPlayers, summary.status]
    );
    return;
  }
  memoryInstances.set(summary.instanceId, { ...summary });
}
async function recordHonorEntry(entry) {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO arena_honor_ledger (character_id, delta_honor, balance_after, reason, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [entry.characterId, entry.deltaHonor, entry.balanceAfter, entry.reason, entry.idempotencyKey]
    );
    return (res.rowCount ?? 0) > 0;
  }
  if (memoryHonorKeys.has(entry.idempotencyKey)) return false;
  memoryHonorKeys.add(entry.idempotencyKey);
  memoryHonorLedger.push({ ...entry });
  return true;
}
async function recordRewardClaim(claim) {
  if (pool) {
    const res = await pool.query(
      `INSERT INTO overworld_reward_claims (claim_id, character_id, source_activity, reward_type, reward_payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (claim_id) DO NOTHING
       RETURNING id`,
      [
        claim.claimId,
        claim.characterId,
        claim.sourceActivity,
        claim.rewardType,
        JSON.stringify(claim.rewardPayload)
      ]
    );
    return (res.rowCount ?? 0) > 0;
  }
  if (memoryRewardClaims.has(claim.claimId)) return false;
  memoryRewardClaims.set(claim.claimId, { ...claim });
  return true;
}

// server/src/characters/characterIntegrationAdapter.ts
function isCompatibleArmamentItem(itemId, slot, heroClass) {
  if (!itemId) return false;
  const def = BASE_ARMAMENTS[itemId];
  return Boolean(def && def.slot === slot && def.compatibleClasses.includes(heroClass));
}
var DevCharacterAdapter = class {
  constructor(options) {
    this.options = options;
  }
  options;
  charactersByAccount = /* @__PURE__ */ new Map();
  get shouldPersistLinks() {
    return this.options?.persistLinks !== false;
  }
  async getCharacterByAccountId(accountId) {
    const existing = this.charactersByAccount.get(accountId);
    if (!existing) return null;
    if (this.shouldPersistLinks) {
      const link = await getOverworldCharacterLink(accountId);
      if (link) {
        existing.characterId = link.characterId;
        existing.arenaHonor = Math.max(existing.arenaHonor, link.arenaHonor);
      }
    }
    return structuredClone(existing);
  }
  async createCharacterForAccount(params) {
    const existing = this.charactersByAccount.get(params.accountId);
    if (existing) return structuredClone(existing);
    const lockedClass = params.lockedClass ?? params.heroClass;
    const preferredClass = params.preferredClass ?? params.heroClass;
    const persistedLink = this.shouldPersistLinks ? await getOverworldCharacterLink(params.accountId) : null;
    const characterId = persistedLink?.characterId ?? `char_${randomUUID2()}`;
    const arenaHonor = persistedLink?.arenaHonor ?? 0;
    const weaponId = persistedLink && (persistedLink.equippedWeaponId === null || isCompatibleArmamentItem(persistedLink.equippedWeaponId, "weapon", lockedClass)) ? persistedLink.equippedWeaponId : getDefaultWeaponId(lockedClass);
    const vestmentId = persistedLink && (persistedLink.equippedVestmentId === null || isCompatibleArmamentItem(persistedLink.equippedVestmentId, "vestment", lockedClass)) ? persistedLink.equippedVestmentId : getDefaultVestmentId(lockedClass);
    if (this.shouldPersistLinks) {
      await upsertOverworldCharacterLink({
        accountId: params.accountId,
        characterId,
        identityProvider: "local_dev",
        arenaHonor,
        equippedWeaponId: weaponId,
        equippedVestmentId: vestmentId,
        lastKnownUsername: params.username
      });
    }
    const created = {
      accountId: params.accountId,
      characterId,
      username: params.username,
      heroClass: lockedClass,
      preferredClass,
      lockedClass,
      level: 1,
      xp: 0,
      attributes: {
        strength: 0,
        vitality: 0,
        dexterity: 0,
        intelligence: 0,
        faith: 0
      },
      attributePoints: 0,
      equippedArmament: {
        weaponId,
        vestmentId
      },
      permanentUnlocks: [],
      arenaHonor,
      isAdmin: params.isAdmin === true
    };
    this.charactersByAccount.set(params.accountId, created);
    return structuredClone(created);
  }
  /**
   * Synchronizes authoritative Dungeons / provider fields keyed by accountId while
   * preserving existing Overworld-owned progression (persistent characterId, Arena Honor,
   * and compatible Overworld Armament selections).
   */
  async syncAuthoritativeIdentity(identity, provider = "dungeons") {
    const existing = this.charactersByAccount.get(identity.accountId);
    const persistedLink = this.shouldPersistLinks ? await getOverworldCharacterLink(identity.accountId) : null;
    const resolvedClass = identity.lockedClass ?? identity.preferredClass;
    const defaultWeapon = getDefaultWeaponId(resolvedClass);
    const defaultVestment = getDefaultVestmentId(resolvedClass);
    const preservedWeapon = persistedLink && (persistedLink.equippedWeaponId === null || isCompatibleArmamentItem(persistedLink.equippedWeaponId, "weapon", resolvedClass)) ? persistedLink.equippedWeaponId : existing && (existing.equippedArmament.weaponId === null || isCompatibleArmamentItem(
      existing.equippedArmament.weaponId,
      "weapon",
      resolvedClass
    )) ? existing.equippedArmament.weaponId : defaultWeapon;
    const preservedVestment = persistedLink && (persistedLink.equippedVestmentId === null || isCompatibleArmamentItem(persistedLink.equippedVestmentId, "vestment", resolvedClass)) ? persistedLink.equippedVestmentId : existing && (existing.equippedArmament.vestmentId === null || isCompatibleArmamentItem(
      existing.equippedArmament.vestmentId,
      "vestment",
      resolvedClass
    )) ? existing.equippedArmament.vestmentId : defaultVestment;
    const preservedCharacterId = persistedLink?.characterId ?? existing?.characterId ?? identity.characterId ?? `char_${randomUUID2()}`;
    const preservedHonor = Math.max(
      0,
      persistedLink?.arenaHonor ?? 0,
      existing?.arenaHonor ?? 0,
      !persistedLink && !existing ? identity.arenaHonor ?? 0 : 0
    );
    const linkResult = this.shouldPersistLinks ? await upsertOverworldCharacterLink({
      accountId: identity.accountId,
      characterId: preservedCharacterId,
      identityProvider: provider,
      arenaHonor: preservedHonor,
      equippedWeaponId: identity.equippedArmament?.weaponId ?? preservedWeapon,
      equippedVestmentId: identity.equippedArmament?.vestmentId ?? preservedVestment,
      lastKnownUsername: identity.username
    }) : null;
    const finalCharacterId = linkResult?.characterId ?? preservedCharacterId;
    const finalHonor = linkResult?.arenaHonor ?? preservedHonor;
    const finalArmament = identity.equippedArmament ? identity.equippedArmament : {
      weaponId: linkResult ? linkResult.equippedWeaponId : preservedWeapon,
      vestmentId: linkResult ? linkResult.equippedVestmentId : preservedVestment
    };
    const synced = {
      accountId: identity.accountId,
      characterId: finalCharacterId,
      username: identity.username,
      heroClass: resolvedClass,
      preferredClass: identity.preferredClass,
      lockedClass: identity.lockedClass,
      level: identity.level,
      xp: identity.xp,
      attributes: {
        strength: identity.strength,
        vitality: identity.vitality,
        dexterity: identity.dexterity,
        intelligence: identity.intelligence,
        faith: identity.faith
      },
      attributePoints: identity.attributePoints,
      equippedArmament: finalArmament,
      permanentUnlocks: identity.permanentUnlocks ?? existing?.permanentUnlocks ?? [],
      arenaHonor: finalHonor,
      isAdmin: identity.isAdmin === true
    };
    this.charactersByAccount.set(identity.accountId, synced);
    return structuredClone(synced);
  }
  async updateEquippedArmament(params) {
    const character = this.charactersByAccount.get(params.accountId);
    if (!character) {
      return { ok: false, error: "Character identity not found." };
    }
    if (params.itemId !== null) {
      const def = BASE_ARMAMENTS[params.itemId];
      if (!def) {
        return { ok: false, error: `Unknown Armament item "${params.itemId}".` };
      }
      if (def.slot !== params.slot) {
        return {
          ok: false,
          error: `Item "${def.name}" cannot be equipped in the ${params.slot} slot.`
        };
      }
      if (!def.compatibleClasses.includes(character.heroClass)) {
        return {
          ok: false,
          error: `${def.name} is incompatible with class "${character.heroClass}" (DD-015).`
        };
      }
    }
    if (params.slot === "weapon") {
      character.equippedArmament.weaponId = params.itemId;
    } else {
      character.equippedArmament.vestmentId = params.itemId;
    }
    if (this.shouldPersistLinks) {
      await updateOverworldCharacterArmament(
        params.accountId,
        params.slot,
        params.itemId
      );
    }
    return { ok: true, character: structuredClone(character) };
  }
  async addArenaHonor(accountId, delta) {
    const character = this.charactersByAccount.get(accountId);
    if (!character) return null;
    const nextBalance = Math.max(0, character.arenaHonor + Math.trunc(delta));
    character.arenaHonor = nextBalance;
    if (this.shouldPersistLinks) {
      await updateOverworldCharacterHonor(accountId, nextBalance);
    }
    return structuredClone(character);
  }
};

// server/src/httpApp.ts
import express from "express";

// server/src/auth/adminAuthorization.ts
function isServerAdmin(subject) {
  return subject?.isAdmin === true;
}
function assertServerAdmin(subject, actionLabel = "administrator action") {
  if (!subject) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: "Authentication required."
    };
  }
  if (!isServerAdmin(subject)) {
    return {
      ok: false,
      code: "ADMIN_FORBIDDEN",
      message: `Administrator privileges required for ${actionLabel}.`
    };
  }
  return { ok: true };
}
function extractBearer(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}
function requireAdminSession(authService) {
  return (req, res, next) => {
    const token = extractBearer(req);
    const session = token ? authService.validateSessionToken(token) : null;
    const check = assertServerAdmin(session, "admin route access");
    if (!check.ok || !session) {
      const status = check.code === "AUTH_REQUIRED" ? 401 : 403;
      res.status(status).json({ error: check.message, code: check.code });
      return;
    }
    req.adminSession = session;
    next();
  };
}

// server/src/httpApp.ts
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}
function resolveLoginErrorStatus(code) {
  switch (code) {
    case "EXTERNAL_PROVIDER_NOT_CONFIGURED":
    case "DUNGEONS_UNREACHABLE":
    case "DUNGEONS_TIMEOUT":
    case "DUNGEONS_AUTH_ERROR":
    case "INVALID_DUNGEONS_RESPONSE":
      return 503;
    default:
      return 401;
  }
}
function createOverworldHttpApp({
  authService,
  instanceManager,
  progressionLayer
}) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/auth/config", (_req, res) => {
    res.json(authService.getPublicClientAuthConfig());
  });
  app.post("/api/auth/register", async (req, res) => {
    const parsed = AuthRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Invalid registration payload.",
        code: "INVALID_PAYLOAD"
      });
      return;
    }
    const result = await authService.register(
      parsed.data.username,
      parsed.data.password,
      parsed.data.heroClass
    );
    if (!result.ok || !result.character || !result.token) {
      const status = result.code === "LOCAL_REGISTRATION_DISABLED" ? 403 : 409;
      res.status(status).json({
        error: result.error ?? "Registration failed.",
        code: result.code ?? "REGISTRATION_FAILED"
      });
      return;
    }
    res.status(201).json({
      token: result.token,
      accountId: result.character.accountId,
      username: result.character.username,
      isAdmin: result.isAdmin ?? false,
      provider: result.provider,
      character: result.character
    });
  });
  app.post("/api/auth/login", async (req, res) => {
    const parsed = AuthLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Valid username and password are required.",
        code: "INVALID_PAYLOAD"
      });
      return;
    }
    const result = await authService.login(
      parsed.data.username,
      parsed.data.password
    );
    if (!result.ok || !result.character || !result.token) {
      const status = resolveLoginErrorStatus(result.code);
      res.status(status).json({
        error: result.error ?? "Authentication failed.",
        code: result.code ?? "AUTH_FAILED"
      });
      return;
    }
    res.json({
      token: result.token,
      accountId: result.character.accountId,
      username: result.character.username,
      isAdmin: result.isAdmin ?? false,
      provider: result.provider,
      character: result.character
    });
  });
  app.post(
    "/api/auth/external-assertion",
    async (req, res) => {
      const parsed = ExternalAssertionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Signed external identity assertion is required.",
          code: "INVALID_PAYLOAD"
        });
        return;
      }
      const result = await authService.authenticateExternalAssertion(
        parsed.data.assertion
      );
      if (!result.ok || !result.character || !result.token) {
        const status = result.code === "EXTERNAL_PROVIDER_NOT_CONFIGURED" ? 503 : 401;
        res.status(status).json({
          error: result.error ?? "External identity verification failed.",
          code: result.code ?? "INVALID_ASSERTION"
        });
        return;
      }
      res.json({
        token: result.token,
        accountId: result.character.accountId,
        username: result.character.username,
        isAdmin: result.isAdmin ?? false,
        provider: result.provider,
        character: result.character
      });
    }
  );
  app.get("/api/auth/me", async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const info = await authService.getSessionCharacter(token);
    if (!info) {
      res.status(401).json({ error: "Session expired or invalid." });
      return;
    }
    res.json({
      accountId: info.session.accountId,
      username: info.session.username,
      isAdmin: info.session.isAdmin,
      identityProvider: info.session.provider,
      character: info.character
    });
  });
  app.post("/api/auth/logout", (req, res) => {
    const token = extractBearerToken(req);
    if (token) {
      authService.logout(token);
    }
    res.json({ ok: true });
  });
  app.get(
    "/api/admin/status",
    requireAdminSession(authService),
    (req, res) => {
      res.json({
        ok: true,
        accountId: req.adminSession.accountId,
        username: req.adminSession.username,
        isAdmin: true,
        identityProvider: req.adminSession.provider
      });
    }
  );
  app.get("/api/instances", (_req, res) => {
    res.json({
      instances: instanceManager.listSummaries(),
      onlineCount: instanceManager.getTotalConnectedPlayers()
    });
  });
  app.post("/api/progression/claim", (_req, res) => {
    const rejected = progressionLayer.rejectClientAssertedReward();
    res.status(403).json({ error: rejected.reason });
  });
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "beyond-overworld",
      db: getDatabaseStatus(),
      identityProvider: authService.getIdentityProviderStatus(),
      instances: instanceManager.listSummaries().length,
      onlinePlayers: instanceManager.getTotalConnectedPlayers()
    });
  });
  return app;
}

// server/src/instances/worldInstanceManager.ts
import { randomBytes as randomBytes3 } from "node:crypto";

// server/src/instances/worldInstance.ts
import { randomUUID as randomUUID3 } from "node:crypto";

// shared/movement/playerMovement.ts
var COLLISION_COS = [
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
  0,
  Math.SQRT1_2
];
var COLLISION_SIN = [
  0,
  Math.SQRT1_2,
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2
];
function isWallAtWorld(map, wx, wy) {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  return map.tiles[ty * map.width + tx] === 0;
}
function getZoneAtWorld(map, wx, wy) {
  const tx = Math.max(0, Math.min(map.width - 1, Math.floor(wx / TILE_SIZE)));
  const ty = Math.max(0, Math.min(map.height - 1, Math.floor(wy / TILE_SIZE)));
  return map.zoneGrid[ty * map.width + tx] ?? "open_world";
}
function hasLineOfSight(map, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist <= TILE_SIZE) return true;
  const steps = Math.ceil(dist / 14);
  const stepX = dx / steps;
  const stepY = dy / steps;
  for (let i = 1; i < steps; i++) {
    if (isWallAtWorld(map, x1 + stepX * i, y1 + stepY * i)) {
      return false;
    }
  }
  return true;
}
function collidesCircle(map, wx, wy, radius) {
  if (isWallAtWorld(map, wx, wy)) return true;
  for (let i = 0; i < 8; i++) {
    const cx = wx + COLLISION_COS[i] * radius;
    const cy = wy + COLLISION_SIN[i] * radius;
    if (isWallAtWorld(map, cx, cy)) return true;
  }
  return false;
}
function moveWithCollision(map, entity, dx, dy, radius = PLAYER_COLLISION_RADIUS) {
  if (collidesCircle(map, entity.x, entity.y, radius * 0.75)) {
    let escapeX = 0;
    let escapeY = 0;
    const probeDist = radius + 8;
    for (let i = 0; i < 8; i++) {
      const testX = entity.x + COLLISION_COS[i] * probeDist;
      const testY = entity.y + COLLISION_SIN[i] * probeDist;
      if (!isWallAtWorld(map, testX, testY)) {
        escapeX += COLLISION_COS[i];
        escapeY += COLLISION_SIN[i];
      }
    }
    if (escapeX !== 0 || escapeY !== 0) {
      const len = Math.hypot(escapeX, escapeY);
      entity.x += escapeX / len * 4;
      entity.y += escapeY / len * 4;
    }
  }
  const targetX = entity.x + dx;
  const targetY = entity.y + dy;
  if (hasLineOfSight(map, entity.x, entity.y, targetX, targetY) && !collidesCircle(map, targetX, targetY, radius)) {
    entity.x = targetX;
    entity.y = targetY;
    return;
  }
  if (dx !== 0 && !collidesCircle(map, targetX, entity.y, radius)) {
    entity.x = targetX;
  } else if (dx !== 0 && !collidesCircle(map, entity.x + dx * 0.5, entity.y, radius)) {
    entity.x += dx * 0.5;
  }
  if (dy !== 0 && !collidesCircle(map, entity.x, targetY, radius)) {
    entity.y = targetY;
  } else if (dy !== 0 && !collidesCircle(map, entity.x, entity.y + dy * 0.5, radius)) {
    entity.y += dy * 0.5;
  }
}
function computePlayerMoveSpeed(player) {
  const def = HERO_CLASSES[player.heroClass];
  let moveSpeed = def.speed * (1 + (player.dexterity || 0) * 25e-4);
  if ((player.hasteMs || 0) > 0) moveSpeed *= 1.22;
  return moveSpeed;
}
function normalizePlayerInputDirection(input) {
  let mx = 0;
  let my = 0;
  if (typeof input.stickX === "number" && typeof input.stickY === "number" && Math.hypot(input.stickX, input.stickY) > 0.05) {
    const len = Math.hypot(input.stickX, input.stickY);
    const clampedLen = Math.min(1, len);
    mx = input.stickX / len * clampedLen;
    my = input.stickY / len * clampedLen;
  } else {
    mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    }
  }
  return { mx, my };
}
function stepPlayerMovement(entity, input, map, dtSec, options) {
  if (dtSec <= 0) return;
  const moveSpeed = options?.moveSpeed ?? (options?.player ? computePlayerMoveSpeed(options.player) : 175);
  const { mx, my } = normalizePlayerInputDirection(input);
  if (mx !== 0 || my !== 0) {
    entity.vx = mx * moveSpeed;
    entity.vy = my * moveSpeed;
  } else {
    entity.vx = 0;
    entity.vy = 0;
  }
  if (entity.vx !== 0 || entity.vy !== 0) {
    moveWithCollision(
      map,
      entity,
      entity.vx * dtSec,
      entity.vy * dtSec,
      PLAYER_COLLISION_RADIUS
    );
  }
}

// server/src/arena/arenaModule.ts
var ArenaModule = class {
  getStatus(players) {
    let count = 0;
    for (const player of players) {
      if (player.connected && player.zone === "arena") count++;
    }
    return {
      id: "arena",
      name: "Competitive Arena",
      status: "awaiting_design_approval",
      participantsInZone: count,
      summary: "Arena zone boundary active. Matchmaking, ranking, and Arena Honor reward formulas await design approval."
    };
  }
};

// server/src/combat/cooldownTracker.ts
var CooldownTracker = class {
  resolveActiveTacticalSkill(_heroClass, weaponId) {
    if (!weaponId) {
      return { skillId: null, cooldownDurationMs: 0 };
    }
    const weapon = BASE_ARMAMENTS[weaponId];
    if (!weapon || !weapon.tacticalSkillId) {
      return { skillId: null, cooldownDurationMs: 0 };
    }
    return {
      skillId: weapon.tacticalSkillId,
      cooldownDurationMs: weapon.tacticalCooldownMs ?? 4500
    };
  }
  tickCooldowns(cooldownsMs, dtMs) {
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
  getRemainingCooldownMs(cooldownsMs, skillId) {
    if (!skillId) return 0;
    return Math.max(0, cooldownsMs[skillId] ?? 0);
  }
  triggerTacticalCooldown(cooldownsMs, skillId, durationMs) {
    const existing = this.getRemainingCooldownMs(cooldownsMs, skillId);
    if (existing > 0) {
      return { triggered: false, remainingMs: existing };
    }
    cooldownsMs[skillId] = Math.max(0, Math.round(durationMs));
    return { triggered: true, remainingMs: cooldownsMs[skillId] };
  }
};

// server/src/events/publicEventsModule.ts
var PublicEventsModule = class {
  getStatus(players) {
    let openWorldCount = 0;
    for (const player of players) {
      if (player.connected && player.zone === "open_world") openWorldCount++;
    }
    return {
      id: "public_events",
      name: "Shared Public Events",
      status: "awaiting_design_approval",
      participantsInZone: openWorldCount,
      summary: "Shared event state pipeline active. Public event types, schedules, and rewards await design approval."
    };
  }
};

// server/src/movement/movementValidator.ts
var MovementValidator = class {
  stepPlayer(player, input, map, dtMs) {
    const dtSec = Math.max(0, Math.min(0.1, dtMs / 1e3));
    const previousZone = player.zone;
    player.aimAngle = Number.isFinite(input.aimAngle) ? input.aimAngle : player.aimAngle;
    stepPlayerMovement(player, input, map, dtSec, {
      player: {
        heroClass: player.heroClass,
        dexterity: player.dexterity,
        hasteMs: player.hasteMs
      }
    });
    player.zone = getZoneAtWorld(map, player.x, player.y);
    return { previousZone, nextZone: player.zone };
  }
};

// server/src/pvp/pvpRuleService.ts
var COMBAT_LOCK_DURATION_MS = 5e3;
var PvpRuleService = class {
  evaluateCombatProbe(player, map, kind, cooldownTracker) {
    const authoritativeZone = getZoneAtWorld(map, player.x, player.y);
    player.zone = authoritativeZone;
    if (authoritativeZone === "safe") {
      return {
        allowed: false,
        code: "SAFE_ZONE_PROTECTED",
        reason: "Player attacks are disabled inside Safe Zones (DD-010)."
      };
    }
    if (kind === "tactical") {
      const skillInfo = cooldownTracker.resolveActiveTacticalSkill(
        player.heroClass,
        player.weaponId
      );
      if (!skillInfo.skillId) {
        return {
          allowed: false,
          code: "NO_TACTICAL_SKILL",
          reason: "No Weapon Tactical Skill is currently equipped (DD-019)."
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
          code: "SKILL_ON_COOLDOWN",
          reason: `Tactical Skill is on cooldown (${(result.remainingMs / 1e3).toFixed(1)}s remaining).`,
          cooldownRemainingMs: result.remainingMs
        };
      }
      return {
        allowed: true,
        combatLockMs: COMBAT_LOCK_DURATION_MS,
        triggeredSkillId: skillInfo.skillId,
        cooldownRemainingMs: result.remainingMs
      };
    }
    return {
      allowed: true,
      combatLockMs: COMBAT_LOCK_DURATION_MS
    };
  }
  validateArmamentSwitch(player, map, slot, itemId) {
    const authoritativeZone = getZoneAtWorld(map, player.x, player.y);
    player.zone = authoritativeZone;
    if (authoritativeZone !== "safe") {
      return {
        allowed: false,
        code: "OUTSIDE_SAFE_ZONE",
        reason: "Armaments may only be switched inside Safe Zones or preparation areas."
      };
    }
    if (player.inCombat || player.combatLockRemainingMs > 0) {
      return {
        allowed: false,
        code: "IN_ACTIVE_COMBAT",
        reason: `Cannot switch Armaments during active combat (${(player.combatLockRemainingMs / 1e3).toFixed(1)}s lock remaining, DD-021).`
      };
    }
    if (itemId !== null) {
      const item = BASE_ARMAMENTS[itemId];
      if (!item) {
        return {
          allowed: false,
          code: "UNKNOWN_ARMAMENT",
          reason: `Unknown Armament "${itemId}".`
        };
      }
      if (item.slot !== slot) {
        return {
          allowed: false,
          code: "INVALID_ARMAMENT_SLOT",
          reason: `${item.name} must be equipped in the ${item.slot} slot.`
        };
      }
      if (!item.compatibleClasses.includes(player.heroClass)) {
        return {
          allowed: false,
          code: "CLASS_INCOMPATIBLE",
          reason: `${item.name} is incompatible with ${player.heroClass} (DD-015).`
        };
      }
    }
    return { allowed: true };
  }
};

// server/src/survival/survivalModule.ts
var SurvivalModule = class {
  getStatus(players) {
    let count = 0;
    for (const player of players) {
      if (player.connected && player.zone === "survival") count++;
    }
    return {
      id: "survival",
      name: "PvPvE Survival",
      status: "awaiting_design_approval",
      participantsInZone: count,
      summary: "Survival Grounds zone boundary active. Session rules, enemy scaling, and reward calculations await design approval."
    };
  }
};

// server/src/world/worldMap.ts
function createFoundationWorldMap() {
  const width = 64;
  const height = 48;
  const tiles = new Array(width * height).fill(1);
  const zoneGrid = new Array(width * height).fill("open_world");
  const setTile = (x, y, tileVal) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    tiles[y * width + x] = tileVal;
  };
  const fillZone = (rx, ry, rw, rh, zone) => {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) {
          zoneGrid[y * width + x] = zone;
        }
      }
    }
  };
  for (let x = 0; x < width; x++) {
    setTile(x, 0, 0);
    setTile(x, height - 1, 0);
  }
  for (let y = 0; y < height; y++) {
    setTile(0, y, 0);
    setTile(width - 1, y, 0);
  }
  const regions = [
    {
      id: "region_sanctuary",
      zone: "safe",
      label: "Bastion Sanctuary (Safe Zone)",
      x: 24,
      y: 17,
      w: 16,
      h: 14
    },
    {
      id: "region_arena",
      zone: "arena",
      label: "Arena Grounds",
      x: 3,
      y: 14,
      w: 14,
      h: 20
    },
    {
      id: "region_survival",
      zone: "survival",
      label: "Survival Grounds",
      x: 47,
      y: 14,
      w: 14,
      h: 20
    }
  ];
  for (const r of regions) {
    fillZone(r.x, r.y, r.w, r.h, r.zone);
  }
  const sx1 = 24;
  const sy1 = 17;
  const sx2 = 39;
  const sy2 = 30;
  for (let x = sx1; x <= sx2; x++) {
    const isGate = x >= 30 && x <= 33;
    if (!isGate) {
      setTile(x, sy1, 0);
      setTile(x, sy2, 0);
    }
  }
  for (let y = sy1; y <= sy2; y++) {
    const isGate = y >= 22 && y <= 25;
    if (!isGate) {
      setTile(sx1, y, 0);
      setTile(sx2, y, 0);
    }
  }
  for (let y = 14; y <= 33; y++) {
    if (y < 21 || y > 26) {
      setTile(16, y, 0);
    }
  }
  for (let x = 3; x <= 16; x++) {
    setTile(x, 14, 0);
    setTile(x, 33, 0);
  }
  for (let y = 14; y <= 33; y++) {
    if (y < 21 || y > 26) {
      setTile(47, y, 0);
    }
  }
  for (let x = 47; x <= 60; x++) {
    setTile(x, 14, 0);
    setTile(x, 33, 0);
  }
  const pillars = [
    [20, 10],
    [43, 10],
    [20, 38],
    [43, 38],
    [10, 8],
    [53, 8],
    [10, 40],
    [53, 40]
  ];
  for (const [px, py] of pillars) {
    setTile(px, py, 0);
    setTile(px + 1, py, 0);
  }
  return {
    mapId: "dev_foundation_v1",
    title: "Development Foundation Map (Unfinalized Layout)",
    isDevelopmentStub: true,
    width,
    height,
    tiles,
    zoneGrid,
    regions,
    spawnPoint: {
      x: 31.5 * TILE_SIZE,
      y: 23.5 * TILE_SIZE
    }
  };
}

// server/src/instances/worldInstance.ts
var DISCONNECT_GRACE_MS = 15e3;
var MAX_CHAT_HISTORY = 60;
var IDLE_INPUT = {
  up: false,
  down: false,
  left: false,
  right: false,
  attack: false,
  aimAngle: 0,
  stickX: 0,
  stickY: 0
};
var WorldInstance = class {
  instanceId;
  name;
  regionLabel;
  maxPlayers;
  map;
  playersById = /* @__PURE__ */ new Map();
  playerIdByCharacterId = /* @__PURE__ */ new Map();
  chatHistory = [];
  pendingCallouts = [];
  tickSeq = 0;
  movementValidator = new MovementValidator();
  cooldownTracker = new CooldownTracker();
  pvpRuleService = new PvpRuleService();
  arenaModule = new ArenaModule();
  survivalModule = new SurvivalModule();
  publicEventsModule = new PublicEventsModule();
  constructor(options) {
    this.instanceId = options.instanceId;
    this.name = options.name;
    this.regionLabel = options.regionLabel ?? "Global Overworld";
    this.maxPlayers = options.maxPlayers ?? OVERWORLD_INSTANCE_CAPACITY;
    this.map = options.map ?? createFoundationWorldMap();
    this.pushSystemChat(
      `Welcome to ${this.name} (${this.instanceId}). Player attacks are disabled inside Safe Zones.`
    );
  }
  getSummary() {
    const count = this.getPlayerCount();
    return {
      instanceId: this.instanceId,
      name: this.name,
      regionLabel: this.regionLabel,
      playerCount: count,
      maxPlayers: this.maxPlayers,
      status: count >= this.maxPlayers ? "full" : "online"
    };
  }
  getPlayerCount() {
    return this.playersById.size;
  }
  getConnectedCount() {
    let count = 0;
    for (const p of this.playersById.values()) {
      if (p.state.connected) count++;
    }
    return count;
  }
  getChatHistory() {
    return [...this.chatHistory];
  }
  getPlayerState(playerId) {
    return this.playersById.get(playerId)?.state ?? null;
  }
  addOrReconnectPlayer(identity) {
    const existingId = this.playerIdByCharacterId.get(identity.characterId);
    if (existingId) {
      const existing = this.playersById.get(existingId);
      if (existing) {
        existing.state.connected = true;
        existing.state.arenaHonor = identity.arenaHonor;
        existing.disconnectGraceRemainingMs = 0;
        existing.latestInput = { ...IDLE_INPUT };
        return { ok: true, player: existing.state, reconnected: true };
      }
    }
    if (this.playersById.size >= this.maxPlayers) {
      return {
        ok: false,
        error: `Instance "${this.name}" is full (${this.maxPlayers}/${this.maxPlayers}).`
      };
    }
    const playerId = identity.characterId;
    const classDef = HERO_CLASSES[identity.heroClass];
    const spawnOffsetAngle = this.playersById.size * 2.39996 % (Math.PI * 2);
    const spawnRadius = Math.min(56, this.playersById.size * 4);
    const pos = {
      x: this.map.spawnPoint.x,
      y: this.map.spawnPoint.y
    };
    if (spawnRadius > 0) {
      moveWithCollision(
        this.map,
        pos,
        Math.cos(spawnOffsetAngle) * spawnRadius,
        Math.sin(spawnOffsetAngle) * spawnRadius
      );
    }
    const skillInfo = this.cooldownTracker.resolveActiveTacticalSkill(
      identity.heroClass,
      identity.equippedArmament.weaponId
    );
    const state = {
      id: playerId,
      characterId: identity.characterId,
      username: identity.username,
      heroClass: identity.heroClass,
      level: identity.level,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: classDef.maxHp + identity.attributes.vitality * 12,
      maxHp: classDef.maxHp + identity.attributes.vitality * 12,
      shield: 0,
      zone: getZoneAtWorld(this.map, pos.x, pos.y),
      inCombat: false,
      combatLockRemainingMs: 0,
      weaponId: identity.equippedArmament.weaponId,
      vestmentId: identity.equippedArmament.vestmentId,
      activeTacticalSkillId: skillInfo.skillId,
      tacticalCooldownsMs: {},
      attackAnimMs: 0,
      hasteMs: 0,
      dexterity: identity.attributes.dexterity,
      arenaHonor: identity.arenaHonor,
      connected: true,
      lastInputSeq: 0
    };
    this.playersById.set(playerId, {
      accountId: identity.accountId,
      state,
      latestInput: { ...IDLE_INPUT },
      disconnectGraceRemainingMs: 0
    });
    this.playerIdByCharacterId.set(identity.characterId, playerId);
    this.pushCallout("info", state.x, state.y - 24, `${state.username} arrived`, "#E2E8F0");
    return { ok: true, player: state, reconnected: false };
  }
  markDisconnected(playerId, graceMs = DISCONNECT_GRACE_MS) {
    const runtime = this.playersById.get(playerId);
    if (!runtime) return;
    runtime.state.connected = false;
    runtime.state.vx = 0;
    runtime.state.vy = 0;
    runtime.latestInput = { ...IDLE_INPUT };
    runtime.disconnectGraceRemainingMs = Math.max(0, graceMs);
  }
  removePlayerImmediately(playerId) {
    const runtime = this.playersById.get(playerId);
    if (!runtime) return;
    this.playerIdByCharacterId.delete(runtime.state.characterId);
    this.playersById.delete(playerId);
  }
  setPlayerInput(playerId, input, seq) {
    const runtime = this.playersById.get(playerId);
    if (!runtime || !runtime.state.connected) return;
    runtime.latestInput = input;
    if (typeof seq === "number" && seq > (runtime.state.lastInputSeq ?? 0)) {
      runtime.state.lastInputSeq = seq;
    }
  }
  handleAttackProbe(playerId, kind, aimAngle) {
    const runtime = this.playersById.get(playerId);
    if (!runtime) {
      return { ok: false, code: "PLAYER_NOT_FOUND", message: "Player not found in instance." };
    }
    const player = runtime.state;
    player.aimAngle = Number.isFinite(aimAngle) ? aimAngle : player.aimAngle;
    const evaluation = this.pvpRuleService.evaluateCombatProbe(
      player,
      this.map,
      kind,
      this.cooldownTracker
    );
    if (!evaluation.allowed) {
      this.pushCallout(
        evaluation.code === "SAFE_ZONE_PROTECTED" ? "blocked" : "cooldown",
        player.x,
        player.y - 28,
        evaluation.code === "SAFE_ZONE_PROTECTED" ? "Safe Zone: Attacks Disabled" : "Cooldown / Unavailable",
        "#F87171"
      );
      return {
        ok: false,
        code: evaluation.code,
        message: evaluation.reason
      };
    }
    player.attackAnimMs = 260;
    player.combatLockRemainingMs = Math.max(
      player.combatLockRemainingMs,
      evaluation.combatLockMs ?? 5e3
    );
    player.inCombat = true;
    this.pushCallout(
      "info",
      player.x,
      player.y - 28,
      kind === "tactical" ? "Tactical Skill Ready Probe" : "Attack Probe (Combat Locked)",
      "#FBBF24"
    );
    return { ok: true };
  }
  async handleEquipArmament(playerId, slot, itemId, characterAdapter) {
    const runtime = this.playersById.get(playerId);
    if (!runtime) {
      return { ok: false, code: "PLAYER_NOT_FOUND", message: "Player not found in instance." };
    }
    const player = runtime.state;
    const validation = this.pvpRuleService.validateArmamentSwitch(
      player,
      this.map,
      slot,
      itemId
    );
    if (!validation.allowed) {
      this.pushCallout(
        "blocked",
        player.x,
        player.y - 28,
        validation.code === "IN_ACTIVE_COMBAT" ? "In Combat: Armament Locked" : "Safe Zone Required",
        "#F87171"
      );
      return {
        ok: false,
        code: validation.code,
        message: validation.reason
      };
    }
    const update = await characterAdapter.updateEquippedArmament({
      accountId: runtime.accountId,
      slot,
      itemId
    });
    if (!update.ok || !update.character) {
      return {
        ok: false,
        code: "ADAPTER_ERROR",
        message: update.error ?? "Failed to update shared Armament."
      };
    }
    if (slot === "weapon") {
      player.weaponId = itemId;
      player.activeTacticalSkillId = this.cooldownTracker.resolveActiveTacticalSkill(
        player.heroClass,
        itemId
      ).skillId;
    } else {
      player.vestmentId = itemId;
    }
    this.pushCallout(
      "info",
      player.x,
      player.y - 28,
      itemId ? `Equipped ${slot}` : `Unequipped ${slot}`,
      "#34D399"
    );
    return { ok: true, updatedCharacter: update.character };
  }
  addChatMessage(playerId, text) {
    const runtime = this.playersById.get(playerId);
    if (!runtime) return null;
    const msg = {
      id: randomUUID3(),
      sender: runtime.state.username,
      text: text.trim().slice(0, 240),
      timestamp: Date.now()
    };
    this.chatHistory.push(msg);
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory.shift();
    }
    return msg;
  }
  step(dtMs) {
    const toEvict = [];
    for (const [playerId, runtime] of this.playersById) {
      const s = runtime.state;
      if (!s.connected) {
        runtime.disconnectGraceRemainingMs -= dtMs;
        if (runtime.disconnectGraceRemainingMs <= 0) {
          toEvict.push(playerId);
          continue;
        }
      } else {
        const { previousZone, nextZone } = this.movementValidator.stepPlayer(
          s,
          runtime.latestInput,
          this.map,
          dtMs
        );
        if (previousZone !== nextZone) {
          const meta = OVERWORLD_ZONES[nextZone];
          this.pushCallout("zone", s.x, s.y - 30, meta.label, meta.accentColor);
        }
      }
      this.cooldownTracker.tickCooldowns(s.tacticalCooldownsMs, dtMs);
      if (s.attackAnimMs > 0) {
        s.attackAnimMs = Math.max(0, s.attackAnimMs - dtMs);
      }
      if (s.hasteMs > 0) {
        s.hasteMs = Math.max(0, s.hasteMs - dtMs);
      }
      if (s.combatLockRemainingMs > 0) {
        s.combatLockRemainingMs = Math.max(0, s.combatLockRemainingMs - dtMs);
        s.inCombat = s.combatLockRemainingMs > 0;
      } else {
        s.inCombat = false;
      }
    }
    for (const playerId of toEvict) {
      this.removePlayerImmediately(playerId);
    }
    this.tickSeq += 1;
  }
  toSnapshot(consumeEvents = true) {
    const players = [];
    for (const runtime of this.playersById.values()) {
      players.push({
        ...runtime.state,
        tacticalCooldownsMs: { ...runtime.state.tacticalCooldownsMs }
      });
    }
    const events = consumeEvents ? this.pendingCallouts : [...this.pendingCallouts];
    if (consumeEvents) {
      this.pendingCallouts = [];
    }
    return {
      protocolVersion: PROTOCOL_VERSION,
      instanceId: this.instanceId,
      instanceName: this.name,
      serverTimeMs: Date.now(),
      tickSeq: this.tickSeq,
      players,
      events,
      activities: [
        this.arenaModule.getStatus(players),
        this.survivalModule.getStatus(players),
        this.publicEventsModule.getStatus(players)
      ]
    };
  }
  pushSystemChat(text) {
    this.chatHistory.push({
      id: randomUUID3(),
      sender: "Overworld",
      text,
      timestamp: Date.now(),
      system: true
    });
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory.shift();
    }
  }
  pushCallout(kind, x, y, text, color) {
    if (this.pendingCallouts.length >= 24) {
      this.pendingCallouts.shift();
    }
    this.pendingCallouts.push({
      id: randomUUID3(),
      kind,
      x: Math.round(x),
      y: Math.round(y),
      text,
      color
    });
  }
};

// server/src/instances/worldInstanceManager.ts
var MAX_INSTANCES = 12;
var WorldInstanceManager = class {
  instances = /* @__PURE__ */ new Map();
  constructor() {
    this.createInstance({
      instanceId: "OVERWORLD-1",
      name: "Highkeep Outpost",
      regionLabel: "Primary Shard",
      maxPlayers: OVERWORLD_INSTANCE_CAPACITY
    });
  }
  createInstance(options) {
    if (this.instances.size >= MAX_INSTANCES) {
      return {
        ok: false,
        error: `Maximum active shard limit (${MAX_INSTANCES}) reached.`
      };
    }
    const instanceId = options.instanceId ?? `OW-${randomBytes3(3).toString("hex").toUpperCase()}`;
    if (this.instances.has(instanceId)) {
      return { ok: false, error: `Instance ${instanceId} already exists.` };
    }
    const instance = new WorldInstance({
      instanceId,
      name: options.name.trim(),
      regionLabel: options.regionLabel ?? "Open Shard",
      maxPlayers: options.maxPlayers ?? OVERWORLD_INSTANCE_CAPACITY
    });
    this.instances.set(instanceId, instance);
    void upsertInstanceRecord(instance.getSummary()).catch(() => {
    });
    return { ok: true, instance };
  }
  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }
  listInstances() {
    return Array.from(this.instances.values());
  }
  listSummaries() {
    return this.listInstances().map((inst) => inst.getSummary());
  }
  getTotalConnectedPlayers() {
    let total = 0;
    for (const inst of this.instances.values()) {
      total += inst.getConnectedCount();
    }
    return total;
  }
  stepAll(dtMs) {
    for (const inst of this.instances.values()) {
      inst.step(dtMs);
    }
  }
};

// server/src/networking/wsGateway.ts
import { WebSocketServer } from "ws";

// shared/protocols/snapshotDelta.ts
function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!shallowEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const objA = a;
  const objB = b;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(objB, k)) return false;
    if (!shallowEqual(objA[k], objB[k])) return false;
  }
  return true;
}
function diffEntity(prev, next) {
  const prevRec = prev;
  const nextRec = next;
  const changes = {};
  let changed = false;
  for (const key of Object.keys(nextRec)) {
    if (key === "id") continue;
    if (!shallowEqual(prevRec[key], nextRec[key])) {
      changes[key] = nextRec[key];
      changed = true;
    }
  }
  let removedKeys;
  for (const key of Object.keys(prevRec)) {
    if (key === "id") continue;
    if (!(key in nextRec)) {
      if (!removedKeys) removedKeys = [];
      removedKeys.push(key);
      changed = true;
    }
  }
  if (!changed) return null;
  return { changes, removedKeys };
}
function cloneSnapshotBaseline(snap) {
  return {
    ...snap,
    players: snap.players.map((p) => ({
      ...p,
      tacticalCooldownsMs: { ...p.tacticalCooldownsMs }
    })),
    events: [],
    activities: snap.activities.map((a) => ({ ...a }))
  };
}
function computeSnapshotDelta(prev, next, baseSeq, nextSeq) {
  const delta = {
    seq: nextSeq,
    baseSeq,
    serverTimeMs: next.serverTimeMs
  };
  const prevMap = new Map(prev.players.map((p) => [p.id, p]));
  const nextIds = /* @__PURE__ */ new Set();
  let added;
  let updated;
  for (const p of next.players) {
    nextIds.add(p.id);
    const oldP = prevMap.get(p.id);
    if (!oldP) {
      if (!added) added = [];
      added.push(p);
    } else {
      const patch = diffEntity(oldP, p);
      if (patch) {
        if (!updated) updated = [];
        updated.push({
          id: p.id,
          changes: patch.changes,
          ...patch.removedKeys ? { removedKeys: patch.removedKeys } : {}
        });
      }
    }
  }
  let removed;
  for (const oldP of prev.players) {
    if (!nextIds.has(oldP.id)) {
      if (!removed) removed = [];
      removed.push(oldP.id);
    }
  }
  if (added) delta.playersAdded = added;
  if (updated) delta.playersUpdated = updated;
  if (removed) delta.playersRemoved = removed;
  if (next.events.length > 0) delta.events = next.events;
  if (!shallowEqual(prev.activities, next.activities)) delta.activities = next.activities;
  return delta;
}

// server/src/networking/wsTransport.ts
var WS_OPEN = 1;
var MAX_DROPPABLE_BUFFER_BYTES = 64 * 1024;
var MAX_HARD_BUFFER_BYTES = 512 * 1024;
function sendFrame(ws, msg) {
  if (ws.readyState !== WS_OPEN) return false;
  if (ws.bufferedAmount > MAX_HARD_BUFFER_BYTES) {
    ws.close(1008, "Send buffer saturated");
    return false;
  }
  ws.send(JSON.stringify(msg));
  return true;
}
function sendDroppableFrame(ws, msg) {
  if (ws.readyState !== WS_OPEN) return false;
  if (ws.bufferedAmount > MAX_HARD_BUFFER_BYTES) {
    ws.close(1008, "Send buffer saturated");
    return false;
  }
  if (ws.bufferedAmount > MAX_DROPPABLE_BUFFER_BYTES) {
    return false;
  }
  ws.send(JSON.stringify(msg));
  return true;
}
var InstanceClientIndex = class {
  clientsByInstance = /* @__PURE__ */ new Map();
  lobbySubscribers = /* @__PURE__ */ new Set();
  addLobbySubscriber(client) {
    this.lobbySubscribers.add(client);
  }
  removeLobbySubscriber(client) {
    this.lobbySubscribers.delete(client);
  }
  getLobbySubscribers() {
    return this.lobbySubscribers;
  }
  assignToInstance(client, instanceId) {
    this.removeFromInstance(client);
    client.instanceId = instanceId;
    let bucket = this.clientsByInstance.get(instanceId);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Set();
      this.clientsByInstance.set(instanceId, bucket);
    }
    bucket.add(client);
  }
  removeFromInstance(client) {
    if (!client.instanceId) return;
    const bucket = this.clientsByInstance.get(client.instanceId);
    if (bucket) {
      bucket.delete(client);
      if (bucket.size === 0) {
        this.clientsByInstance.delete(client.instanceId);
      }
    }
    client.instanceId = null;
    client.playerId = null;
    client.lastAckBaseline = null;
    client.lastSentSeq = 0;
  }
  removeAll(client) {
    this.removeLobbySubscriber(client);
    this.removeFromInstance(client);
  }
  getInstanceClients(instanceId) {
    return this.clientsByInstance.get(instanceId) ?? EMPTY_CLIENT_SET;
  }
  broadcastCritical(instanceId, msg) {
    for (const client of this.getInstanceClients(instanceId)) {
      sendFrame(client.socket, msg);
    }
  }
};
var EMPTY_CLIENT_SET = /* @__PURE__ */ new Set();

// server/src/networking/wsGateway.ts
var WS_PROTOCOL_NAME = "beyond-overworld-v1";
var KEYFRAME_INTERVAL_TICKS = 80;
function parseSubprotocolToken(headerValue) {
  if (!headerValue) return null;
  const raw = Array.isArray(headerValue) ? headerValue.join(",") : headerValue;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts[0] !== WS_PROTOCOL_NAME) return null;
  return parts[1] ?? null;
}
function attachWsGateway(options) {
  const { server, authService, characterAdapter, instanceManager } = options;
  const clientIndex = new InstanceClientIndex();
  const connectedClients = /* @__PURE__ */ new Set();
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      return protocols.has(WS_PROTOCOL_NAME) ? WS_PROTOCOL_NAME : false;
    }
  });
  server.on("upgrade", (req, socket, head) => {
    const reqUrl = new URL(req.url ?? "/", "http://localhost");
    if (reqUrl.pathname !== "/ws") {
      return;
    }
    const token = parseSubprotocolToken(req.headers["sec-websocket-protocol"]);
    const session = token ? authService.validateSessionToken(token) : null;
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, session);
    });
  });
  const broadcastLobbyState = async () => {
    const summaries = instanceManager.listSummaries();
    const onlineCount = instanceManager.getTotalConnectedPlayers();
    for (const client of clientIndex.getLobbySubscribers()) {
      const char = await characterAdapter.getCharacterByAccountId(client.accountId);
      if (!char) continue;
      sendFrame(client.socket, {
        type: "lobby:instances",
        protocolVersion: PROTOCOL_VERSION,
        instances: summaries,
        onlineCount,
        character: char
      });
    }
  };
  wss.on("connection", (ws, session) => {
    const client = {
      socket: ws,
      accountId: session.accountId,
      username: session.username,
      isAdmin: session.isAdmin,
      provider: session.provider,
      instanceId: null,
      playerId: null,
      lastAckBaseline: null,
      lastSentSeq: 0
    };
    connectedClients.add(client);
    ws.on("message", async (rawData) => {
      let parsedJson;
      try {
        const text = typeof rawData === "string" ? rawData : rawData.toString("utf8");
        parsedJson = JSON.parse(text);
      } catch {
        sendFrame(ws, { type: "error", message: "Malformed JSON payload." });
        return;
      }
      const validated = ClientMessageSchema.safeParse(parsedJson);
      if (!validated.success) {
        sendFrame(ws, {
          type: "error",
          message: "Invalid protocol message schema."
        });
        return;
      }
      const msg = validated.data;
      if (msg.type === "ping") {
        sendFrame(ws, { type: "pong", t: msg.t, tickMs: SERVER_TICK_MS });
        return;
      }
      if (msg.type === "lobby:subscribe") {
        clientIndex.addLobbySubscriber(client);
        const char = await characterAdapter.getCharacterByAccountId(client.accountId);
        if (!char) {
          sendFrame(ws, { type: "error", message: "Shared character identity missing." });
          return;
        }
        sendFrame(ws, {
          type: "lobby:instances",
          protocolVersion: PROTOCOL_VERSION,
          instances: instanceManager.listSummaries(),
          onlineCount: instanceManager.getTotalConnectedPlayers(),
          character: char
        });
        return;
      }
      if (msg.type === "instance:create") {
        const created = instanceManager.createInstance({ name: msg.name });
        if (!created.ok) {
          sendFrame(ws, {
            type: "action:rejected",
            code: "CREATE_FAILED",
            message: created.error ?? "Could not create instance."
          });
          return;
        }
        await broadcastLobbyState();
        return;
      }
      if (msg.type === "instance:join") {
        const target = instanceManager.getInstance(msg.instanceId);
        if (!target) {
          sendFrame(ws, {
            type: "action:rejected",
            code: "INSTANCE_NOT_FOUND",
            message: "Requested Overworld instance does not exist."
          });
          return;
        }
        if (client.instanceId && client.playerId) {
          const prev = instanceManager.getInstance(client.instanceId);
          prev?.removePlayerImmediately(client.playerId);
          clientIndex.removeFromInstance(client);
        }
        const character = await characterAdapter.getCharacterByAccountId(client.accountId);
        if (!character) {
          sendFrame(ws, { type: "error", message: "Character identity unavailable." });
          return;
        }
        const joined = target.addOrReconnectPlayer(character);
        if (!joined.ok || !joined.player) {
          sendFrame(ws, {
            type: "action:rejected",
            code: "INSTANCE_FULL",
            message: joined.error ?? "Could not join instance."
          });
          return;
        }
        clientIndex.removeLobbySubscriber(client);
        clientIndex.assignToInstance(client, target.instanceId);
        client.playerId = joined.player.id;
        const snapshot = target.toSnapshot(false);
        client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
        client.lastSentSeq = snapshot.tickSeq;
        sendFrame(ws, {
          type: "instance:joined",
          protocolVersion: PROTOCOL_VERSION,
          instanceId: target.instanceId,
          playerId: joined.player.id,
          map: target.map,
          snapshot,
          chat: target.getChatHistory()
        });
        await broadcastLobbyState();
        return;
      }
      if (msg.type === "instance:leave") {
        if (client.instanceId && client.playerId) {
          const current = instanceManager.getInstance(client.instanceId);
          current?.removePlayerImmediately(client.playerId);
          clientIndex.removeFromInstance(client);
        }
        clientIndex.addLobbySubscriber(client);
        sendFrame(ws, { type: "instance:left" });
        await broadcastLobbyState();
        return;
      }
      if (!client.instanceId || !client.playerId) {
        sendFrame(ws, {
          type: "action:rejected",
          code: "NOT_IN_INSTANCE",
          message: "Join an Overworld instance first."
        });
        return;
      }
      const instance = instanceManager.getInstance(client.instanceId);
      if (!instance) return;
      if (msg.type === "instance:resync") {
        const snapshot = instance.toSnapshot(false);
        client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
        client.lastSentSeq = snapshot.tickSeq;
        sendFrame(ws, {
          type: "instance:tick",
          snapshot,
          seq: snapshot.tickSeq
        });
        return;
      }
      if (msg.type === "player:input") {
        instance.setPlayerInput(client.playerId, msg.input, msg.seq);
        return;
      }
      if (msg.type === "player:attack_probe") {
        const feedback = instance.handleAttackProbe(
          client.playerId,
          msg.kind,
          msg.aimAngle
        );
        if (!feedback.ok) {
          sendFrame(ws, {
            type: "action:rejected",
            code: feedback.code ?? "ATTACK_REJECTED",
            message: feedback.message ?? "Attack blocked."
          });
        }
        return;
      }
      if (msg.type === "player:equip_armament") {
        const feedback = await instance.handleEquipArmament(
          client.playerId,
          msg.slot,
          msg.itemId,
          characterAdapter
        );
        if (!feedback.ok) {
          sendFrame(ws, {
            type: "action:rejected",
            code: feedback.code ?? "EQUIP_REJECTED",
            message: feedback.message ?? "Armament switch blocked."
          });
        }
        return;
      }
      if (msg.type === "chat:send") {
        const chatMsg = instance.addChatMessage(client.playerId, msg.text);
        if (chatMsg) {
          const payload = { type: "chat:message", message: chatMsg };
          clientIndex.broadcastCritical(instance.instanceId, payload);
        }
      }
    });
    ws.on("close", () => {
      connectedClients.delete(client);
      if (client.instanceId && client.playerId) {
        const inst = instanceManager.getInstance(client.instanceId);
        inst?.markDisconnected(client.playerId);
      }
      clientIndex.removeAll(client);
      void broadcastLobbyState();
    });
  });
  let running = true;
  let lastStepMs = Date.now();
  let tickTimer = null;
  const scheduleTick = () => {
    if (!running) return;
    const now = Date.now();
    const dtMs = Math.max(1, Math.min(100, now - lastStepMs));
    lastStepMs = now;
    instanceManager.stepAll(dtMs);
    for (const instance of instanceManager.listInstances()) {
      const clients = clientIndex.getInstanceClients(instance.instanceId);
      if (clients.size === 0) continue;
      const snapshot = instance.toSnapshot(true);
      const sendFullKeyframe = snapshot.tickSeq % KEYFRAME_INTERVAL_TICKS === 0;
      for (const client of clients) {
        if (!client.lastAckBaseline || sendFullKeyframe) {
          const sent2 = sendDroppableFrame(client.socket, {
            type: "instance:tick",
            snapshot,
            seq: snapshot.tickSeq
          });
          if (sent2) {
            client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
            client.lastSentSeq = snapshot.tickSeq;
          }
          continue;
        }
        const delta = computeSnapshotDelta(
          client.lastAckBaseline,
          snapshot,
          client.lastSentSeq,
          snapshot.tickSeq
        );
        const hasChanges = Boolean(delta.playersAdded?.length) || Boolean(delta.playersUpdated?.length) || Boolean(delta.playersRemoved?.length) || Boolean(delta.events?.length) || Boolean(delta.activities);
        if (!hasChanges) continue;
        const sent = sendDroppableFrame(client.socket, {
          type: "instance:delta",
          delta
        });
        if (sent) {
          client.lastAckBaseline = cloneSnapshotBaseline(snapshot);
          client.lastSentSeq = snapshot.tickSeq;
        }
      }
    }
    const elapsed = Date.now() - now;
    const delay = Math.max(4, SERVER_TICK_MS - elapsed);
    tickTimer = setTimeout(scheduleTick, delay);
  };
  tickTimer = setTimeout(scheduleTick, SERVER_TICK_MS);
  return {
    stop: async () => {
      running = false;
      if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
      for (const client of connectedClients) {
        client.socket.close(1001, "Server shutting down");
      }
      await new Promise((resolve) => {
        wss.close(() => resolve());
      });
    }
  };
}

// server/src/progression/progressionIntegration.ts
var ProgressionIntegrationLayer = class {
  constructor(characterAdapter) {
    this.characterAdapter = characterAdapter;
  }
  characterAdapter;
  async recordServerVerifiedArenaHonor(outcome) {
    if (outcome.sourceActivity !== "arena") {
      return { accepted: false, reason: "Arena Honor may only originate from verified Arena outcomes (DD-012)." };
    }
    const delta = Math.trunc(outcome.arenaHonorDelta ?? 0);
    if (delta <= 0) {
      return { accepted: false, reason: "Honor delta must be positive." };
    }
    const updated = await this.characterAdapter.addArenaHonor(outcome.accountId, delta);
    if (!updated) {
      return { accepted: false, reason: "Character identity unavailable." };
    }
    const inserted = await recordHonorEntry({
      characterId: outcome.characterId,
      deltaHonor: delta,
      balanceAfter: updated.arenaHonor,
      reason: "verified_arena_outcome",
      idempotencyKey: outcome.claimId
    });
    if (!inserted) {
      return { accepted: false, reason: "Duplicate reward claim rejected." };
    }
    await recordRewardClaim({
      claimId: outcome.claimId,
      characterId: outcome.characterId,
      sourceActivity: outcome.sourceActivity,
      rewardType: "arena_honor",
      rewardPayload: { deltaHonor: delta, ...outcome.metadata ?? {} }
    });
    return { accepted: true, newHonorBalance: updated.arenaHonor };
  }
  rejectClientAssertedReward() {
    return {
      accepted: false,
      reason: "Server-authoritative progression rejects client-reported rewards or EXP (DD-026)."
    };
  }
};

// server.ts
async function startServer() {
  await initDatabase();
  const characterAdapter = new DevCharacterAdapter();
  const progressionLayer = new ProgressionIntegrationLayer(characterAdapter);
  const authService = new AuthService(characterAdapter);
  const instanceManager = new WorldInstanceManager();
  const app = createOverworldHttpApp({
    authService,
    instanceManager,
    progressionLayer
  });
  const server = http.createServer(app);
  attachWsGateway({
    server,
    authService,
    characterAdapter,
    instanceManager
  });
  const distClientDir = path2.resolve(process.cwd(), "dist", "client");
  const isProd = process.env.NODE_ENV === "production" && fs2.existsSync(distClientDir);
  if (isProd) {
    app.use(express2.static(distClientDir));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(distClientDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  const port = Number(process.env.PORT ?? 3e3);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Server] Beyond: Overworld listening on http://0.0.0.0:${port}`);
  });
}
void startServer();
