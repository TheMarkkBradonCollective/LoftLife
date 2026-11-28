/**
 * Typed client for the LoftLife API. All requests are same-origin (/api) and
 * proxied by Vite in development, so there is no CORS surface.
 */
import type {
  AccessoryId,
  AvatarConfig,
  BottomStyleId,
  CarryId,
  JewelryId,
  LightingMood,
  PlacedItem,
  RoomSurfaceConfig,
  TopStyleId,
} from '../game/types';

const TOKEN_KEY = 'loftlife_session_token_v1';

export interface LivePlayerPresence {
  userId: string;
  handle: string;
  name: string;
  isGuest: boolean;
  instanceId: string;
  location: string;
  connectedAt: number;
  lastSeen: number;
}

export type LoftStaffRole = 'founder' | 'director' | 'management' | 'administrator' | 'moderator' | 'support';
export interface AdminConsoleData {
  actor: { userId: string; handle: string; role: LoftStaffRole; departments: string[] };
  stats: { accounts: number; staff: number; openReports: number };
  staff: { userId: string; handle: string; displayName: string; role: LoftStaffRole; departments: string[]; appointedAt: number }[];
  reports: { id: string; reason: string; details: string; status: string; createdAt: number; reporter: string; target: string; targetId: string }[];
  players: { id: string; handle: string; displayName: string; createdAt: number; suspendedUntil: number; staffRole: string }[];
  audit: { id: string; action: string; detail: Record<string, unknown>; createdAt: number; actor: string; target: string | null }[];
  founderSetup: { configured: boolean; count: number };
}

export interface LiveGameMonitoring {
  online: number;
  updatedAt: number;
  cityCapacity: number;
  instances: { id: string; kind: string; worldId: string | null; count: number; capacity: number }[];
  players: LivePlayerPresence[];
}
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
  cubits: number;
  cash: number;
}

export interface BankAccount {
  accountNumber: string;
  balance: number;
  cardLast4: string;
  cardStatus: string;
  cardBrand: string;
  createdAt: number;
  updatedAt: number;
}

export interface BankPayment {
  id: string;
  kind: 'deposit' | 'withdrawal' | 'payment';
  method: 'wallet' | 'card' | 'cash';
  amount: number;
  currency: 'cubits';
  merchant: string | null;
  ref: string | null;
  atmId: string | null;
  createdAt: number;
}

export interface BankOverview {
  account: BankAccount;
  card: { brand: string; last4: string; status: string; number: string };
  wallet: Wallet;
  payments: BankPayment[];
  atms: Array<{ id: string; label: string; district: string }>;
  limits: { minAmount: number; maxAmount: number; dailyLimit: number };
}

/** Wardrobe-only content of a saved outfit; foundations are never included. */
export interface OutfitConfig {
  topStyle: TopStyleId;
  topColor: string;
  bottomStyle: BottomStyleId;
  bottomColor: string;
  shoeColor: string;
  accessory: AccessoryId;
  jewelry: JewelryId;
  carry: CarryId;
}

export interface SavedOutfit {
  id: string;
  name: string;
  config: OutfitConfig;
  createdAt: number;
}

export interface MakeoverResult {
  profile: Profile;
  wallet: Wallet;
  charged: number;
  duplicate: boolean;
  changed: string[];
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

export interface TransitDestination {
  id: string;
  label: string;
  x: number;
  z: number;
  arrival: { x: number; z: number };
}

export interface TransitHub {
  id: string;
  label: string;
  mode: 'rail';
  x: number;
  z: number;
}

export interface TravelDestination {
  id: string;
  label: string;
  kind: 'city' | 'world';
  location?: string;
  spawn?: { x: number; z: number; yaw?: number };
  worldId?: string;
  worldName?: string;
  ownerHandle?: string;
  access?: WorldAccess;
  blurb?: string;
}

export type WorldFoundationId = 'TG-MapDefault' | 'TG-MapRiverside' | 'TG-MapHarbor';

export interface WorldFoundation {
  id: WorldFoundationId;
  label: string;
  description: string;
  default: boolean;
  size: number;
  terrain: string;
  terrainColor: string;
  climate: string;
  roads: Array<{ x: number; z: number; w: number; d: number }>;
  water: Array<{ x: number; z: number; w: number; d: number }>;
}

export type WorldAccess = 'public' | 'private' | 'invite' | 'friends' | 'collab';
export type WorldRole = 'owner' | 'co_owner' | 'moderator' | 'builder' | 'member';
export type WorldStatus = 'live' | 'available' | 'offline' | 'build_mode' | 'build_pending' | 'maintenance';
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
  status: WorldStatus;
  role: WorldRole | null;
  canBuild: boolean;
  canManageStatus: boolean;
  ownerId: string;
  ownerHandle: string;
  maxVisitors: number;
  createdAt: number;
  updatedAt: number;
  canEdit: boolean;
  canEnter: boolean;
  canViewStudio?: boolean;
  foundation?: WorldFoundationId;
  isOfficial?: boolean;
  layoutVersion?: number;
  publishedVersion?: number;
  items?: PlacedItem[];
  surfaces?: RoomSurfaceConfig;
  mood?: LightingMood;
  collaborators?: { userId: string; handle: string; role: Exclude<WorldRole, 'owner'> }[];
}

export interface WorldLayoutObject {
  id: string;
  tool: string;
  x: number;
  z: number;
  rot: number;
  color: string;
  material: string;
}

export interface WorldLayoutSettings {
  climate: 'temperate' | 'coastal' | 'desert' | 'alpine';
  timeOfDay: 'day' | 'golden' | 'night';
  terrain: 'lawn' | 'meadow' | 'sand' | 'stone';
  terrainColor: string;
}

export interface WorldLayout {
  v: number;
  foundation: WorldFoundationId;
  settings: WorldLayoutSettings;
  objects: WorldLayoutObject[];
}

export interface WorldPlot {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  status: 'available' | 'requested' | 'approved' | 'denied';
  requestedBy: string | null;
  assignedTo: string | null;
}

export interface WorldBuildPermissions {
  role: string;
  isOwner: boolean;
  isStaff: boolean;
  isOfficial: boolean;
  canManage: boolean;
  canOpenBuildMode: boolean;
  canPlaceStreets: boolean;
  canApprovePlots: boolean;
  canBuild: boolean;
  canUseDecorations: boolean;
  canPublish: boolean;
  canUndo: boolean;
  canViewStudio: boolean;
  canChangeStatus: boolean;
  canAccessOfficialWorkspace: boolean;
  isMember: boolean;
}

export interface WorldBuildHistoryEntry {
  id: string;
  revision: number;
  action: string;
  detail: string;
  actorId: string | null;
  actorHandle: string;
  createdAt: number;
}

export interface WorldBuildState {
  world: {
    id: string;
    name: string;
    kind: WorldKind;
    access: WorldAccess;
    status: WorldStatus;
    published: boolean;
    foundation: WorldFoundationId;
    isOfficial: boolean;
    ownerId: string;
    layoutVersion: number;
    publishedVersion: number;
    updatedAt: number;
  };
  role: string;
  permissions: WorldBuildPermissions;
  layout: WorldLayout;
  publishedLayout: WorldLayout;
  plots: WorldPlot[];
  history: WorldBuildHistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
}

export type WorldBuildOp =
  | { action: 'place'; tool: string; x: number; z: number; rot?: number; color?: string; material?: string; id?: string }
  | { action: 'move'; id: string; x: number; z: number }
  | { action: 'rotate'; id: string }
  | { action: 'recolor'; id: string; color: string; material?: string }
  | { action: 'remove'; id: string }
  | { action: 'settings'; settings: Partial<WorldLayoutSettings> }
  | { action: 'plot_create'; name: string; x: number; z: number; w: number; d: number }
  | { action: 'plot_remove' | 'plot_request' | 'plot_approve' | 'plot_deny' | 'plot_release'; id: string };

export interface ShopEntry {
  id: string;
  kind: 'furniture' | 'clothing' | 'general';
  price: number;
  currency: 'yuanzi' | 'tongbao' | 'cubits';
  label?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  merchant?: string;
  /** Transparent catalog preview rendered from the item's own 3D model. */
  preview?: string | null;
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
  currency: 'yuanzi' | 'tongbao' | 'cubits' | 'cash';
  account?: 'wallet' | 'bank' | 'cash';
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
  token?: string | null;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = options.token ?? getToken();
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
  mustChangePassword?: boolean;
}

export const api = {
  createGuestSession: (displayName: string) =>
    request<{ guest: { id: string; displayName: string }; token: string; expiresAt: number }>(
      '/guest/session', { method: 'POST', body: { displayName }, auth: false }
    ),
  revokeGuestSession: (token: string) =>
    request<{ ok: boolean }>('/guest/session', { method: 'DELETE', auth: true, token }),

  register: (body: {
    handle: string;
    email: string;
    password: string;
    displayName?: string;
    avatar?: AvatarConfig;
  }) => request<AuthResult>('/auth/register', { method: 'POST', body, auth: false }),

  login: (body: { identifier: string; password: string }) =>
    request<AuthResult>('/auth/login', { method: 'POST', body, auth: false }),

  changePassword: (password: string) => request<{ ok: boolean; token: string; expiresAt: number; mustChangePassword: false }>('/auth/change-password', { method: 'POST', body: { password } }),
  createAdminAccount: (body: { email: string; handle: string; displayName: string; role: LoftStaffRole | 'player'; departments: string[] }) => request<{ ok: boolean; account: { id: string; handle: string; email: string; role: string }; temporaryPassword: string }>('/admin/console/accounts', { method: 'POST', body }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{
      user: SessionUser;
      profile: Profile;
      wallet: Wallet;
      bank?: BankOverview;
      inventory: InventoryEntry[];
      outfits: SavedOutfit[];
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

  shop: () =>
    request<{ furniture: ShopEntry[]; clothing: ShopEntry[]; general: ShopEntry[] }>('/shop', {
      auth: false,
    }),

  /** Paid foundational makeover; the server owns the price and the idempotency. */
  characterMakeover: (avatar: AvatarConfig, idempotencyKey: string) =>
    request<MakeoverResult>('/character/makeover', {
      method: 'POST',
      body: { avatar, idempotencyKey },
    }),

  outfits: () => request<SavedOutfit[]>('/outfits'),

  saveOutfit: (name: string, config: OutfitConfig) =>
    request<SavedOutfit>('/outfits', { method: 'POST', body: { name, config } }),

  deleteOutfit: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/outfits/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  purchase: (catalogId: string, idempotencyKey: string, paymentMethod: 'wallet' | 'card' | 'cash' = 'wallet') =>
    request<{
      item: ShopEntry;
      duplicate: boolean;
      wallet: Wallet;
      bank?: BankAccount;
      receipt?: BankPayment;
      inventory: InventoryEntry[];
      ledgerId?: string;
    }>('/economy/purchase', { method: 'POST', body: { catalogId, idempotencyKey, paymentMethod } }),

  bank: () => request<BankOverview>('/bank'),

  bankDeposit: (body: {
    amount: number;
    source: 'wallet' | 'cash';
    atmId?: string;
    idempotencyKey: string;
  }) => request<BankOverview & { receipt: BankPayment; duplicate: boolean }>('/bank/deposit', { method: 'POST', body }),

  bankWithdraw: (body: {
    amount: number;
    target: 'wallet' | 'cash';
    atmId?: string;
    idempotencyKey: string;
  }) => request<BankOverview & { receipt: BankPayment; duplicate: boolean }>('/bank/withdraw', { method: 'POST', body }),

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

  createWorld: (body: {
    name: string;
    kind: WorldKind;
    access: WorldAccess;
    description?: string;
    foundation?: WorldFoundationId;
  }) => request<WorldSummary>('/worlds', { method: 'POST', body }),

  foundations: () =>
    request<{ default: WorldFoundationId; foundations: WorldFoundation[] }>('/worlds/foundations'),

  officialMainCity: () => request<WorldBuildState>('/official/main-city'),

  worldBuild: (id: string) => request<WorldBuildState>(`/worlds/${id}/build`),

  worldBuildOp: (id: string, op: WorldBuildOp) =>
    request<{ state: WorldBuildState; summary: string }>(`/worlds/${id}/build/op`, {
      method: 'POST',
      body: op,
    }),

  worldBuildUndo: (id: string) =>
    request<{ state: WorldBuildState; summary: string }>(`/worlds/${id}/build/undo`, { method: 'POST' }),

  worldBuildRedo: (id: string) =>
    request<{ state: WorldBuildState; summary: string }>(`/worlds/${id}/build/redo`, { method: 'POST' }),

  worldBuildRestore: (id: string, revision: number) =>
    request<{ state: WorldBuildState; summary: string }>(`/worlds/${id}/build/restore`, {
      method: 'POST',
      body: { revision },
    }),

  worldBuildPublish: (id: string) =>
    request<{ state: WorldBuildState; summary: string }>(`/worlds/${id}/build/publish`, { method: 'POST' }),

  updateWorld: (
    id: string,
    body: Partial<{
      name: string;
      kind: WorldKind;
      access: WorldAccess;
      description: string;
      maxVisitors: number;
    }>
  ) => request<WorldSummary>(`/worlds/${id}`, { method: 'PATCH', body }),

  setWorldStatus: (id: string, status: Extract<WorldStatus, 'live' | 'available' | 'offline'>) =>
    request<{ status: WorldStatus; activeCount: number }>(`/worlds/${id}/status`, { method: 'POST', body: { status } }),

  requestWorldBuildMode: (id: string) =>
    request<{ status: WorldStatus; activeCount: number; pending: boolean }>(`/worlds/${id}/build-mode`, { method: 'POST' }),

  saveWorldState: (
    id: string,
    body: { items: PlacedItem[]; surfaces: RoomSurfaceConfig; mood: LightingMood }
  ) => request<WorldSummary>(`/worlds/${id}/state`, { method: 'PUT', body }),

  deleteWorld: (id: string) => request<{ deleted: boolean }>(`/worlds/${id}`, { method: 'DELETE' }),

  addCollaborator: (id: string, handle: string, role: Exclude<WorldRole, 'owner'> = 'builder') =>
    request<WorldSummary>(`/worlds/${id}/collaborators`, { method: 'POST', body: { handle, role } }),

  removeCollaborator: (id: string, userId: string) =>
    request<WorldSummary>(`/worlds/${id}/collaborators/${userId}`, { method: 'DELETE' }),

  inviteToWorld: (id: string, handle: string) =>
    request<{ invited: string }>(`/worlds/${id}/invite`, { method: 'POST', body: { handle } }),

  worldEntry: (id: string) =>
    request<{ instanceId: string; capacity: number; name: string; status: WorldStatus }>(`/worlds/${id}/entry`),

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

  adminAccess: () => request<{ actor: { userId: string; handle: string; role: LoftStaffRole; departments: string[] } }>('/admin/console/access'),
  adminConsole: (q = '') => request<AdminConsoleData>(`/admin/console${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  assignStaff: (body: { handle: string; role: Exclude<LoftStaffRole, 'founder'>; departments: string[] }) =>
    request<{ ok: boolean }>('/admin/console/staff', { method: 'POST', body }),
  removeStaff: (userId: string) =>
    request<{ ok: boolean }>(`/admin/console/staff/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  updateAdminReport: (id: string, status: 'reviewed' | 'actioned') =>
    request<{ ok: boolean }>(`/admin/console/reports/${encodeURIComponent(id)}`, { method: 'POST', body: { status } }),
  setPlayerSuspension: (userId: string, hours: number) =>
    request<{ ok: boolean; suspendedUntil: number }>(`/admin/console/players/${encodeURIComponent(userId)}/suspension`, { method: 'POST', body: { hours } }),

  monitoring: () => request<LiveGameMonitoring>('/admin/monitoring'),
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
        kind: 'bus' | 'rail';
        color?: string;
        stops: { id: string; name: string; x: number; z: number }[];
      }[];
      taxis: TransitDestination[];
      hubs: TransitHub[];
    }>('/transit', { auth: false }),

  /** Server-validated destinations for intercity rail and flights. */
  travelDestinations: () =>
    request<{ city: TravelDestination[]; worlds: TravelDestination[] }>(
      '/travel/destinations',
      { auth: false }
    ),

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
