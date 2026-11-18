import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { AuthLoginSchema, AuthRegisterSchema } from './shared/validation/schemas.ts';
import {
  requireAdminSession,
  type AdminRequest,
} from './server/src/auth/adminAuthorization.ts';
import { AuthService } from './server/src/auth/authService.ts';
import { DevCharacterAdapter } from './server/src/characters/characterIntegrationAdapter.ts';
import { WorldInstanceManager } from './server/src/instances/worldInstanceManager.ts';
import { attachWsGateway } from './server/src/networking/wsGateway.ts';
import {
  getDatabaseStatus,
  initDatabase,
} from './server/src/persistence/database.ts';
import { ProgressionIntegrationLayer } from './server/src/progression/progressionIntegration.ts';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

async function startServer(): Promise<void> {
  await initDatabase();

  const characterAdapter = new DevCharacterAdapter();
  const progressionLayer = new ProgressionIntegrationLayer(characterAdapter);
  const authService = new AuthService(characterAdapter);
  const instanceManager = new WorldInstanceManager();

  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Auth routes
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const parsed = AuthRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration payload.' });
      return;
    }

    const result = await authService.register(
      parsed.data.username,
      parsed.data.password,
      parsed.data.heroClass
    );
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.status(201).json({
      token: result.token,
      character: result.character,
    });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const parsed = AuthLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid username and password are required.' });
      return;
    }

    const result = await authService.login(parsed.data.username, parsed.data.password);
    if (!result.ok) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({
      token: result.token,
      character: result.character,
    });
  });

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

  // Server-side administrator authorization gate (reusable for future admin commands)
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

  const server = http.createServer(app);
  attachWsGateway({
    server,
    authService,
    characterAdapter,
    instanceManager,
  });

  const distClientDir = path.resolve(process.cwd(), 'dist', 'client');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distClientDir);

  if (isProd) {
    app.use(express.static(distClientDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distClientDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Server] Beyond: Overworld listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
