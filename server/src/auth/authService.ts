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
  type ReplayConsumerFn,
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
  isProduction?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  consumeReplay?: ReplayConsumerFn;
}

export interface IdentityProviderStatusSummary {
  environment: 'production' | 'development';
  authoritativeProvider: IdentityProviderKind;
  activeLocalProvider: IdentityProviderKind;
  externalProviderConfigured: boolean;
  externalProviderOperational: boolean;
  devLoginEnabled: boolean;
  localRegistrationEnabled: boolean;
  registrationEnabled: boolean;
  externalConfig: PublicIdentityConfigStatus;
}

export interface PublicClientAuthConfig {
  environment: 'production' | 'development';
  authoritativeProvider: IdentityProviderKind;
  devLoginEnabled: boolean;
  localRegistrationEnabled: boolean;
  registrationEnabled: boolean;
  externalAssertionEnabled: boolean;
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
    this.identityConfig = resolveIdentityConfig(options?.env ?? process.env, {
      isProduction: options?.isProduction,
    });
    this.localProvider = new LocalIdentityProvider({
      enabled: !this.identityConfig.isProduction,
      seedDevAccount:
        !this.identityConfig.isProduction && (options?.seedDevAccount ?? true),
    });
    this.externalProvider = new DungeonsIdentityProvider(this.identityConfig, {
      fetchImpl: options?.fetchImpl,
      timeoutMs: options?.timeoutMs,
      consumeReplay: options?.consumeReplay,
    });

    console.log(`[Auth] ${this.identityConfig.diagnosticMessage}`);

    if (!this.identityConfig.isProduction && (options?.seedDevAccount ?? true)) {
      void this.ensureDevSeedCharacter();
    }
  }

  private async ensureDevSeedCharacter(): Promise<void> {
    const devLogin = await this.localProvider.authenticateWithCredentials(
      'wanderer',
      'wanderer123'
    );
    if (devLogin.ok && devLogin.identity) {
      await this.characterAdapter.syncAuthoritativeIdentity(
        devLogin.identity,
        'local_dev'
      );
    }
  }

  /**
   * Returns sanitized configuration state (never includes BEYOND_IDENTITY_SECRET or internal URLs).
   */
  getIdentityProviderStatus(): IdentityProviderStatusSummary {
    return {
      environment: this.identityConfig.isProduction ? 'production' : 'development',
      authoritativeProvider: this.identityConfig.isProduction
        ? 'dungeons'
        : this.externalProvider.isConfigured
          ? 'dungeons'
          : 'local_dev',
      activeLocalProvider: this.localProvider.kind,
      externalProviderConfigured: this.externalProvider.isConfigured,
      externalProviderOperational: this.externalProvider.isOperational,
      devLoginEnabled: this.identityConfig.devLoginEnabled,
      localRegistrationEnabled: this.identityConfig.localRegistrationEnabled,
      registrationEnabled: this.identityConfig.registrationEnabled,
      externalConfig: toPublicIdentityConfigStatus(this.identityConfig),
    };
  }

  /**
   * Safe public capability flags exposed to the browser AuthScreen via GET /api/auth/config.
   */
  getPublicClientAuthConfig(): PublicClientAuthConfig {
    return {
      environment: this.identityConfig.isProduction ? 'production' : 'development',
      authoritativeProvider: this.identityConfig.isProduction
        ? 'dungeons'
        : this.externalProvider.isConfigured
          ? 'dungeons'
          : 'local_dev',
      devLoginEnabled: this.identityConfig.devLoginEnabled,
      localRegistrationEnabled: this.identityConfig.localRegistrationEnabled,
      registrationEnabled: this.identityConfig.registrationEnabled,
      externalAssertionEnabled: this.externalProvider.isConfigured,
    };
  }

  getExternalProvider(): DungeonsIdentityProvider {
    return this.externalProvider;
  }

  /**
   * Server-side seed helper for dev/test verification of server-authoritative admin privileges.
   */
  async seedLocalAccountForTest(params: {
    accountId: string;
    username: string;
    password: string;
    preferredClass?: HeroClassId;
    isAdmin?: boolean;
  }): Promise<CharacterIdentity> {
    if (this.identityConfig.isProduction) {
      throw new Error('Cannot seed local accounts in production mode.');
    }
    const identity = this.localProvider.seedAccountInternal(params);
    return this.characterAdapter.syncAuthoritativeIdentity(identity, 'local_dev');
  }

  async register(
    usernameRaw: string,
    password: string,
    heroClass: HeroClassId
  ): Promise<AuthResult> {
    // In production, delegate account creation strictly to Beyond: Dungeons with zero local fallback.
    if (this.identityConfig.isProduction) {
      const externalResult = await this.externalProvider.registerAccount({
        username: usernameRaw,
        password,
        preferredClass: heroClass,
      });
      if (!externalResult.ok || !externalResult.identity) {
        return {
          ok: false,
          provider: 'dungeons',
          code: externalResult.code ?? 'DUNGEONS_REGISTRATION_FAILED',
          error:
            externalResult.error ??
            'Failed to create account in Beyond: Dungeons.',
        };
      }
      return this.createAuthorizedSessionResult(
        externalResult.identity,
        'dungeons'
      );
    }

    // In development, if Dungeons external provider is configured, register with Dungeons first
    // and only fall back to local dev registration when Dungeons is unreachable/timed out.
    if (this.externalProvider.isConfigured) {
      const externalResult = await this.externalProvider.registerAccount({
        username: usernameRaw,
        password,
        preferredClass: heroClass,
      });
      if (externalResult.ok && externalResult.identity) {
        return this.createAuthorizedSessionResult(
          externalResult.identity,
          'dungeons'
        );
      }
      if (
        externalResult.code !== 'DUNGEONS_UNREACHABLE' &&
        externalResult.code !== 'DUNGEONS_TIMEOUT'
      ) {
        return {
          ok: false,
          provider: 'dungeons',
          code: externalResult.code ?? 'DUNGEONS_REGISTRATION_FAILED',
          error: externalResult.error ?? 'Account registration failed.',
        };
      }
    }

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
    // In production, Beyond: Dungeons is strictly the sole identity provider with zero local fallback.
    if (this.identityConfig.isProduction) {
      const externalResult = await this.externalProvider.authenticateWithCredentials(
        usernameRaw,
        password
      );
      if (!externalResult.ok || !externalResult.identity) {
        return {
          ok: false,
          provider: 'dungeons',
          code: externalResult.code ?? 'EXTERNAL_AUTH_FAILED',
          error: externalResult.error ?? 'Invalid Beyond: Dungeons credentials.',
        };
      }
      return this.createAuthorizedSessionResult(
        externalResult.identity,
        'dungeons'
      );
    }

    // In development, if Dungeons external provider is configured, attempt Dungeons first
    // and only fall back to local dev accounts if Dungeons is unreachable or credentialed locally.
    if (this.externalProvider.isConfigured) {
      const externalResult = await this.externalProvider.authenticateWithCredentials(
        usernameRaw,
        password
      );
      if (externalResult.ok && externalResult.identity) {
        return this.createAuthorizedSessionResult(
          externalResult.identity,
          'dungeons'
        );
      }
      const localFallback = await this.localProvider.authenticateWithCredentials(
        usernameRaw,
        password
      );
      if (localFallback.ok && localFallback.identity) {
        return this.createAuthorizedSessionResult(
          localFallback.identity,
          'local_dev'
        );
      }
      return {
        ok: false,
        provider: 'dungeons',
        code: externalResult.code ?? 'INVALID_CREDENTIALS',
        error: externalResult.error ?? 'Invalid username or password.',
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
        error: verification.error ?? 'Invalid username or password.',
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

    // Administrator privileges come exclusively from the authoritative session identity
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
    const character = await this.characterAdapter.syncAuthoritativeIdentity(
      identity,
      provider
    );

    // Ensure admin status comes exclusively from authoritative Dungeons / server provider record
    const authoritativeIsAdmin = identity.isAdmin === true;
    character.isAdmin = authoritativeIsAdmin;

    const token = this.issueSession({
      accountId: identity.accountId,
      username: identity.username,
      isAdmin: authoritativeIsAdmin,
      provider,
    });

    return {
      ok: true,
      token,
      character,
      isAdmin: authoritativeIsAdmin,
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
