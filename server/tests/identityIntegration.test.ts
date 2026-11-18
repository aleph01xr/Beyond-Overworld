import { describe, expect, it } from 'vitest';
import {
  assertServerAdmin,
  isServerAdmin,
  requireAdminSession,
} from '../src/auth/adminAuthorization.ts';
import { AuthService } from '../src/auth/authService.ts';
import {
  resolveIdentityConfig,
  toPublicIdentityConfigStatus,
} from '../src/auth/identityConfig.ts';
import { signDungeonsIdentityAssertion } from '../src/auth/identityProvider.ts';
import { DevCharacterAdapter } from '../src/characters/characterIntegrationAdapter.ts';
import { AuthRegisterSchema } from '../../shared/validation/schemas.ts';

describe('Shared Identity Integration Preparation (Phase 1)', () => {
  it('supports local login, registration, session validation, and dev seed account without breaking existing flows', async () => {
    const adapter = new DevCharacterAdapter();
    const auth = new AuthService(adapter, { env: {}, seedDevAccount: true });

    // 4. Development seed account still works
    const devLogin = await auth.login('wanderer', 'wanderer123');
    expect(devLogin.ok).toBe(true);
    expect(devLogin.token).toBeTruthy();
    expect(devLogin.provider).toBe('local_dev');
    expect(devLogin.isAdmin).toBe(false);
    expect(devLogin.character?.accountId).toBe('acc_dev_wanderer');
    expect(devLogin.character?.lockedClass).toBe('vanguard');

    // 2. Existing local registration still works
    const reg = await auth.register('Kestrel', 'secretPass99', 'ranger');
    expect(reg.ok).toBe(true);
    expect(reg.token).toBeTruthy();
    expect(reg.character?.username).toBe('Kestrel');
    expect(reg.character?.heroClass).toBe('ranger');
    expect(reg.character?.preferredClass).toBe('ranger');
    expect(reg.character?.lockedClass).toBe('ranger');
    expect(reg.isAdmin).toBe(false);

    // 1. Existing local login still works
    const login = await auth.login('kestrel', 'secretPass99');
    expect(login.ok).toBe(true);
    expect(login.character?.accountId).toBe(reg.character?.accountId);

    // 3. Existing sessions still validate & logout invalidates
    const validated = auth.validateSessionToken(login.token!);
    expect(validated?.accountId).toBe(reg.character?.accountId);
    expect(validated?.isAdmin).toBe(false);

    const sessionChar = await auth.getSessionCharacter(login.token!);
    expect(sessionChar?.character.username).toBe('Kestrel');

    auth.logout(login.token!);
    expect(auth.validateSessionToken(login.token!)).toBeNull();
  });

  it('never grants admin by username (including Aleph) and blocks client-forged admin claims', async () => {
    const adapter = new DevCharacterAdapter();
    const auth = new AuthService(adapter, { env: {}, seedDevAccount: false });

    // Registering username "Aleph" must NEVER auto-grant admin
    const alephReg = await auth.register('Aleph', 'alephPass123', 'arcanist');
    expect(alephReg.ok).toBe(true);
    expect(alephReg.isAdmin).toBe(false);
    expect(alephReg.character?.isAdmin).toBe(false);
    expect(isServerAdmin(auth.validateSessionToken(alephReg.token!))).toBe(false);
    expect(assertServerAdmin(auth.validateSessionToken(alephReg.token!)).ok).toBe(false);

    // Client-supplied isAdmin / accountId fields are stripped by AuthRegisterSchema
    const parsedClientAttempt = AuthRegisterSchema.safeParse({
      username: 'Spoofer',
      password: 'password123',
      heroClass: 'cleric',
      isAdmin: true,
      accountId: 'usr_forged_admin',
    });
    expect(parsedClientAttempt.success).toBe(true);
    expect((parsedClientAttempt.data as Record<string, unknown>).isAdmin).toBeUndefined();
    expect((parsedClientAttempt.data as Record<string, unknown>).accountId).toBeUndefined();

    // Server-side admin check rejects regular user and permits authoritative server admin
    await auth.seedLocalAccountForTest({
      accountId: 'acc_server_admin',
      username: 'Overlord',
      password: 'adminPassword123',
      preferredClass: 'vanguard',
      isAdmin: true,
    });
    const adminLogin = await auth.login('Overlord', 'adminPassword123');
    expect(adminLogin.ok).toBe(true);
    expect(adminLogin.isAdmin).toBe(true);

    const guard = requireAdminSession(auth);
    let nextCalled = false;
    let deniedStatus = 0;
    guard(
      { headers: { authorization: `Bearer ${alephReg.token}` } } as never,
      {
        status: (code: number) => {
          deniedStatus = code;
          return { json: () => {} };
        },
      } as never,
      () => {
        nextCalled = true;
      }
    );
    expect(deniedStatus).toBe(403);
    expect(nextCalled).toBe(false);

    const adminReq = { headers: { authorization: `Bearer ${adminLogin.token}` } } as {
      headers: { authorization: string };
      adminSession?: { accountId: string; isAdmin: boolean };
    };
    guard(
      adminReq as never,
      { status: () => ({ json: () => {} }) } as never,
      () => {
        nextCalled = true;
      }
    );
    expect(nextCalled).toBe(true);
    expect(adminReq.adminSession?.isAdmin).toBe(true);
    expect(adminReq.adminSession?.accountId).toBe('acc_server_admin');
  });

  it('produces safe, understandable behavior when external Dungeons config is missing or partial', async () => {
    const unconfigured = resolveIdentityConfig({});
    expect(unconfigured.mode).toBe('unconfigured');
    expect(unconfigured.localFallbackActive).toBe(true);
    expect(unconfigured.diagnosticMessage).toContain('not configured');

    const partial = resolveIdentityConfig({
      DUNGEONS_API_URL: 'https://dungeons.example.com',
    });
    expect(partial.mode).toBe('partial_or_invalid');
    expect(partial.localFallbackActive).toBe(true);
    expect(partial.diagnosticMessage).toContain('BEYOND_IDENTITY_SECRET is missing');

    const invalidUrl = resolveIdentityConfig({
      DUNGEONS_API_URL: 'ftp://invalid.example.com',
      BEYOND_IDENTITY_SECRET: 'short',
    });
    expect(invalidUrl.mode).toBe('partial_or_invalid');
    expect(invalidUrl.diagnosticMessage).toContain('http:// or https://');

    const adapter = new DevCharacterAdapter();
    const auth = new AuthService(adapter, { env: {}, seedDevAccount: true });
    const extRes = await auth.authenticateExternalAssertion('unsigned.payload');
    expect(extRes.ok).toBe(false);
    expect(extRes.code).toBe('EXTERNAL_PROVIDER_NOT_CONFIGURED');

    const extCreds = await auth
      .getExternalProvider()
      .authenticateWithCredentials('someone', 'password123');
    expect(extCreds.ok).toBe(false);
    expect(extCreds.code).toBe('EXTERNAL_PROVIDER_NOT_CONFIGURED');
  });

  it('supports configuring external Dungeons provider without breaking local dev, never exposes secret, and rejects unsigned/forged assertions', async () => {
    const secret = 'beyond_shared_test_secret_min_32_chars!';
    const env = {
      DUNGEONS_API_URL: 'https://dungeons-api.internal.example/',
      BEYOND_IDENTITY_SECRET: secret,
    };

    const resolved = resolveIdentityConfig(env);
    expect(resolved.mode).toBe('configured');
    expect(resolved.dungeonsApiUrl).toBe('https://dungeons-api.internal.example');
    const publicStatus = toPublicIdentityConfigStatus(resolved);
    expect(JSON.stringify(publicStatus)).not.toContain(secret);

    const adapter = new DevCharacterAdapter();
    const auth = new AuthService(adapter, { env, seedDevAccount: true });

    const status = auth.getIdentityProviderStatus();
    expect(status.externalProviderConfigured).toBe(true);
    expect(status.externalProviderOperational).toBe(false);
    expect(JSON.stringify(status)).not.toContain(secret);

    // Local development authentication continues to work normally
    const devLogin = await auth.login('wanderer', 'wanderer123');
    expect(devLogin.ok).toBe(true);

    // External provider honestly reports it is not operational for password auth & does not create duplicate accounts
    const remoteCredCheck = await auth
      .getExternalProvider()
      .authenticateWithCredentials('hero', 'pass123456');
    expect(remoteCredCheck.ok).toBe(false);
    expect(remoteCredCheck.code).toBe('EXTERNAL_PROVIDER_NOT_OPERATIONAL');

    const remoteRegCheck = await auth.getExternalProvider().registerAccount();
    expect(remoteRegCheck.ok).toBe(false);
    expect(remoteRegCheck.code).toBe('EXTERNAL_ACCOUNT_OWNED_BY_DUNGEONS');

    // Unsigned or tampered assertion payloads must be rejected
    const unsignedPayload = Buffer.from(
      JSON.stringify({
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        accountId: 'usr_999',
        username: 'ForgedAdmin',
        isAdmin: true,
        preferredClass: 'vanguard',
        lockedClass: 'vanguard',
        level: 50,
        xp: 99999,
        strength: 25,
        vitality: 25,
        dexterity: 10,
        intelligence: 5,
        faith: 5,
        attributePoints: 0,
      }),
      'utf8'
    ).toString('base64url');

    const unsignedRes = await auth.authenticateExternalAssertion(unsignedPayload);
    expect(unsignedRes.ok).toBe(false);
    expect(unsignedRes.code).toBe('INVALID_ASSERTION_SIGNATURE');

    const wrongSigRes = await auth.authenticateExternalAssertion(
      `${unsignedPayload}.forged_signature`
    );
    expect(wrongSigRes.ok).toBe(false);
    expect(wrongSigRes.code).toBe('INVALID_ASSERTION_SIGNATURE');

    // Valid server-signed assertion issues local Overworld session bound to Dungeons accountId & isAdmin
    const validAssertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        accountId: 'usr_dungeons_42',
        username: 'DungeonChampion',
        isAdmin: true,
        preferredClass: 'cleric',
        lockedClass: 'cleric',
        level: 14,
        xp: 4820,
        strength: 4,
        vitality: 12,
        dexterity: 6,
        intelligence: 8,
        faith: 21,
        attributePoints: 3,
      },
      secret
    );

    const extAuth = await auth.authenticateExternalAssertion(validAssertion);
    expect(extAuth.ok).toBe(true);
    expect(extAuth.provider).toBe('dungeons');
    expect(extAuth.isAdmin).toBe(true);
    expect(extAuth.character?.accountId).toBe('usr_dungeons_42');
    expect(extAuth.character?.level).toBe(14);
    expect(extAuth.character?.xp).toBe(4820);
    expect(extAuth.character?.attributes.faith).toBe(21);
    expect(extAuth.character?.attributePoints).toBe(3);
    expect(extAuth.character?.lockedClass).toBe('cleric');

    const extSession = auth.validateSessionToken(extAuth.token!);
    expect(extSession?.accountId).toBe('usr_dungeons_42');
    expect(extSession?.isAdmin).toBe(true);
    expect(extSession?.provider).toBe('dungeons');

    // Character adapter retains Overworld Honor across subsequent authoritative Dungeons identity re-syncs
    await adapter.addArenaHonor('usr_dungeons_42', 75);
    await adapter.syncAuthoritativeIdentity({
      accountId: 'usr_dungeons_42',
      username: 'DungeonChampion',
      isAdmin: true,
      preferredClass: 'cleric',
      lockedClass: 'cleric',
      level: 15,
      xp: 5400,
      strength: 4,
      vitality: 12,
      dexterity: 6,
      intelligence: 8,
      faith: 24,
      attributePoints: 3,
    });
    const resynced = await adapter.getCharacterByAccountId('usr_dungeons_42');
    expect(resynced?.level).toBe(15);
    expect(resynced?.arenaHonor).toBe(75);
  });
});
