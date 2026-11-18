import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { AuthService } from './server/src/auth/authService.ts';
import { DevCharacterAdapter } from './server/src/characters/characterIntegrationAdapter.ts';
import { createOverworldHttpApp } from './server/src/httpApp.ts';
import { WorldInstanceManager } from './server/src/instances/worldInstanceManager.ts';
import { attachWsGateway } from './server/src/networking/wsGateway.ts';
import { initDatabase } from './server/src/persistence/database.ts';
import { ProgressionIntegrationLayer } from './server/src/progression/progressionIntegration.ts';

async function startServer(): Promise<void> {
  await initDatabase();

  const characterAdapter = new DevCharacterAdapter();
  const progressionLayer = new ProgressionIntegrationLayer(characterAdapter);
  const authService = new AuthService(characterAdapter);
  const instanceManager = new WorldInstanceManager();

  const app = createOverworldHttpApp({
    authService,
    instanceManager,
    progressionLayer,
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

startServer().catch((err) => {
  console.error(
    '[Server] Fatal startup failure:',
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
