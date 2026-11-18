import { randomBytes } from 'node:crypto';
import type { HeroClassId } from '../../../shared/constants/classes.ts';
import type {
  CharacterIdentity,
  IdentityProviderKind,
  SharedAccountIdentity,
} from '../../../shared/types/domain.ts';
import type { CharacterIntegrationLayer } from '../characters/characterIntegrationAdapter.ts';
import {
  resolveIdentityConfig,
  toPublicIdentityConfigStatus,
  type PublicIdentityConfigStatus,
  type ResolvedIdentityConfig,
} from './identityConfig.ts';
import {
  DungeonsIdentityProvider,
  LocalIdentityProvider,
} from './identityProvider.ts';

export interface AuthSession {
  token: string;
  accountId: string;
  username: string;
  isAdmin: boolean;
  provider: IdentityProviderKind;
  expiresAt: number;
}

export interface AuthResult {
  ok: boolean;
  token?: string;
  character?: CharacterIdentity;
  isAdmin?: boolean;
  provider?: IdentityProviderKind;
  code?: string;
  error?: string;
}

export interface AuthServiceOptions {
  env?: Record<string, string | undefined>;
  seedDevAccount?: boolean;
}

export interface IdentityProviderStatusSummary {
  activeLocalProvider: IdentityProviderKind;
  externalProviderConfigured: boolean;
  externalProviderOperational: boolean;
  externalConfig: PublicIdentityConfigStatus;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export class AuthService {
  private readonly sessionsByToken = new Map<string, AuthSession>();
  private readonly identityConfig: ResolvedIdentityConfig;
  private readonly localProvider: LocalIdentityProvider;
  private readonly externalProvider: DungeonsIdentityProvider;

  constructor(
    private readonly characterAdapter: CharacterIntegrationLayer,
    options?: AuthServiceOptions
  ) {
    this.identityConfig = resolveIdentityConfig(options?.env ?? process.env);
    this.localProvider = new LocalIdentityProvider({
      seedDevAccount: options?.seedDevAccount,
    });
    this.externalProvider = new DungeonsIdentityProvider(this.identityConfig);

    console.log(`[Auth] ${this.identityConfig.diagnosticMessage}`);

    // Ensure the seeded local dev character exists when enabled
    if (options?.seedDevAccount ?? process.env.NODE_ENV !== 'production') {
      void this.ensureDevSeedCharacter();
    }
  }

  private async ensureDevSeedCharacter(): Promise<void> {
    const devLogin = await this.localProvider.authenticateWithCredentials(
      'wanderer',
      'wanderer123'
    );
    if (devLogin.ok && devLogin.identity) {
      await this.characterAdapter.syncAuthoritativeIdentity(devLogin.identity);
    }
  }

  /**
   * Returns sanitized configuration state (never includes BEYOND_IDENTITY_SECRET).
   */
  getIdentityProviderStatus(): IdentityProviderStatusSummary {
    return {
      activeLocalProvider: this.localProvider.kind,
      externalProviderConfigured: this.externalProvider.isConfigured,
      externalProviderOperational: this.externalProvider.isOperational,
      externalConfig: toPublicIdentityConfigStatus(this.identityConfig),
    };
  }

  getExternalProvider(): DungeonsIdentityProvider {
    return this.externalProvider;
  }

  /**
   * Server-side seed helper for tests verifying server-authoritative admin privileges
   * without trusting usernames or client-submitted flags.
   */
  async seedLocalAccountForTest(params: {
    accountId: string;
    username: string;
    password: string;
    preferredClass?: HeroClassId;
    isAdmin?: boolean;
  }): Promise<CharacterIdentity> {
    const identity = this.localProvider.seedAccountInternal(params);
    return this.characterAdapter.syncAuthoritativeIdentity(identity);
  }

  async register(
    usernameRaw: string,
    password: string,
    heroClass: HeroClassId
  ): Promise<AuthResult> {
    const verification = await this.localProvider.registerAccount({
      username: usernameRaw,
      password,
      preferredClass: heroClass,
    });

    if (!verification.ok || !verification.identity) {
      return {
        ok: false,
        provider: verification.provider,
        code: verification.code,
        error: verification.error ?? 'Registration failed.',
      };
    }

    return this.createAuthorizedSessionResult(
      verification.identity,
      verification.provider
    );
  }

  async login(usernameRaw: string, password: string): Promise<AuthResult> {
    const verification = await this.localProvider.authenticateWithCredentials(
      usernameRaw,
      password
    );

    if (!verification.ok || !verification.identity) {
      return {
        ok: false,
        provider: verification.provider,
        code: verification.code,
        error: verification.error ?? 'Invalid username or password.',
      };
    }

    return this.createAuthorizedSessionResult(
      verification.identity,
      verification.provider
    );
  }

  /**
   * Entry point prepared for future Beyond: Dungeons signed identity assertions.
   * Overworld validates cryptographic signature + payload server-side via BEYOND_IDENTITY_SECRET,
   * syncs character state keyed by Dungeons' authoritative accountId, and issues its own session.
   */
  async authenticateExternalAssertion(assertionToken: string): Promise<AuthResult> {
    const verification = await this.externalProvider.verifySignedAssertion(
      assertionToken
    );

    if (!verification.ok || !verification.identity) {
      return {
        ok: false,
        provider: verification.provider,
        code: verification.code,
        error: verification.error ?? 'External identity verification failed.',
      };
    }

    return this.createAuthorizedSessionResult(
      verification.identity,
      verification.provider
    );
  }

  async getSessionCharacter(token: string): Promise<{
    session: AuthSession;
    character: CharacterIdentity;
  } | null> {
    const session = this.validateSessionToken(token);
    if (!session) return null;
    const character = await this.characterAdapter.getCharacterByAccountId(
      session.accountId
    );
    if (!character) return null;

    // Ensure returned character never diverges from session's authoritative isAdmin flag
    character.isAdmin = session.isAdmin;
    return { session, character };
  }

  validateSessionToken(token: string): AuthSession | null {
    if (!token) return null;
    const session = this.sessionsByToken.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessionsByToken.delete(token);
      return null;
    }
    return session;
  }

  logout(token: string): void {
    this.sessionsByToken.delete(token);
  }

  private async createAuthorizedSessionResult(
    identity: SharedAccountIdentity,
    provider: IdentityProviderKind
  ): Promise<AuthResult> {
    const character = await this.characterAdapter.syncAuthoritativeIdentity(identity);
    character.isAdmin = identity.isAdmin === true;

    const token = this.issueSession({
      accountId: identity.accountId,
      username: identity.username,
      isAdmin: identity.isAdmin === true,
      provider,
    });

    return {
      ok: true,
      token,
      character,
      isAdmin: identity.isAdmin === true,
      provider,
    };
  }

  private issueSession(params: {
    accountId: string;
    username: string;
    isAdmin: boolean;
    provider: IdentityProviderKind;
  }): string {
    const token = randomBytes(32).toString('hex');
    this.sessionsByToken.set(token, {
      token,
      accountId: params.accountId,
      username: params.username,
      isAdmin: params.isAdmin,
      provider: params.provider,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  }
}
