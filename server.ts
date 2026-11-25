import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  clearSessionCookie,
  extractSessionTokenFromRequest,
  setSessionCookie,
  verifySameOriginOrClientHeader,
} from './src/server/auth.ts';
import { AuthError, LoftLifeDatabase } from './src/server/db.ts';
import { WorldWebSocketHub } from './src/server/wsHub.ts';
import type { PersistedPlayerState } from './src/game/types.ts';

interface AuthenticatedRequest extends Request {
  sessionToken?: string;
  playerState?: PersistedPlayerState;
}

const PORT = 3000;

async function startServer() {
  const app = express();
  const db = new LoftLifeDatabase();
  const httpServer = http.createServer(app);
  const wsHub = new WorldWebSocketHub(httpServer, db);

  app.set('trust proxy', true);
  app.use(express.json({ limit: '512kb' }));

  const requireSameOriginMutation = (req: Request, res: Response, next: NextFunction) => {
    if (!verifySameOriginOrClientHeader(req)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }
    next();
  };

  const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const token = extractSessionTokenFromRequest(req);
      if (!token) {
        res.status(401).json({ error: 'Sign in required.' });
        return;
      }
      const state = await db.getSessionState(token);
      if (!state) {
        clearSessionCookie(req, res);
        res.status(401).json({ error: 'Session expired or invalid.' });
        return;
      }
      req.sessionToken = token;
      req.playerState = state;
      next();
    } catch (err) {
      console.error('Auth verification failed:', err);
      res.status(500).json({ error: 'Unable to verify session.' });
    }
  };

  app.get('/api/health', async (_req, res) => {
    try {
      await db.ensureInitialized();
      res.json({
        ok: true,
        storageEngine: db.engine,
        onlineCount: wsHub.getOnlineCount(),
      });
    } catch (err) {
      console.error('Health check error:', err);
      res.status(503).json({ ok: false, error: 'Database unavailable.' });
    }
  });

  app.post('/api/auth/register', requireSameOriginMutation, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { state, sessionToken } = await db.registerUser({
        username: body.username,
        email: body.email,
        displayName: body.displayName,
        password: body.password,
        importState: body.importState,
      });
      setSessionCookie(req, res, sessionToken);
      res.status(201).json({
        state,
        storageEngine: db.engine,
        onlineCount: wsHub.getOnlineCount(),
        sessionToken,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Register failed:', err);
      res.status(500).json({ error: 'Could not create account.' });
    }
  });

  app.post('/api/auth/login', requireSameOriginMutation, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { state, sessionToken } = await db.loginUser(body.identifier, body.password);
      setSessionCookie(req, res, sessionToken);
      res.json({
        state,
        storageEngine: db.engine,
        onlineCount: wsHub.getOnlineCount(),
        sessionToken,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Login failed:', err);
      res.status(500).json({ error: 'Could not sign in.' });
    }
  });

  app.post('/api/auth/logout', requireSameOriginMutation, async (req, res) => {
    try {
      const token = extractSessionTokenFromRequest(req);
      await db.revokeSession(token);
      clearSessionCookie(req, res);
      res.json({ ok: true });
    } catch (err) {
      console.error('Logout failed:', err);
      res.status(500).json({ error: 'Could not sign out cleanly.' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    res.json({
      state: req.playerState,
      storageEngine: db.engine,
      onlineCount: wsHub.getOnlineCount(),
    });
  });

  app.put('/api/me/state', requireSameOriginMutation, requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.playerState) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updated = await db.updatePlayerState(req.playerState.account.id, {
        displayName: body.displayName,
        avatar: body.avatar,
        roomName: body.roomName,
        accessMode: body.accessMode,
        surfaces: body.surfaces,
        mood: body.mood,
        items: body.items,
      });
      res.json({
        state: updated,
        storageEngine: db.engine,
        onlineCount: wsHub.getOnlineCount(),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('State save failed:', err);
      res.status(500).json({ error: 'Could not save room state.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`LoftLife server listening on http://0.0.0.0:${PORT} (${db.engine})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
