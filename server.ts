import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './src/server/apiRouter';
import { PosSqliteRepository } from './src/server/db/posRepository';
import { getDefaultSqliteConnection } from './src/server/db/sqliteDriver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize SQLite WAL Database & Multi-Tenant Repository
  const sqliteConn = getDefaultSqliteConnection();
  const posRepo = new PosSqliteRepository(sqliteConn);

  app.use(express.json({ limit: '15mb' }));

  // Mount Modular SaaS + SQLite API Router
  app.use('/api', createApiRouter(posRepo));

  // Vite middleware for development; static SPA serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const stats = posRepo.getSqliteEngineStats();
    console.log(
      `XAIWork SaaS POS running on http://0.0.0.0:${PORT} · SQLite ${stats.sqliteVersion} (${stats.journalMode}) · ${stats.totalTenants} tenant(s)`
    );
  });
}

startServer();
