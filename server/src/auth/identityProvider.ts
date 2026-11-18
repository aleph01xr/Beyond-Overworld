import {
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
 * identity provider and the future authoritative Beyond: Dungeons identity provider.
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
 */
export class LocalIdentityProvider implements IdentityProvider {
  readonly kind: IdentityProviderKind = 'local_dev';
  readonly isConfigured = true;
  readonly isOperational = true;

  private readonly accountsByLower = new Map<string, LocalAccountRecord>();

  constructor(options?: { seedDevAccount?: boolean }) {
    const shouldSeed =
      options?.seedDevAccount ?? process.env.NODE_ENV !== 'production';
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

const SignedDungeonsAssertionPayloadSchema = z.object({
  iss: z.literal('beyond-dungeons'),
  aud: z.literal('beyond-overworld'),
  exp: z.number().int().positive(),
  iat: z.number().int().nonnegative().optional(),
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

export type SignedDungeonsAssertionPayload = z.infer<
  typeof SignedDungeonsAssertionPayloadSchema
>;

/**
 * Helper used strictly in backend contract tests / future Dungeons token issuer
 * to produce HMAC-SHA256 signed identity assertions (`payloadB64Url.sigB64Url`).
 */
export function signDungeonsIdentityAssertion(
  payload: SignedDungeonsAssertionPayload,
  secret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * External Identity Provider Adapter for future Beyond: Dungeons integration.
 *
 * Rules enforced by design:
 * - Overworld does NOT independently verify Dungeons passwords.
 * - Overworld does NOT create duplicate permanent Dungeons accounts.
 * - Overworld does NOT pretend the remote Dungeons backend is operational yet.
 * - Cryptographically verifies HMAC-SHA256 signed assertions using BEYOND_IDENTITY_SECRET
 *   so unsigned or client-forged payloads are always rejected.
 */
export class DungeonsIdentityProvider implements IdentityProvider {
  readonly kind: IdentityProviderKind = 'dungeons';
  readonly isOperational = false;

  constructor(private readonly config: ResolvedIdentityConfig) {}

  get isConfigured(): boolean {
    return this.config.mode === 'configured';
  }

  getDungeonsApiUrl(): string | null {
    return this.config.dungeonsApiUrl;
  }

  async authenticateWithCredentials(
    _username: string,
    _password: string
  ): Promise<IdentityVerificationResult> {
    if (!this.config.dungeonsApiUrl || !this.config.identitySecret) {
      return {
        ok: false,
        provider: this.kind,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        error:
          'Beyond: Dungeons external identity provider is not configured (set DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET).',
      };
    }

    // Do NOT independently verify Dungeons passwords or fake remote authentication.
    return {
      ok: false,
      provider: this.kind,
      code: 'EXTERNAL_PROVIDER_NOT_OPERATIONAL',
      error:
        'Beyond: Dungeons external authentication is not yet operational; awaiting Dungeons backend availability.',
    };
  }

  async registerAccount(): Promise<IdentityVerificationResult> {
    if (!this.config.dungeonsApiUrl || !this.config.identitySecret) {
      return {
        ok: false,
        provider: this.kind,
        code: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        error:
          'Beyond: Dungeons external identity provider is not configured.',
      };
    }

    // Overworld must not create duplicate permanent accounts when Dungeons is authoritative.
    return {
      ok: false,
      provider: this.kind,
      code: 'EXTERNAL_ACCOUNT_OWNED_BY_DUNGEONS',
      error:
        'Permanent Beyond accounts must be created via Beyond: Dungeons once external integration is active.',
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

    const parts = assertionToken.trim().split('.');
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

    const nowSec = Math.floor(Date.now() / 1000);
    if (parsed.data.exp <= nowSec) {
      return {
        ok: false,
        provider: this.kind,
        code: 'ASSERTION_EXPIRED',
        error: 'Beyond identity assertion has expired.',
      };
    }

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
}
