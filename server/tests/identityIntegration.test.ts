import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { createOverworldHttpApp } from '../src/httpApp.ts';
import { WorldInstanceManager } from '../src/instances/worldInstanceManager.ts';
import {
  closeDatabase,
  initDatabase,
  resetMemoryStoresForTest,
} from '../src/persistence/database.ts';
import { ProgressionIntegrationLayer } from '../src/progression/progressionIntegration.ts';
import { getDefaultWeaponId } from '../../shared/constants/classes.ts';
import { AuthRegisterSchema } from '../../shared/validation/schemas.ts';

async function startHttpServer(
  handler: http.RequestListener
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

describe('Shared Account Identity Integration', () => {
  const activeClosers: Array<() => Promise<void>> = [];

  beforeEach(() => {
    resetMemoryStoresForTest();
  });

  afterEach(async () => {
    while (activeClosers.length > 0) {
      const close = activeClosers.pop()!;
      await close();
    }
    resetMemoryStoresForTest();
  });

  it('preserves local dev login, registration, session validation, and dev seed when unconfigured in dev', async () => {
    const adapter = new DevCharacterAdapter();
    const auth = new AuthService(adapter, {
      env: {},
      seedDevAccount: true,
      isProduction: false,
    });

    const devLogin = await auth.login('wanderer', 'wanderer123');
    expect(devLogin.ok).toBe(true);
    expect(devLogin.token).toBeTruthy();
    expect(devLogin.provider).toBe('local_dev');
    expect(devLogin.isAdmin).toBe(false);
    expect(devLogin.character?.accountId).toBe('acc_dev_wanderer');
    expect(devLogin.character?.lockedClass).toBe('vanguard');

    const reg = await auth.register('Kestrel', 'secretPass99', 'ranger');
    expect(reg.ok).toBe(true);
    expect(reg.token).toBeTruthy();
    expect(reg.character?.username).toBe('Kestrel');
    expect(reg.character?.heroClass).toBe('ranger');
    expect(reg.character?.lockedClass).toBe('ranger');
    expect(reg.isAdmin).toBe(false);

    const login = await auth.login('kestrel', 'secretPass99');
    expect(login.ok).toBe(true);
    expect(login.character?.accountId).toBe(reg.character?.accountId);

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
    const auth = new AuthService(adapter, {
      env: {},
      seedDevAccount: false,
      isProduction: false,
    });

    const alephReg = await auth.register('Aleph', 'alephPass123', 'arcanist');
    expect(alephReg.ok).toBe(true);
    expect(alephReg.isAdmin).toBe(false);
    expect(alephReg.character?.isAdmin).toBe(false);
    expect(isServerAdmin(auth.validateSessionToken(alephReg.token!))).toBe(false);
    expect(assertServerAdmin(auth.validateSessionToken(alephReg.token!)).ok).toBe(false);

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

  it('produces safe behavior when external Dungeons config is missing or partial', async () => {
    const unconfigured = resolveIdentityConfig({}, { isProduction: false });
    expect(unconfigured.mode).toBe('unconfigured');
    expect(unconfigured.localFallbackActive).toBe(true);
    expect(unconfigured.diagnosticMessage).toContain('not configured');

    const partial = resolveIdentityConfig(
      { DUNGEONS_API_URL: 'https://dungeons.example.com' },
      { isProduction: false }
    );
    expect(partial.mode).toBe('partial_or_invalid');
    expect(partial.localFallbackActive).toBe(true);
    expect(partial.diagnosticMessage).toContain('BEYOND_IDENTITY_SECRET is missing');

    const invalidUrl = resolveIdentityConfig(
      {
        DUNGEONS_API_URL: 'ftp://invalid.example.com',
        BEYOND_IDENTITY_SECRET: 'short',
      },
      { isProduction: false }
    );
    expect(invalidUrl.mode).toBe('partial_or_invalid');
    expect(invalidUrl.diagnosticMessage).toContain('http:// or https://');

    const adapter = new DevCharacterAdapter();
    const auth = new AuthService(adapter, {
      env: {},
      seedDevAccount: true,
      isProduction: false,
    });
    const extRes = await auth.authenticateExternalAssertion('unsigned.payload');
    expect(extRes.ok).toBe(false);
    expect(extRes.code).toBe('EXTERNAL_PROVIDER_NOT_CONFIGURED');

    const extCreds = await auth
      .getExternalProvider()
      .authenticateWithCredentials('someone', 'password123');
    expect(extCreds.ok).toBe(false);
    expect(extCreds.code).toBe('EXTERNAL_PROVIDER_NOT_CONFIGURED');
  });

  it('activates DungeonsIdentityProvider HTTP integration, validates signatures/expiry/replay, and never exposes secrets', async () => {
    const secret = 'beyond_shared_test_secret_min_32_chars!';
    let lastAuthHeader = '';
    let lastSecretHeader = '';
    let lastServiceHeader = '';

    const mockDungeons = await startHttpServer(async (req, res) => {
      if (
        req.method === 'POST' &&
        req.url === '/api/internal/identity/verify-credentials'
      ) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const rawBody = Buffer.concat(chunks).toString('utf8');

        lastAuthHeader = String(req.headers.authorization ?? '');
        lastSecretHeader = String(req.headers['x-beyond-identity-secret'] ?? '');
        lastServiceHeader = String(req.headers['x-beyond-service'] ?? '');

        if (
          lastAuthHeader !== `Bearer ${secret}` ||
          lastSecretHeader !== secret
        ) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Forbidden: Invalid shared identity secret.' })
          );
          return;
        }

        const body = JSON.parse(rawBody) as { username: string; password: string };
        if (body.username === 'Champion' && body.password === 'dungeonsSecret99') {
          const assertion = signDungeonsIdentityAssertion(
            {
              iss: 'beyond-dungeons',
              aud: 'beyond-overworld',
              exp: Math.floor(Date.now() / 1000) + 300,
              accountId: 'usr_dungeons_101',
              username: 'Champion',
              isAdmin: false,
              preferredClass: 'ranger',
              lockedClass: 'ranger',
              level: 18,
              xp: 7200,
              strength: 9,
              vitality: 10,
              dexterity: 22,
              intelligence: 4,
              faith: 5,
              attributePoints: 2,
            },
            secret
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ assertion }));
          return;
        }

        if (body.username === 'DirectAdmin' && body.password === 'adminPass999') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              identity: {
                accountId: 'usr_dungeons_admin_1',
                username: 'DirectAdmin',
                isAdmin: true,
                preferredClass: 'arcanist',
                lockedClass: 'arcanist',
                level: 30,
                xp: 25000,
                strength: 4,
                vitality: 12,
                dexterity: 8,
                intelligence: 28,
                faith: 6,
                attributePoints: 1,
              },
            })
          );
          return;
        }

        if (body.username === 'BrokenBackend') {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upstream database offline' }));
          return;
        }

        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid credentials in Beyond: Dungeons.' }));
        return;
      }

      if (
        req.method === 'GET' &&
        req.url === '/api/internal/identity/account/usr_dungeons_101'
      ) {
        if (req.headers['x-beyond-identity-secret'] !== secret) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
        const assertion = signDungeonsIdentityAssertion(
          {
            iss: 'beyond-dungeons',
            aud: 'beyond-overworld',
            exp: Math.floor(Date.now() / 1000) + 60,
            accountId: 'usr_dungeons_101',
            username: 'Champion',
            isAdmin: false,
            preferredClass: 'ranger',
            lockedClass: 'ranger',
            level: 20,
            xp: 9100,
            strength: 9,
            vitality: 11,
            dexterity: 25,
            intelligence: 4,
            faith: 5,
            attributePoints: 0,
          },
          secret
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ assertion }));
        return;
      }

      if (
        req.method === 'POST' &&
        req.url === '/api/internal/identity/register'
      ) {
        if (
          req.headers.authorization !== `Bearer ${secret}` ||
          req.headers['x-beyond-identity-secret'] !== secret
        ) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          username: string;
          password: string;
          preferredClass?: string;
        };
        if (body.username.toLowerCase() === 'champion') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'That adventurer name is already claimed.' })
          );
          return;
        }
        const chosenClass =
          body.preferredClass === 'ranger' ||
          body.preferredClass === 'arcanist' ||
          body.preferredClass === 'cleric'
            ? body.preferredClass
            : 'vanguard';
        const assertion = signDungeonsIdentityAssertion(
          {
            iss: 'beyond-dungeons',
            aud: 'beyond-overworld',
            exp: Math.floor(Date.now() / 1000) + 60,
            accountId: `usr_dungeons_reg_${body.username.toLowerCase()}`,
            username: body.username,
            isAdmin: false,
            preferredClass: chosenClass,
            lockedClass: chosenClass,
            level: 1,
            xp: 0,
            strength: 0,
            vitality: 0,
            dexterity: 0,
            intelligence: 0,
            faith: 0,
            attributePoints: 0,
          },
          secret
        );
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ assertion }));
        return;
      }

      res.writeHead(404);
      res.end();
    });
    activeClosers.push(mockDungeons.close);

    const env = {
      DUNGEONS_API_URL: `${mockDungeons.url}/`,
      BEYOND_IDENTITY_SECRET: secret,
    };

    const resolved = resolveIdentityConfig(env, { isProduction: false });
    expect(resolved.mode).toBe('configured');
    expect(resolved.dungeonsApiUrl).toBe(mockDungeons.url);
    expect(JSON.stringify(toPublicIdentityConfigStatus(resolved))).not.toContain(secret);
    expect(JSON.stringify(toPublicIdentityConfigStatus(resolved))).not.toContain(
      mockDungeons.url
    );

    const adapter = new DevCharacterAdapter();
    const auth = new AuthService(adapter, {
      env,
      seedDevAccount: true,
      isProduction: false,
    });

    const status = auth.getIdentityProviderStatus();
    expect(status.externalProviderConfigured).toBe(true);
    expect(status.externalProviderOperational).toBe(true);
    expect(JSON.stringify(status)).not.toContain(secret);

    // 1. Live HTTP verification with signed assertion returned from Beyond: Dungeons
    const remoteCredLogin = await auth
      .getExternalProvider()
      .authenticateWithCredentials('Champion', 'dungeonsSecret99');
    expect(lastAuthHeader).toBe(`Bearer ${secret}`);
    expect(lastSecretHeader).toBe(secret);
    expect(lastServiceHeader).toBe('beyond-overworld');
    expect(remoteCredLogin.ok).toBe(true);
    expect(remoteCredLogin.identity?.accountId).toBe('usr_dungeons_101');
    expect(remoteCredLogin.identity?.level).toBe(18);
    expect(remoteCredLogin.identity?.lockedClass).toBe('ranger');

    // 1b. Account snapshot lookup via GET /api/internal/identity/account/:accountId
    const snapshotRes = await auth
      .getExternalProvider()
      .fetchAccountSnapshot('usr_dungeons_101');
    expect(snapshotRes.ok).toBe(true);
    expect(snapshotRes.identity?.level).toBe(20);
    expect(snapshotRes.identity?.xp).toBe(9100);

    // 2. Live HTTP verification with direct server-to-server identity payload & admin flag
    const adminCredLogin = await auth.login('DirectAdmin', 'adminPass999');
    expect(adminCredLogin.ok).toBe(true);
    expect(adminCredLogin.provider).toBe('dungeons');
    expect(adminCredLogin.isAdmin).toBe(true);
    expect(adminCredLogin.character?.accountId).toBe('usr_dungeons_admin_1');

    // 3. Invalid credentials & 5xx errors return structured failures
    const badCreds = await auth
      .getExternalProvider()
      .authenticateWithCredentials('Champion', 'wrongPassword');
    expect(badCreds.ok).toBe(false);
    expect(badCreds.code).toBe('INVALID_CREDENTIALS');

    const backend502 = await auth
      .getExternalProvider()
      .authenticateWithCredentials('BrokenBackend', 'anything');
    expect(backend502.ok).toBe(false);
    expect(backend502.code).toBe('DUNGEONS_AUTH_ERROR');

    // 4. Register calls against Dungeons provider delegate to Beyond: Dungeons /api/internal/identity/register
    const remoteRegOk = await auth.register('NewValkyrie', 'valkyriePass99', 'cleric');
    expect(remoteRegOk.ok).toBe(true);
    expect(remoteRegOk.provider).toBe('dungeons');
    expect(remoteRegOk.character?.accountId).toBe('usr_dungeons_reg_newvalkyrie');
    expect(remoteRegOk.character?.lockedClass).toBe('cleric');
    expect(remoteRegOk.isAdmin).toBe(false);

    const remoteRegConflict = await auth.register('Champion', 'pass123456', 'vanguard');
    expect(remoteRegConflict.ok).toBe(false);
    expect(remoteRegConflict.code).toBe('ACCOUNT_EXISTS');

    // 5. Reject unsigned, tampered, and expired assertions
    const expiredAssertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) - 30,
        accountId: 'usr_expired',
        username: 'ExpiredHero',
        isAdmin: false,
        preferredClass: 'cleric',
        lockedClass: 'cleric',
        level: 4,
        xp: 120,
        strength: 2,
        vitality: 5,
        dexterity: 2,
        intelligence: 4,
        faith: 8,
        attributePoints: 0,
      },
      secret
    );
    const expiredRes = await auth.authenticateExternalAssertion(expiredAssertion);
    expect(expiredRes.ok).toBe(false);
    expect(expiredRes.code).toBe('ASSERTION_EXPIRED');

    // 6. Replay protection prevents redeeming the same signed assertion twice
    const oneTimeAssertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: 'unique_replay_nonce_42',
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

    const firstRedeem = await auth.authenticateExternalAssertion(oneTimeAssertion);
    expect(firstRedeem.ok).toBe(true);
    expect(firstRedeem.provider).toBe('dungeons');
    expect(firstRedeem.isAdmin).toBe(true);
    expect(firstRedeem.character?.accountId).toBe('usr_dungeons_42');

    const replayRedeem = await auth.authenticateExternalAssertion(oneTimeAssertion);
    expect(replayRedeem.ok).toBe(false);
    expect(replayRedeem.code).toBe('ASSERTION_REPLAYED');
  });

  it('enforces production auth rules via HTTP endpoints: disables Dev Login, local registration, and local fallback; handles unreachable Dungeons cleanly', async () => {
    const secret = 'prod_shared_identity_secret_32_chars!!';
    const adapter = new DevCharacterAdapter();
    const progression = new ProgressionIntegrationLayer(adapter);
    const instanceManager = new WorldInstanceManager();

    // Point DUNGEONS_API_URL to a closed local port to prove unreachable handling never crashes or falls back
    const closedServer = await startHttpServer((_req, res) => {
      res.writeHead(200);
      res.end();
    });
    const deadUrl = closedServer.url;
    await closedServer.close();

    const prodAuth = new AuthService(adapter, {
      isProduction: true,
      seedDevAccount: true, // Must be ignored in production!
      env: {
        NODE_ENV: 'production',
        DUNGEONS_API_URL: deadUrl,
        BEYOND_IDENTITY_SECRET: secret,
      },
    });

    const app = createOverworldHttpApp({
      authService: prodAuth,
      instanceManager,
      progressionLayer: progression,
    });
    const overworldHttp = await startHttpServer(app);
    activeClosers.push(overworldHttp.close);

    // 1. Public config endpoint hides Dev Login and local registration, enables Dungeons-backed registration, and leaks zero secrets/URLs
    const cfgRes = await fetch(`${overworldHttp.url}/api/auth/config`);
    expect(cfgRes.status).toBe(200);
    const cfgBody = await cfgRes.json();
    expect(cfgBody).toEqual({
      environment: 'production',
      authoritativeProvider: 'dungeons',
      devLoginEnabled: false,
      localRegistrationEnabled: false,
      registrationEnabled: true,
      externalAssertionEnabled: true,
    });
    expect(JSON.stringify(cfgBody)).not.toContain(secret);
    expect(JSON.stringify(cfgBody)).not.toContain(deadUrl);

    // 2. Production registration delegates to Dungeons (returns 503 DUNGEONS_UNREACHABLE when Dungeons is down, ZERO local fallback)
    const regRes = await fetch(`${overworldHttp.url}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Aleph',
        password: 'password123',
        heroClass: 'arcanist',
      }),
    });
    expect(regRes.status).toBe(503);
    const regData = (await regRes.json()) as { code: string };
    expect(regData.code).toBe('DUNGEONS_UNREACHABLE');

    // 3. Dev Login credentials (wanderer) fail with 503 DUNGEONS_UNREACHABLE (zero local dev seed / zero fallback)
    const devLoginRes = await fetch(`${overworldHttp.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'wanderer',
        password: 'wanderer123',
      }),
    });
    expect(devLoginRes.status).toBe(503);
    const devLoginData = (await devLoginRes.json()) as { code: string };
    expect(devLoginData.code).toBe('DUNGEONS_UNREACHABLE');

    // 4. POST /api/auth/external-assertion validates input, exchanges valid assertion, rejects replay, and gates /api/admin/status
    const invalidPayloadRes = await fetch(
      `${overworldHttp.url}/api/auth/external-assertion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion: 'short' }),
      }
    );
    expect(invalidPayloadRes.status).toBe(400);

    const forgedAssertion = Buffer.from(
      JSON.stringify({ accountId: 'forged', isAdmin: true }),
      'utf8'
    ).toString('base64url');
    const badSigRes = await fetch(
      `${overworldHttp.url}/api/auth/external-assertion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion: `${forgedAssertion}.bad_sig` }),
      }
    );
    expect(badSigRes.status).toBe(401);

    // Non-admin named "Aleph" signed by Dungeons must NOT be elevated to admin
    const alephAssertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        accountId: 'usr_dungeons_aleph_non_admin',
        username: 'Aleph',
        isAdmin: false,
        preferredClass: 'arcanist',
        lockedClass: 'arcanist',
        level: 10,
        xp: 2200,
        strength: 2,
        vitality: 8,
        dexterity: 5,
        intelligence: 19,
        faith: 4,
        attributePoints: 0,
      },
      secret
    );
    const alephExchange = await fetch(
      `${overworldHttp.url}/api/auth/external-assertion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion: alephAssertion }),
      }
    );
    expect(alephExchange.status).toBe(200);
    const alephJson = (await alephExchange.json()) as {
      token: string;
      isAdmin: boolean;
      provider: string;
      character: { username: string; isAdmin: boolean };
    };
    expect(alephJson.isAdmin).toBe(false);
    expect(alephJson.character.isAdmin).toBe(false);
    expect(alephJson.provider).toBe('dungeons');

    // Replay of the exact same assertion via HTTP must fail with 401 ASSERTION_REPLAYED
    const replayHttp = await fetch(
      `${overworldHttp.url}/api/auth/external-assertion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion: alephAssertion }),
      }
    );
    expect(replayHttp.status).toBe(401);
    expect(((await replayHttp.json()) as { code: string }).code).toBe(
      'ASSERTION_REPLAYED'
    );

    // Non-admin session cannot access /api/admin/status
    const nonAdminStatus = await fetch(`${overworldHttp.url}/api/admin/status`, {
      headers: { Authorization: `Bearer ${alephJson.token}` },
    });
    expect(nonAdminStatus.status).toBe(403);

    // Authoritative Dungeons admin assertion grants /api/admin/status
    const adminAssertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        accountId: 'usr_dungeons_true_admin',
        username: 'CitadelWarden',
        isAdmin: true,
        preferredClass: 'vanguard',
        lockedClass: 'vanguard',
        level: 40,
        xp: 51000,
        strength: 30,
        vitality: 28,
        dexterity: 10,
        intelligence: 4,
        faith: 8,
        attributePoints: 0,
      },
      secret
    );
    const adminExchange = await fetch(
      `${overworldHttp.url}/api/auth/external-assertion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion: adminAssertion }),
      }
    );
    expect(adminExchange.status).toBe(200);
    const adminJson = (await adminExchange.json()) as { token: string; isAdmin: boolean };
    expect(adminJson.isAdmin).toBe(true);

    const adminStatus = await fetch(`${overworldHttp.url}/api/admin/status`, {
      headers: { Authorization: `Bearer ${adminJson.token}` },
    });
    expect(adminStatus.status).toBe(200);
    const adminStatusBody = (await adminStatus.json()) as {
      ok: boolean;
      isAdmin: boolean;
      accountId: string;
    };
    expect(adminStatusBody.ok).toBe(true);
    expect(adminStatusBody.isAdmin).toBe(true);
    expect(adminStatusBody.accountId).toBe('usr_dungeons_true_admin');
  });

  it('preserves persistent Overworld character_id, Arena Honor, and equipped Armament across Dungeons re-syncs and server restarts', async () => {
    const secret = 'restart_persistence_secret_min_32_chars!';
    const env = {
      NODE_ENV: 'production',
      DUNGEONS_API_URL: 'https://dungeons.internal.test',
      BEYOND_IDENTITY_SECRET: secret,
    };

    // Boot 1: User redeems Dungeons assertion, earns Overworld Arena Honor, and unequips weapon
    const adapter1 = new DevCharacterAdapter();
    const auth1 = new AuthService(adapter1, { env, isProduction: true });
    const progression1 = new ProgressionIntegrationLayer(adapter1);

    const boot1Assertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        accountId: 'usr_persist_99',
        username: 'HonorKeeper',
        isAdmin: false,
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

    const firstLogin = await auth1.authenticateExternalAssertion(boot1Assertion);
    expect(firstLogin.ok).toBe(true);
    const originalCharacterId = firstLogin.character!.characterId;
    expect(firstLogin.character!.arenaHonor).toBe(0);
    expect(firstLogin.character!.equippedArmament.weaponId).toBe(
      getDefaultWeaponId('cleric')
    );

    const honorUpdate = await progression1.recordServerVerifiedArenaHonor({
      claimId: 'arena_match_persist_1',
      accountId: 'usr_persist_99',
      characterId: originalCharacterId,
      sourceActivity: 'arena',
      arenaHonorDelta: 125,
    });
    expect(honorUpdate.accepted).toBe(true);
    expect(honorUpdate.newHonorBalance).toBe(125);

    const armamentUpdate = await adapter1.updateEquippedArmament({
      accountId: 'usr_persist_99',
      slot: 'weapon',
      itemId: null,
    });
    expect(armamentUpdate.ok).toBe(true);

    // Boot 2: Fresh adapter & AuthService simulate Overworld process restart while Dungeons progresses hero to Lv.19
    const adapter2 = new DevCharacterAdapter();
    const auth2 = new AuthService(adapter2, { env, isProduction: true });

    const boot2Assertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        accountId: 'usr_persist_99',
        username: 'HonorKeeper',
        isAdmin: false,
        preferredClass: 'cleric',
        lockedClass: 'cleric',
        level: 19,
        xp: 9800,
        strength: 5,
        vitality: 15,
        dexterity: 7,
        intelligence: 10,
        faith: 28,
        attributePoints: 1,
      },
      secret
    );

    const secondLogin = await auth2.authenticateExternalAssertion(boot2Assertion);
    expect(secondLogin.ok).toBe(true);
    expect(secondLogin.character?.characterId).toBe(originalCharacterId);
    expect(secondLogin.character?.level).toBe(19);
    expect(secondLogin.character?.xp).toBe(9800);
    expect(secondLogin.character?.attributes.faith).toBe(28);
    expect(secondLogin.character?.arenaHonor).toBe(125);
  });

  it('persists replay protection across Overworld instances/restarts and rejects silent in-memory DB fallback in production', async () => {
    const secret = 'multi_node_replay_secret_min_32_chars!';
    const env = {
      NODE_ENV: 'production',
      DUNGEONS_API_URL: 'https://dungeons.internal.test',
      BEYOND_IDENTITY_SECRET: secret,
    };

    // Two distinct AuthService/DungeonsIdentityProvider instances (simulating restart or horizontal scaling)
    const node1Auth = new AuthService(new DevCharacterAdapter(), {
      env,
      isProduction: true,
    });
    const node2Auth = new AuthService(new DevCharacterAdapter(), {
      env,
      isProduction: true,
    });

    const sharedAssertion = signDungeonsIdentityAssertion(
      {
        iss: 'beyond-dungeons',
        aud: 'beyond-overworld',
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: 'cross_instance_replay_nonce_777',
        accountId: 'usr_cross_node',
        username: 'CrossNodeHero',
        isAdmin: false,
        preferredClass: 'vanguard',
        lockedClass: 'vanguard',
        level: 8,
        xp: 900,
        strength: 12,
        vitality: 10,
        dexterity: 4,
        intelligence: 2,
        faith: 2,
        attributePoints: 0,
      },
      secret
    );

    const firstAttempt = await node1Auth.authenticateExternalAssertion(sharedAssertion);
    expect(firstAttempt.ok).toBe(true);

    // Node 2 (or restarted process) MUST reject the already-consumed assertion
    const secondAttemptOnNode2 =
      await node2Auth.authenticateExternalAssertion(sharedAssertion);
    expect(secondAttemptOnNode2.ok).toBe(false);
    expect(secondAttemptOnNode2.code).toBe('ASSERTION_REPLAYED');

    // Production DB fail-fast guard: must throw instead of silently falling back to memory
    await closeDatabase();
    await expect(
      initDatabase({ allowMemoryFallback: false, databaseUrl: '' })
    ).rejects.toThrow(/DATABASE_URL is required in production/i);

    await closeDatabase();
    await expect(
      initDatabase({
        allowMemoryFallback: false,
        databaseUrl: 'postgres://invalid:invalid@127.0.0.1:1/nonexistent',
      })
    ).rejects.toThrow(/Refusing to start with temporary in-memory storage/i);
    await closeDatabase();
  });
});
