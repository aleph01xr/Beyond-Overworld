import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import type { HeroClassId } from '../../../shared/constants/classes.ts';
import type {
  IdentityProviderKind,
  SharedAccountIdentity,
} from '../../../shared/types/domain.ts';
import { HeroClassSchema } from '../../../shared/validation/schemas.ts';
import type { ResolvedIdentityConfig } from './identityConfig.ts';

export interface IdentityVerificationResult {
  ok: boolean;
  provider: IdentityProviderKind;
  code?: string;
  error?: string;
  identity?: SharedAccountIdentity;
}

/**
 * Clean abstraction allowing Beyond: Overworld to support both the Local Development
 * identity provider and the authoritative Beyond: Dungeons identity provider.
 */
export interface IdentityProvider {
  readonly kind: IdentityProviderKind;
  readonly isConfigured: boolean;
  readonly isOperational: boolean;

  authenticateWithCredentials(
    username: string,
    password: string
  ): Promise<IdentityVerificationResult>;

  registerAccount(params: {
    username: string;
    password: string;
    preferredClass: HeroClassId;
  }): Promise<IdentityVerificationResult>;

  verifySignedAssertion(assertionToken: string): Promise<IdentityVerificationResult>;
}

interface LocalAccountRecord {
  accountId: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  isAdmin: boolean;
  preferredClass: HeroClassId;
  lockedClass: HeroClassId;
  level: number;
  xp: number;
  strength: number;
  vitality: number;
  dexterity: number;
  intelligence: number;
  faith: number;
  attributePoints: number;
  createdAt: number;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return timingSafeEqual(keyBuf, derivedBuf);
}

function toSharedAccountIdentity(record: LocalAccountRecord): SharedAccountIdentity {
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
    attributePoints: record.attributePoints,
  };
}

/**
 * Local development identity provider preserving Overworld's local auth system
 * and seed account behavior without auto-granting admin permissions by username.
 * Automatically disabled in production when authoritative Dungeons auth is enforced.
 */
export class LocalIdentityProvider implements IdentityProvider {
  readonly kind: IdentityProviderKind = 'local_dev';
  readonly isConfigured = true;
  readonly isOperational: boolean;

  private readonly accountsByLower = new Map<string, LocalAccountRecord>();

  constructor(options?: { seedDevAccount?: boolean; enabled?: boolean }) {
    this.isOperational = options?.enabled !== false;
    const shouldSeed =
      this.isOperational &&
      (options?.seedDevAccount ?? process.env.NODE_ENV !== 'production');
    if (shouldSeed) {
      this.seedAccountInternal({
        accountId: 'acc_dev_wanderer',
        username: 'wanderer',
        password: 'wanderer123',
        preferredClass: 'vanguard',
        isAdmin: false,
      });
    }
  }

  /**
   * Internal server-only seed helper (never reachable from client payloads).
   * Used for the dev seed account and isolated server-side admin verification tests.
   */
  seedAccountInternal(params: {
    accountId: string;
    username: string;
    password: string;
    preferredClass?: HeroClassId;
    isAdmin?: boolean;
  }): SharedAccountIdentity {
    const username = params.username.trim();
    const usernameLower = username.toLowerCase();
    const heroClass = params.preferredClass ?? 'vanguard';
    const record: LocalAccountRecord = {
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
      createdAt: Date.now(),
    };
    this.accountsByLower.set(usernameLower, record);
    return toSharedAccountIdentity(record);
  }

  async registerAccount(params: {
    username: string;
    password: string;
    preferredClass: HeroClassId;
  }): Promise<IdentityVerificationResult> {
    if (!this.isOperational) {
      return {
        ok: false,
        provider: this.kind,
        code: 'LOCAL_REGISTRATION_DISABLED',
        error: 'Local registration is disabled in production; use Beyond: Dungeons.',
      };
    }

    const username = params.username.trim();
    const usernameLower = username.toLowerCase();
    if (this.accountsByLower.has(usernameLower)) {
      return {
        ok: false,
        provider: this.kind,
        code: 'ACCOUNT_EXISTS',
        error: 'That account name is already claimed.',
      };
    }

    // Never grant admin privileges based on username (e.g., never hardcode Aleph) or client flags.
    const record: LocalAccountRecord = {
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
      createdAt: Date.now(),
    };
    this.accountsByLower.set(usernameLower, record);

    return {
      ok: true,
      provider: this.kind,
      identity: toSharedAccountIdentity(record),
    };
  }

  async authenticateWithCredentials(
    usernameRaw: string,
    password: string
  ): Promise<IdentityVerificationResult> {
    if (!this.isOperational) {
      return {
        ok: false,
        provider: this.kind,
        code: 'LOCAL_AUTH_DISABLED',
        error: 'Local authentication fallback is disabled in production.',
      };
    }

    const usernameLower = usernameRaw.trim().toLowerCase();
    const account = this.accountsByLower.get(usernameLower);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return {
        ok: false,
        provider: this.kind,
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid username or password.',
      };
    }
    return {
      ok: true,
      provider: this.kind,
      identity: toSharedAccountIdentity(account),
    };
  }

  async verifySignedAssertion(): Promise<IdentityVerificationResult> {
    return {
      ok: false,
      provider: this.kind,
      code: 'ASSERTION_NOT_SUPPORTED_LOCAL',
      error: 'Local development provider does not validate external signed assertions.',
    };
  }
}

export const SharedAccountIdentitySchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  username: z.string().trim().min(2).max(32),
  isAdmin: z.boolean(),
  preferredClass: HeroClassSchema,
  lockedClass: HeroClassSchema,
  level: z.number().int().min(1).max(50),
  xp: z.number().int().min(0),
  strength: z.number().int().min(0).max(100),
  vitality: z.number().int().min(0).max(100),
  dexterity: z.number().int().min(0).max(100),
  intelligence: z.number().int().min(0).max(100),
  faith: z.number().int().min(0).max(100),
  attributePoints: z.number().int().min(0),
});

const SignedDungeonsAssertionPayloadSchema = SharedAccountIdentitySchema.extend({
  iss: z.literal('beyond-dungeons'),
  aud: z.literal('beyond-overworld'),
  exp: z.number().int().positive(),
  iat: z.number().int().nonnegative().optional(),
  jti: z.string().trim().min(4).max(128).optional(),
});

export type SignedDungeonsAssertionPayload = z.infer<
  typeof SignedDungeonsAssertionPayloadSchema
>;

/**
 * Produces HMAC-SHA256 signed identity assertions (`payloadB64Url.sigB64Url`)
 * with an automatic unique `jti` replay nonce and `iat` timestamp when omitted.
 */
export function signDungeonsIdentityAssertion(
  payload: SignedDungeonsAssertionPayload,
  secret: string
): string {
  const enriched: SignedDungeonsAssertionPayload = {
    ...payload,
    jti: payload.jti ?? randomUUID(),
    iat: payload.iat ?? Math.floor(Date.now() / 1000),
  };
  const encodedPayload = Buffer.from(JSON.stringify(enriched), 'utf8').toString(
    'base64url'
  );
  const signature = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export interface DungeonsIdentityProviderOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const MAX_REPLAY_ENTRIES = 50_000;
const MAX_CLOCK_SKEW_MS = 60_000;

/**
 * Authoritative External Identity Provider Adapter for Beyond: Dungeons.
 *
 * Enforces:
 * - Overworld does NOT independently verify Dungeons passwords.
 * - Overworld does NOT create duplicate permanent Dungeons accounts.
 * - Server-to-server HTTP verification against DUNGEONS_API_URL authenticated with BEYOND_IDENTITY_SECRET.
 * - Cryptographic HMAC-SHA256 verification of signed identity assertions, expiry bounds,
 *   and single-use replay protection.
 */
export class DungeonsIdentityProvider implements IdentityProvider {
  readonly kind: IdentityProviderKind = 'dungeons';
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly consumedAssertions = new Map<string, number>();

  constructor(
    private readonly config: ResolvedIdentityConfig,
    options?: DungeonsIdentityProviderOptions
  ) {
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  get isConfigured(): boolean {
    return this.config.mode === 'configured';
  }

  get isOperational(): boolean {
    return this.isConfigured;
  }

  getDungeonsApiUrl(): string | null {
    return this.config.dungeonsApiUrl;
  }

  async authenticateWithCredentials(
    username: string,
    password: string
  ): Promise<IdentityVerificationResult> {
    if (!this.isConfigured || !this.config.dungeonsApiUrl || !this.config.identitySecret) {
      return {
        ok: false,
        provider: this.kind,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        error:
          'Beyond: Dungeons external identity provider is not configured (set DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET).',
      };
    }

    const endpoint = `${this.config.dungeonsApiUrl}/api/internal/identity/verify-credentials`;
    const body = JSON.stringify({ username: username.trim(), password });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.config.identitySecret}`,
          'X-Beyond-Identity-Secret': this.config.identitySecret,
          'X-Beyond-Service': 'beyond-overworld',
        },
        body,
        signal: controller.signal,
      });

      let payload: Record<string, unknown> | null = null;
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        payload = null;
      }

      if (response.status === 401) {
        return {
          ok: false,
          provider: this.kind,
          code: 'INVALID_CREDENTIALS',
          error:
            typeof payload?.error === 'string'
              ? payload.error
              : 'Invalid Beyond: Dungeons username or password.',
        };
      }

      if (!response.ok || !payload) {
        return {
          ok: false,
          provider: this.kind,
          code: 'DUNGEONS_AUTH_ERROR',
          error:
            typeof payload?.error === 'string'
              ? payload.error
              : `Beyond: Dungeons identity verification failed (${response.status}).`,
        };
      }

      // Authoritative path: Dungeons returns a cryptographically signed assertion token
      if (typeof payload.assertion === 'string') {
        return this.verifySignedAssertion(payload.assertion);
      }

      // Direct verified server-to-server identity payload fallback
      const rawIdentity = payload.identity ?? payload.account ?? payload.user;
      const parsedIdentity = SharedAccountIdentitySchema.safeParse(rawIdentity);
      if (!parsedIdentity.success) {
        return {
          ok: false,
          provider: this.kind,
          code: 'INVALID_DUNGEONS_RESPONSE',
          error: 'Beyond: Dungeons returned an invalid identity response.',
        };
      }

      return {
        ok: true,
        provider: this.kind,
        identity: parsedIdentity.data,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        ok: false,
        provider: this.kind,
        code: isTimeout ? 'DUNGEONS_TIMEOUT' : 'DUNGEONS_UNREACHABLE',
        error: isTimeout
          ? 'Beyond: Dungeons identity service timed out.'
          : 'Beyond: Dungeons identity service is currently unreachable.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchAccountSnapshot(accountId: string): Promise<IdentityVerificationResult> {
    if (!this.isConfigured || !this.config.dungeonsApiUrl || !this.config.identitySecret) {
      return {
        ok: false,
        provider: this.kind,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        error: 'Beyond: Dungeons external identity provider is not configured.',
      };
    }

    const endpoint = `${this.config.dungeonsApiUrl}/api/internal/identity/account/${encodeURIComponent(
      accountId.trim()
    )}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.config.identitySecret}`,
          'X-Beyond-Identity-Secret': this.config.identitySecret,
          'X-Beyond-Service': 'beyond-overworld',
        },
        signal: controller.signal,
      });

      let payload: Record<string, unknown> | null = null;
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || typeof payload.assertion !== 'string') {
        return {
          ok: false,
          provider: this.kind,
          code: response.status === 404 ? 'ACCOUNT_NOT_FOUND' : 'DUNGEONS_AUTH_ERROR',
          error:
            typeof payload?.error === 'string'
              ? payload.error
              : `Beyond: Dungeons account lookup failed (${response.status}).`,
        };
      }

      return this.verifySignedAssertion(payload.assertion);
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        ok: false,
        provider: this.kind,
        code: isTimeout ? 'DUNGEONS_TIMEOUT' : 'DUNGEONS_UNREACHABLE',
        error: isTimeout
          ? 'Beyond: Dungeons identity service timed out.'
          : 'Beyond: Dungeons identity service is currently unreachable.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async registerAccount(): Promise<IdentityVerificationResult> {
    if (!this.isConfigured) {
      return {
        ok: false,
        provider: this.kind,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        error: 'Beyond: Dungeons external identity provider is not configured.',
      };
    }

    // Overworld must not create duplicate permanent accounts when Dungeons is authoritative.
    return {
      ok: false,
      provider: this.kind,
      code: 'EXTERNAL_ACCOUNT_OWNED_BY_DUNGEONS',
      error:
        'Permanent Beyond accounts must be created in Beyond: Dungeons.',
    };
  }

  async verifySignedAssertion(assertionToken: string): Promise<IdentityVerificationResult> {
    const secret = this.config.identitySecret;
    if (!secret || this.config.mode !== 'configured') {
      return {
        ok: false,
        provider: this.kind,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        error:
          'Cannot verify Beyond: Dungeons identity assertion: DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET must be configured.',
      };
    }

    const normalizedToken = assertionToken.trim();
    const parts = normalizedToken.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        ok: false,
        provider: this.kind,
        code: 'INVALID_ASSERTION_SIGNATURE',
        error: 'Unsigned or malformed Beyond identity assertion.',
      };
    }

    const [encodedPayload, providedSig] = parts;
    const expectedSig = createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');

    const providedBuf = Buffer.from(providedSig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return {
        ok: false,
        provider: this.kind,
        code: 'INVALID_ASSERTION_SIGNATURE',
        error: 'Invalid Beyond identity assertion signature.',
      };
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      return {
        ok: false,
        provider: this.kind,
        code: 'INVALID_ASSERTION_PAYLOAD',
        error: 'Malformed Beyond identity assertion payload.',
      };
    }

    const parsed = SignedDungeonsAssertionPayloadSchema.safeParse(rawJson);
    if (!parsed.success) {
      return {
        ok: false,
        provider: this.kind,
        code: 'INVALID_ASSERTION_PAYLOAD',
        error: 'Identity assertion does not match SharedAccountIdentity schema.',
      };
    }

    const nowMs = Date.now();
    // Normalize exp/iat whether expressed in Unix seconds or milliseconds
    const expMs = parsed.data.exp < 1e12 ? parsed.data.exp * 1000 : parsed.data.exp;
    if (nowMs >= expMs) {
      return {
        ok: false,
        provider: this.kind,
        code: 'ASSERTION_EXPIRED',
        error: 'Beyond identity assertion has expired.',
      };
    }

    if (typeof parsed.data.iat === 'number') {
      const iatMs = parsed.data.iat < 1e12 ? parsed.data.iat * 1000 : parsed.data.iat;
      if (iatMs - nowMs > MAX_CLOCK_SKEW_MS) {
        return {
          ok: false,
          provider: this.kind,
          code: 'INVALID_ASSERTION_PAYLOAD',
          error: 'Beyond identity assertion issued-at timestamp is invalid.',
        };
      }
    }

    // Replay protection: consume unique jti (or full assertion SHA-256 digest) until expiry
    this.pruneExpiredReplays(nowMs);
    const replayKey = parsed.data.jti
      ? `jti:${parsed.data.jti}`
      : `tok:${createHash('sha256').update(normalizedToken).digest('hex')}`;

    const priorExpiry = this.consumedAssertions.get(replayKey);
    if (priorExpiry && priorExpiry > nowMs) {
      return {
        ok: false,
        provider: this.kind,
        code: 'ASSERTION_REPLAYED',
        error: 'Beyond identity assertion has already been redeemed.',
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
        attributePoints: parsed.data.attributePoints,
      },
    };
  }

  private pruneExpiredReplays(nowMs: number): void {
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
}
