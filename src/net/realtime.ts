/**
 * WebSocket client for the LoftLife realtime gateway.
 *
 * Reconnects with exponential backoff, keeps handlers fresh via a ref so React
 * re-renders never tear down the socket, and exposes a small typed surface.
 */
import type { AvatarConfig } from '../game/types';

export type Place = { kind: 'city' } | { kind: 'world'; worldId: string };

export interface RemotePlayer {
  connId: string;
  userId: string;
  handle: string;
  name: string;
  displayName?: string;
  isGuest?: boolean;
  avatar: AvatarConfig | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  emote: string;
  location: string;
  voice?: boolean;
  voiceMode?: 'whisper' | 'say' | 'shout';
  riding?: string | null;
}

export interface TransitStop {
  id: string;
  name: string;
  x: number;
  z: number;
}

export interface TransitLine {
  id: string;
  label: string;
  kind: 'bus' | 'rail';
  color?: string;
  stops: TransitStop[];
}

export interface TransitVehicle {
  id: string;
  lineId: string;
  label: string;
  kind: 'bus' | 'rail' | 'taxi';
  color?: string;
  x: number;
  z: number;
  heading: number;
  stopIndex: number;
  dwelling: boolean;
  state?: string | null;
  destinationId?: string | null;
  destinationLabel?: string | null;
  seats: number;
  riders: { userId: string; handle: string; seat: number }[];
}

export interface TaxiDestination {
  id: string;
  label: string;
  x: number;
  z: number;
  arrival: { x: number; z: number };
}

export interface TaxiTrip {
  state: 'waiting' | 'driving' | 'arrived' | string;
  destinationId?: string | null;
  destinationLabel?: string | null;
  destinations: TaxiDestination[];
  etaSeconds?: number;
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
  access?: string;
  blurb?: string;
}

export interface TravelJourney {
  id: string;
  mode: 'rail' | 'air';
  phase: 'boarding' | 'enroute' | 'arrived';
  destination: TravelDestination;
  startedAt: number;
  departAt: number;
  arriveAt: number;
  vehicleId: string;
  label: string;
}

export interface TravelEvent {
  action: 'boarding' | 'departed' | 'arrived' | 'cancelled';
  journey?: TravelJourney;
  mode?: 'rail' | 'air';
}

export interface PartyMember {
  userId: string;
  handle: string;
  displayName: string;
}

export interface Party {
  id: string;
  leaderId: string;
  members: PartyMember[];
  invites: PartyMember[];
  maxMembers: number;
  createdAt: number;
}

export interface VoiceSignal {
  from: { connId: string; userId: string; handle: string; name: string };
  kind: 'offer' | 'answer' | 'ice';
  data: unknown;
}

export interface ChatScope {
  scope: 'local' | 'city' | 'world' | 'dm' | 'party';
  mode?: 'whisper' | 'say' | 'shout';
  to?: string;
  body: string;
}

export interface ChatEvent {
  scope: 'local' | 'city' | 'world' | 'dm' | 'party';
  mode?: string;
  body: string;
  from: { userId: string; handle: string; displayName: string; isGuest?: boolean };
  at: number;
  id?: string;
  scopeId?: string;
  to?: { userId: string; handle: string };
  range?: number;
}

export interface HotelSuiteVisit {
  userId: string;
  name: string;
  roomNumber: string;
  floor: number;
  avatar: AvatarConfig | null;
  items: import('../game/types').PlacedItem[];
  surfaces: import('../game/types').RoomSurfaceConfig;
  mood: import('../game/types').LightingMood;
}

export interface HotelEvent {
  action:
    | 'ring'
    | 'ringing'
    | 'granted'
    | 'declined'
    | 'unavailable'
    | 'resolved'
    | 'expired'
    | 'cancelled';
  requestId?: string;
  roomNumber?: string;
  room?: HotelSuiteVisit;
  from?: { userId: string; handle: string; name: string };
  reason?: string;
  message?: string;
  expiresAt?: number;
  accepted?: boolean;
}

export interface InstanceInfo {
  id: string;
  kind: 'city' | 'world';
  worldId: string | null;
  capacity: number;
  count: number;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface RealtimeOptions {
  token: string;
  place: Place;
  /** Guest appearance is device-local and sent once at authenticated hello. */
  avatar?: AvatarConfig | null;
  onStatus?: (status: ConnectionStatus) => void;
  onReady?: (payload: { instance: InstanceInfo; you: RemotePlayer; players: RemotePlayer[] }) => void;
  onSnapshot?: (players: RemotePlayer[], instanceId: string, vehicles: TransitVehicle[]) => void;
  onJoin?: (player: RemotePlayer) => void;
  onLeave?: (connId: string) => void;
  /** The server wants this client to reconnect to another instance. */
  onRelocate?: (instance: InstanceInfo) => void;
  onChat?: (chat: ChatEvent) => void;
  onParty?: (party: Party | null, invites: Party[]) => void;
  onVoice?: (signal: VoiceSignal) => void;
  onTransit?: (payload: {
    riding: {
      vehicleId: string;
      lineId: string;
      seat: number;
      label?: string;
      kind?: 'bus' | 'rail' | 'taxi';
    } | null;
    vehicles: TransitVehicle[];
    taxi?: TaxiTrip;
    taxiArrived?: boolean;
    exited?: { x: number; z: number; lineId: string | null; label: string | null } | null;
  }) => void;
  onTravel?: (event: TravelEvent) => void;
  onHotel?: (event: HotelEvent) => void;
  onError?: (code: string, message: string) => void;
}

const MAX_RETRY_DELAY = 15_000;
const POSE_INTERVAL_MS = 100;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private options: RealtimeOptions;
  private retry = 0;
  private closedByUser = false;
  private retryTimer: number | null = null;
  private poseTimer: number | null = null;
  // No pose is streamed until the scene has reported a real position; sending
  // the placeholder origin first would make the gateway treat the real spawn
  // as an impossible jump and pin the avatar at the origin.
  private hasPose = false;
  private pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    emote: string;
    location: string;
    voice: boolean;
    voiceMode: 'whisper' | 'say' | 'shout';
  } = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    emote: 'idle',
    location: 'world',
    voice: false,
    voiceMode: 'say',
  };

  constructor(options: RealtimeOptions) {
    this.options = options;
  }

  update(options: Partial<RealtimeOptions>) {
    this.options = { ...this.options, ...options };
  }

  get status(): ConnectionStatus {
    if (!this.socket) return 'idle';
    if (this.socket.readyState === WebSocket.OPEN) return 'connected';
    if (this.socket.readyState === WebSocket.CONNECTING) return 'connecting';
    return 'reconnecting';
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  private open() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.options.onStatus?.(this.retry === 0 ? 'connecting' : 'reconnecting');

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // Ask for the logical city; the server resolves it to city:main and
    // rejects any other client-supplied city shard.
    const instance = this.options.place.kind === 'world'
      ? `world:${this.options.place.worldId}`
      : 'city';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws?instance=${encodeURIComponent(instance)}`);
    this.socket = socket;

    socket.onopen = () => {
      // A socket replaced by switchPlace() must not drive this client.
      if (this.socket !== socket) return;
      this.retry = 0;
      socket.send(
        JSON.stringify({ t: 'hello', token: this.options.token, place: this.options.place, avatar: this.options.avatar ?? undefined })
      );
      this.startPoseLoop();
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'ready':
          this.options.onStatus?.('connected');
          this.options.onReady?.({
            instance: msg.instance as InstanceInfo,
            you: msg.you as RemotePlayer,
            players: (msg.players as RemotePlayer[]) ?? [],
          });
          break;
        case 'snapshot':
          this.options.onSnapshot?.(
            (msg.players as RemotePlayer[]) ?? [],
            String(msg.instanceId ?? ''),
            (msg.vehicles as TransitVehicle[]) ?? []
          );
          break;
        case 'join':
          this.options.onJoin?.(msg.player as RemotePlayer);
          break;
        case 'leave':
          this.options.onLeave?.(String(msg.connId ?? ''));
          break;
        case 'replaced':
          this.closedByUser = true;
          socket.close(4003, 'replaced');
          this.options.onStatus?.('offline');
          break;
        case 'relocate': {
          const instance = msg.instance as InstanceInfo | undefined;
          if (instance?.id) this.options.onRelocate?.(instance);
          break;
        }
        case 'chat':
          this.options.onChat?.(msg as unknown as ChatEvent);
          break;
        case 'party':
          this.options.onParty?.(
            (msg.party as Party | null) ?? null,
            (msg.invites as Party[]) ?? []
          );
          break;
        case 'voice':
          this.options.onVoice?.(msg as unknown as VoiceSignal);
          break;
        case 'hotel':
          this.options.onHotel?.(msg as unknown as HotelEvent);
          break;
        case 'transit':
          this.options.onTransit?.({
            riding:
              (msg.riding as {
                vehicleId: string;
                lineId: string;
                seat: number;
                label?: string;
                kind?: 'bus' | 'rail' | 'taxi';
              } | null) ?? null,
            vehicles: (msg.vehicles as TransitVehicle[]) ?? [],
            taxi: (msg.taxi as TaxiTrip | undefined) ?? undefined,
            taxiArrived: Boolean(msg.taxiArrived),
            exited:
              (msg.exited as { x: number; z: number; lineId: string | null; label: string | null } | null) ??
              null,
          });
          break;
        case 'travel':
          this.options.onTravel?.(msg as unknown as TravelEvent);
          break;
        case 'error':
          this.options.onError?.(String(msg.code ?? 'error'), String(msg.message ?? ''));
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      // Ignore a socket that switchPlace()/close() already detached; otherwise
      // its close would wipe the replacement socket and stop its pose loop,
      // leaving this client sending stale poses from an orphaned connection.
      if (this.socket !== socket) return;
      this.stopPoseLoop();
      this.socket = null;
      if (this.closedByUser) {
        this.options.onStatus?.('idle');
        return;
      }
      this.options.onStatus?.('reconnecting');
      this.retry = Math.min(this.retry + 1, 6);
      const delay = Math.min(1000 * 2 ** (this.retry - 1), MAX_RETRY_DELAY);
      this.retryTimer = window.setTimeout(() => this.open(), delay);
    };

    socket.onerror = () => {
      // onclose handles the retry path.
    };
  }

  private startPoseLoop() {
    this.stopPoseLoop();
    this.poseTimer = window.setInterval(() => {
      if (!this.hasPose) return;
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      this.socket.send(JSON.stringify({ t: 'pose', ...this.pose }));
    }, POSE_INTERVAL_MS);
  }

  private stopPoseLoop() {
    if (this.poseTimer !== null) {
      window.clearInterval(this.poseTimer);
      this.poseTimer = null;
    }
  }

  setPose(next: Partial<RealtimeClient['pose']>) {
    this.pose = { ...this.pose, ...next };
    this.hasPose = true;
  }

  sendChat(chat: ChatScope) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'chat', ...chat }));
    return true;
  }

  joinFriend(handle: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ t: 'joinFriend', handle }));
  }

  partyAction(action: 'create' | 'invite' | 'accept' | 'leave' | 'kick' | 'join', data: { handle?: string; userId?: string } = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'party', action, ...data }));
    return true;
  }

  sendVoiceSignal(to: string, kind: 'offer' | 'answer' | 'ice', data: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'voice', to, kind, data }));
    return true;
  }

  ringDoorbell(roomNumber: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'hotel', action: 'ring', roomNumber }));
    return true;
  }

  answerDoorbell(requestId: string, accept: boolean) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'hotel', action: 'respond', requestId, accept }));
    return true;
  }

  cancelDoorbell(requestId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'hotel', action: 'cancel', requestId }));
    return true;
  }

  boardTransit(lineId: string, stopId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'transit', action: 'board', lineId, stopId }));
    return true;
  }

  exitTransit() {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'transit', action: 'exit' }));
    return true;
  }

  hailTaxi(vehicleId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'transit', action: 'hailTaxi', vehicleId }));
    return true;
  }

  chooseTaxiDestination(destinationId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'transit', action: 'taxiDestination', destinationId }));
    return true;
  }

  startJourney(mode: 'rail' | 'air', destinationId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'travel', action: 'start', mode, destinationId }));
    return true;
  }

  cancelJourney() {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ t: 'travel', action: 'cancel' }));
    return true;
  }

  switchPlace(place: Place) {
    const current = this.options.place;
    const sameInstance =
      (place.kind === 'city' && current.kind === 'city') ||
      (place.kind === 'world' && current.kind === 'world' && current.worldId === place.worldId);
    this.options.place = place;
    // Re-entering the place we are already in must not open a second socket:
    // two connections for one account show up as a duplicate avatar.
    if (sameInstance && (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING)) {
      return;
    }
    // Detach first, so the retiring socket's close handler is a no-op.
    const socket = this.socket;
    this.socket = null;
    this.stopPoseLoop();
    this.clearRetryTimer();
    if (socket) {
      try {
        socket.close();
      } catch {
        // Already closing.
      }
    }
    this.retry = 0;
    this.closedByUser = false;
    this.open();
  }

  private clearRetryTimer() {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  close() {
    this.closedByUser = true;
    this.stopPoseLoop();
    this.clearRetryTimer();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.options.onStatus?.('idle');
  }
}
