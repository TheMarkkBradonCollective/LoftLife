/**
 * Typed client for the LoftLife API. All requests are same-origin (/api) and
 * proxied by Vite in development, so there is no CORS surface.
 */
import type { AvatarConfig, LightingMood, PlacedItem, RoomSurfaceConfig } from '../game/types';

const TOKEN_KEY = 'loftlife_session_token_v1';

export interface SessionUser {
  id: string;
  handle: string;
  role: 'player' | 'admin';
  createdAt: number;
}

export type VoiceRangeSetting = 'off' | 'whisper' | 'talk' | 'shout';
export type MicrophoneMode =
  | 'push-to-talk'
  | 'toggle-to-talk'
  | 'voice-activation'
  | 'open-mic'
  | 'push-to-mute';

/** Account-synced voice preferences (range, microphone mode, sensitivity). */
export interface VoicePreferences {
  range: VoiceRangeSetting;
  micMode: MicrophoneMode;
  sensitivity: number;
}

export interface TouchLayoutPreferences {
  size: 'sm' | 'md' | 'lg';
  handedness: 'right' | 'left';
  opacity: number;
}

/** Account-synced keybindings and touch layout. */
export interface ControlsPreferences {
  bindings: Record<string, string>;
  touch: TouchLayoutPreferences;
  updatedAt: number;
}

export interface Profile {
  userId: string;
  handle: string;
  displayName: string;
  avatar: AvatarConfig;
  bio: string;
  voice?: VoicePreferences;
  createdAt: number;
  updatedAt: number;
}

export interface Wallet {
  yuanzi: number;
  tongbao: number;
}

export interface InventoryEntry {
  kind: 'furniture' | 'clothing';
  catalogId: string;
  qty: number;
  acquiredAt: number;
}

export interface SuiteState {
  id: string;
  ownerId: string;
  ownerHandle: string;
  ownerName: string;
  number: string;
  floor: number;
  name: string;
  isPublic: boolean;
  isOwner: boolean;
  items: PlacedItem[];
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  updatedAt: number;
}

export type WorldAccess = 'public' | 'private' | 'invite' | 'friends' | 'collab';
export type WorldKind =
  | 'hangout'
  | 'house'
  | 'apartment'
  | 'club'
  | 'restaurant'
  | 'shop'
  | 'park'
  | 'venue'
  | 'neighborhood';

export interface WorldSummary {
  id: string;
  name: string;
  kind: WorldKind;
  description: string;
  access: WorldAccess;
  published: boolean;
  ownerId: string;
  ownerHandle: string;
  maxVisitors: number;
  createdAt: number;
  updatedAt: number;
  canEdit: boolean;
  canEnter: boolean;
  items?: PlacedItem[];
  surfaces?: RoomSurfaceConfig;
  mood?: LightingMood;
  collaborators?: { userId: string; handle: string }[];
}

export interface ShopEntry {
  id: string;
  kind: 'furniture' | 'clothing';
  price: number;
  currency: 'yuanzi' | 'tongbao';
  label?: string;
}

export interface ConversationEntry {
  userId: string;
  handle: string;
  displayName: string;
  avatar: AvatarConfig | null;
  unread: number;
  lastMessage: { body: string; createdAt: number; fromMe: boolean };
}

export interface PublicProfile {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  avatar: AvatarConfig | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface FriendEntry {
  userId: string;
  handle: string;
  displayName: string;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing';
}

export interface LedgerEntry {
  id: string;
  currency: 'yuanzi' | 'tongbao';
  delta: number;
  balanceAfter: number;
  reason: string;
  ref: string | null;
  createdAt: number;
}

export class ApiError extends Error {
  status: number;
  code: string;
  detail?: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage may be unavailable in private mode; the session still works in memory.
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers.authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'Cannot reach the LoftLife server');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const shape = (payload ?? {}) as { error?: string; code?: string; detail?: unknown };
    if (response.status === 401 && auth) setToken(null);
    throw new ApiError(
      response.status,
      shape.code ?? 'error',
      shape.error ?? `Request failed (${response.status})`,
      shape.detail
    );
  }

  return payload as T;
}

/* --------------------------------- auth ---------------------------------- */

export interface AuthResult {
  user: SessionUser;
  token: string;
  expiresAt: number;
}

export const api = {
  register: (body: {
    handle: string;
    email: string;
    password: string;
    displayName?: string;
    avatar?: AvatarConfig;
  }) => request<AuthResult>('/auth/register', { method: 'POST', body, auth: false }),

  login: (body: { identifier: string; password: string }) =>
    request<AuthResult>('/auth/login', { method: 'POST', body, auth: false }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{
      user: SessionUser;
      profile: Profile;
      wallet: Wallet;
      inventory: InventoryEntry[];
      suite: SuiteState;
    }>('/auth/me'),

  getControls: () => request<ControlsPreferences>('/preferences/controls'),

  saveControls: (body: {
    bindings: Record<string, string>;
    touch: TouchLayoutPreferences;
    updatedAt?: number;
  }) => request<ControlsPreferences>('/preferences/controls', { method: 'PUT', body }),

  updateProfile: (body: {
    displayName?: string;
    bio?: string;
    avatar?: AvatarConfig;
    voice?: VoicePreferences;
  }) => request<Profile>('/profile', { method: 'PATCH', body }),

  shop: () => request<{ furniture: ShopEntry[]; clothing: ShopEntry[] }>('/shop', { auth: false }),

  purchase: (catalogId: string, idempotencyKey: string) =>
    request<{
      item: ShopEntry;
      duplicate: boolean;
      wallet: Wallet;
      inventory: InventoryEntry[];
      ledgerId: string;
    }>('/economy/purchase', { method: 'POST', body: { catalogId, idempotencyKey } }),

  claimDaily: () =>
    request<{ wallet: Wallet; nextClaimAt: number }>('/economy/daily', { method: 'POST' }),

  history: () => request<LedgerEntry[]>('/economy/history'),

  saveSuite: (body: {
    name?: string;
    items: PlacedItem[];
    surfaces: RoomSurfaceConfig;
    mood: LightingMood;
  }) => request<SuiteState>('/suite', { method: 'PUT', body }),

  setSuiteVisibility: (isPublic: boolean) =>
    request<SuiteState>('/suite/visibility', { method: 'POST', body: { isPublic } }),

  worlds: (params: { mine?: boolean; q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.mine) search.set('mine', '1');
    if (params.q) search.set('q', params.q);
    const suffix = search.toString();
    // "My worlds" is account-scoped; public discovery stays anonymous.
    return request<WorldSummary[]>(`/worlds${suffix ? `?${suffix}` : ''}`, { auth: params.mine === true });
  },

  // Send the session when available so owner/editor flags and state are correct.
  world: (id: string) => request<WorldSummary>(`/worlds/${id}`),

  createWorld: (body: { name: string; kind: WorldKind; access: WorldAccess; description?: string }) =>
    request<WorldSummary>('/worlds', { method: 'POST', body }),

  updateWorld: (
    id: string,
    body: Partial<{
      name: string;
      kind: WorldKind;
      access: WorldAccess;
      description: string;
      published: boolean;
      maxVisitors: number;
    }>
  ) => request<WorldSummary>(`/worlds/${id}`, { method: 'PATCH', body }),

  saveWorldState: (
    id: string,
    body: { items: PlacedItem[]; surfaces: RoomSurfaceConfig; mood: LightingMood }
  ) => request<WorldSummary>(`/worlds/${id}/state`, { method: 'PUT', body }),

  deleteWorld: (id: string) => request<{ deleted: boolean }>(`/worlds/${id}`, { method: 'DELETE' }),

  addCollaborator: (id: string, handle: string) =>
    request<WorldSummary>(`/worlds/${id}/collaborators`, { method: 'POST', body: { handle } }),

  removeCollaborator: (id: string, userId: string) =>
    request<WorldSummary>(`/worlds/${id}/collaborators/${userId}`, { method: 'DELETE' }),

  inviteToWorld: (id: string, handle: string) =>
    request<{ invited: string }>(`/worlds/${id}/invite`, { method: 'POST', body: { handle } }),

  worldEntry: (id: string) =>
    request<{ instanceId: string; capacity: number; name: string }>(`/worlds/${id}/entry`),

  friends: () => request<FriendEntry[]>('/friends'),

  /** Account preferences persisted server-side; local storage is the offline copy. */
  settings: () => request<{ settings: Record<string, unknown> }>('/settings'),

  saveSettings: (settings: unknown) =>
    request<{ settings: Record<string, unknown> }>('/settings', {
      method: 'PUT',
      body: { settings },
    }),

  conversations: () =>
    request<{ conversations: ConversationEntry[] }>('/messages/conversations'),

  markConversationRead: (handle: string) =>
    request<{ ok: boolean; handle: string }>('/messages/read', {
      method: 'POST',
      body: { handle },
    }),

  suiteOf: (handle: string) =>
    request<SuiteState>(`/suites/${encodeURIComponent(handle)}`),

  profileOf: (handle: string) =>
    request<PublicProfile>(`/profiles/${encodeURIComponent(handle)}`),

  requestFriend: (handle: string) =>
    request<{ status: string }>('/friends/request', { method: 'POST', body: { handle } }),

  acceptFriend: (userId: string) =>
    request<{ status: string }>('/friends/accept', { method: 'POST', body: { userId } }),

  removeFriend: (userId: string) =>
    request<{ removed: boolean }>(`/friends/${userId}`, { method: 'DELETE' }),

  players: (q: string) =>
    request<{ userId: string; handle: string; displayName: string }[]>(
      `/players?q=${encodeURIComponent(q)}`
    ),

  block: (handle: string) =>
    request<{ blocked: string }>('/blocks', { method: 'POST', body: { handle } }),

  report: (body: { handle: string; reason: string; details?: string }) =>
    request<{ id: string; status: string }>('/reports', { method: 'POST', body }),

  presence: () =>
    request<{
      online: number;
      instances: { id: string; kind: string; count: number; capacity: number }[];
      cityCapacity: number;
    }>('/presence', { auth: false }),

  /** Server-owned transit routes (stops + labels). */
  transit: () =>
    request<{
      lines: {
        id: string;
        label: string;
        kind: 'bus';
        stops: { id: string; name: string; x: number; z: number }[];
      }[];
    }>('/transit', { auth: false }),

  /** Party snapshot for reconnect/resync; actions run over the socket. */
  party: () =>
    request<{
      party: {
        id: string;
        leaderId: string;
        members: { userId: string; handle: string; displayName: string }[];
        invites: { userId: string; handle: string; displayName: string }[];
        maxMembers: number;
        createdAt: number;
      } | null;
      invites: {
        id: string;
        leaderId: string;
        members: { userId: string; handle: string; displayName: string }[];
        invites: { userId: string; handle: string; displayName: string }[];
        maxMembers: number;
        createdAt: number;
      }[];
    }>('/party'),

  chatHistory: (params: { scope: string; scopeId?: string; with?: string }) => {
    const search = new URLSearchParams({ scope: params.scope });
    if (params.scopeId) search.set('scopeId', params.scopeId);
    if (params.with) search.set('with', params.with);
    return request<
      {
        id: string;
        body: string;
        createdAt: number;
        from: { userId: string; handle: string; displayName: string };
      }[]
    >(`/chat/history?${search.toString()}`);
  },
};
