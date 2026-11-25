import type { Server as HttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseCookies, SESSION_COOKIE_NAME } from './auth.ts';
import type { LoftLifeDatabase } from './db.ts';

interface ConnectedPlayer {
  ws: WebSocket;
  userId: string;
  username: string;
  displayName: string;
  location: string;
}

export class WorldWebSocketHub {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ConnectedPlayer>();
  private db: LoftLifeDatabase;

  constructor(server: HttpServer, db: LoftLifeDatabase) {
    this.db = db;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      void this.handleConnection(ws, req);
    });
  }

  getOnlineCount(): number {
    const uniqueUsers = new Set<string>();
    for (const entry of this.clients.values()) {
      uniqueUsers.add(entry.userId);
    }
    return uniqueUsers.size;
  }

  private broadcastOnlineRoster(): void {
    const onlineCount = this.getOnlineCount();
    const payload = JSON.stringify({
      type: 'presence:roster',
      onlineCount,
    });
    for (const client of this.clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private async authenticateToken(ws: WebSocket, token: string): Promise<boolean> {
    const state = await this.db.getSessionState(token);
    if (!state) return false;

    this.clients.set(ws, {
      ws,
      userId: state.account.id,
      username: state.account.username,
      displayName: state.account.displayName,
      location: 'room',
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'auth:ok',
          userId: state.account.id,
          username: state.account.username,
          onlineCount: this.getOnlineCount(),
        })
      );
    }
    this.broadcastOnlineRoster();
    return true;
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[SESSION_COOKIE_NAME];
    if (cookieToken) {
      await this.authenticateToken(ws, cookieToken);
    }

    const authTimeout = setTimeout(() => {
      if (!this.clients.has(ws) && ws.readyState === WebSocket.OPEN) {
        ws.close(4001, 'Authentication required');
      }
    }, 8000);

    ws.on('message', (raw) => {
      void (async () => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            token?: string;
            location?: string;
          };
          if (msg.type === 'auth' && typeof msg.token === 'string') {
            const ok = await this.authenticateToken(ws, msg.token);
            if (!ok) {
              ws.close(4003, 'Invalid session');
            }
            return;
          }
          const player = this.clients.get(ws);
          if (!player) return;
          if (msg.type === 'presence:location' && typeof msg.location === 'string') {
            player.location = msg.location.slice(0, 32);
          }
        } catch {
          // Ignore malformed client frames
        }
      })();
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (this.clients.delete(ws)) {
        this.broadcastOnlineRoster();
      }
    });
  }
}
