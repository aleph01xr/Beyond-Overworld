import express, { type Express, type Request, type Response } from 'express';
import {
  AuthLoginSchema,
  AuthRegisterSchema,
  ExternalAssertionSchema,
} from '../../shared/validation/schemas.ts';
import {
  requireAdminSession,
  type AdminRequest,
} from './auth/adminAuthorization.ts';
import type { AuthService } from './auth/authService.ts';
import type { WorldInstanceManager } from './instances/worldInstanceManager.ts';
import { getDatabaseStatus } from './persistence/database.ts';
import type { ProgressionIntegrationLayer } from './progression/progressionIntegration.ts';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function resolveLoginErrorStatus(code: string | undefined): number {
  switch (code) {
    case 'EXTERNAL_PROVIDER_NOT_CONFIGURED':
    case 'DUNGEONS_UNREACHABLE':
    case 'DUNGEONS_TIMEOUT':
    case 'DUNGEONS_AUTH_ERROR':
    case 'INVALID_DUNGEONS_RESPONSE':
      return 503;
    default:
      return 401;
  }
}

export interface OverworldHttpAppDeps {
  authService: AuthService;
  instanceManager: WorldInstanceManager;
  progressionLayer: ProgressionIntegrationLayer;
}

export function createOverworldHttpApp({
  authService,
  instanceManager,
  progressionLayer,
}: OverworldHttpAppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Safe public auth capability descriptor (never exposes secrets or internal URLs)
  app.get('/api/auth/config', (_req: Request, res: Response) => {
    res.json(authService.getPublicClientAuthConfig());
  });

  // Local registration (strictly disabled in production when Dungeons is authoritative)
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const parsed = AuthRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid registration payload.',
        code: 'INVALID_PAYLOAD',
      });
      return;
    }

    const result = await authService.register(
      parsed.data.username,
      parsed.data.password,
      parsed.data.heroClass
    );
    if (!result.ok || !result.character || !result.token) {
      const status =
        result.code === 'LOCAL_REGISTRATION_DISABLED' ? 403 : 409;
      res.status(status).json({
        error: result.error ?? 'Registration failed.',
        code: result.code ?? 'REGISTRATION_FAILED',
      });
      return;
    }

    res.status(201).json({
      token: result.token,
      accountId: result.character.accountId,
      username: result.character.username,
      isAdmin: result.isAdmin ?? false,
      provider: result.provider,
      character: result.character,
    });
  });

  // Credential login (delegates strictly to Beyond: Dungeons in production)
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const parsed = AuthLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Valid username and password are required.',
        code: 'INVALID_PAYLOAD',
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
        error: result.error ?? 'Authentication failed.',
        code: result.code ?? 'AUTH_FAILED',
      });
      return;
    }

    res.json({
      token: result.token,
      accountId: result.character.accountId,
      username: result.character.username,
      isAdmin: result.isAdmin ?? false,
      provider: result.provider,
      character: result.character,
    });
  });

  // Cryptographic signed assertion exchange issued by Beyond: Dungeons
  app.post(
    '/api/auth/external-assertion',
    async (req: Request, res: Response) => {
      const parsed = ExternalAssertionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error:
            parsed.error.issues[0]?.message ??
            'Signed external identity assertion is required.',
          code: 'INVALID_PAYLOAD',
        });
        return;
      }

      const result = await authService.authenticateExternalAssertion(
        parsed.data.assertion
      );
      if (!result.ok || !result.character || !result.token) {
        const status =
          result.code === 'EXTERNAL_PROVIDER_NOT_CONFIGURED' ? 503 : 401;
        res.status(status).json({
          error: result.error ?? 'External identity verification failed.',
          code: result.code ?? 'INVALID_ASSERTION',
        });
        return;
      }

      res.json({
        token: result.token,
        accountId: result.character.accountId,
        username: result.character.username,
        isAdmin: result.isAdmin ?? false,
        provider: result.provider,
        character: result.character,
      });
    }
  );

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const info = await authService.getSessionCharacter(token);
    if (!info) {
      res.status(401).json({ error: 'Session expired or invalid.' });
      return;
    }
    res.json({
      accountId: info.session.accountId,
      username: info.session.username,
      isAdmin: info.session.isAdmin,
      identityProvider: info.session.provider,
      character: info.character,
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (token) {
      authService.logout(token);
    }
    res.json({ ok: true });
  });

  // Server-side administrator authorization gate (exclusive to Dungeons-authoritative isAdmin)
  app.get(
    '/api/admin/status',
    requireAdminSession(authService),
    (req: AdminRequest, res: Response) => {
      res.json({
        ok: true,
        accountId: req.adminSession!.accountId,
        username: req.adminSession!.username,
        isAdmin: true,
        identityProvider: req.adminSession!.provider,
      });
    }
  );

  // Instance directory & health routes
  app.get('/api/instances', (_req: Request, res: Response) => {
    res.json({
      instances: instanceManager.listSummaries(),
      onlineCount: instanceManager.getTotalConnectedPlayers(),
    });
  });

  // Server-authoritative guard rejecting client-submitted EXP/Honor claims (DD-026)
  app.post('/api/progression/claim', (_req: Request, res: Response) => {
    const rejected = progressionLayer.rejectClientAssertedReward();
    res.status(403).json({ error: rejected.reason });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'beyond-overworld',
      db: getDatabaseStatus(),
      identityProvider: authService.getIdentityProviderStatus(),
      instances: instanceManager.listSummaries().length,
      onlinePlayers: instanceManager.getTotalConnectedPlayers(),
    });
  });

  return app;
}
