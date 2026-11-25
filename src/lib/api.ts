import type {
  AuthSessionResponse,
  AvatarConfig,
  LightingMood,
  PlacedItem,
  RoomAccessMode,
  RoomSurfaceConfig,
} from '../game/types';

let inMemorySessionToken: string | null = null;

export function getInMemorySessionToken(): string | null {
  return inMemorySessionToken;
}

export function setInMemorySessionToken(token: string | null): void {
  inMemorySessionToken = token;
}

async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-LoftLife-Client', '1');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchSession(): Promise<AuthSessionResponse | null> {
  try {
    return await apiRequest<AuthSessionResponse>('/api/auth/me', { method: 'GET' });
  } catch {
    return null;
  }
}

export async function registerAccount(payload: {
  username: string;
  email: string;
  displayName?: string;
  password: string;
  importState?: {
    avatar?: AvatarConfig;
    roomName?: string;
    surfaces?: RoomSurfaceConfig;
    mood?: LightingMood;
    items?: PlacedItem[];
  };
}): Promise<AuthSessionResponse> {
  const data = await apiRequest<AuthSessionResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (data.sessionToken) setInMemorySessionToken(data.sessionToken);
  return data;
}

export async function loginAccount(payload: {
  identifier: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const data = await apiRequest<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (data.sessionToken) setInMemorySessionToken(data.sessionToken);
  return data;
}

export async function logoutAccount(): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  } finally {
    setInMemorySessionToken(null);
  }
}

export async function saveCloudState(payload: {
  displayName?: string;
  avatar: AvatarConfig;
  roomName: string;
  accessMode: RoomAccessMode;
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  items: PlacedItem[];
}): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/api/me/state', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function openWorldSocket(
  onOnlineCount: (count: number) => void
): WebSocket | null {
  if (typeof window === 'undefined') return null;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/ws`);

  ws.addEventListener('open', () => {
    const token = getInMemorySessionToken();
    if (token) {
      ws.send(JSON.stringify({ type: 'auth', token }));
    }
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as {
        type?: string;
        onlineCount?: number;
      };
      if (typeof msg.onlineCount === 'number') {
        onOnlineCount(msg.onlineCount);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  return ws;
}
