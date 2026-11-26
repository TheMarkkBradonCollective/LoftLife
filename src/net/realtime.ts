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
  kind: 'bus';
  stops: TransitStop[];
}

export interface TransitVehicle {
  id: string;
  lineId: string;
  label: string;
  kind: 'bus';
  x: number;
  z: number;
  heading: number;
  stopIndex: number;
  dwelling: boolean;
  seats: number;
  riders: { userId: string; handle: string; seat: number }[];
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
  onStatus?: (status: ConnectionStatus) => void;
  onReady?: (payload: { instance: InstanceInfo; you: RemotePlayer; players: RemotePlayer[] }) => void;
  onSnapshot?: (players: RemotePlayer[], instanceId: string, vehicles: TransitVehicle[]) => void;
  onJoin?: (player: RemotePlayer) => void;
  onLeave?: (connId: string) => void;
  onChat?: (chat: ChatEvent) => void;
  onParty?: (party: Party | null, invites: Party[]) => void;
  onVoice?: (signal: VoiceSignal) => void;
  onTransit?: (payload: {
    riding: { vehicleId: string; lineId: string; seat: number; label?: string } | null;
    vehicles: TransitVehicle[];
    exited?: { x: number; z: number; lineId: string | null; label: string | null } | null;
  }) => void;
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
      this.retry = 0;
      socket.send(
        JSON.stringify({ t: 'hello', token: this.options.token, place: this.options.place })
      );
      this.startPoseLoop();
    };

    socket.onmessage = (event) => {
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
        case 'transit':
          this.options.onTransit?.({
            riding:
              (msg.riding as { vehicleId: string; lineId: string; seat: number; label?: string } | null) ??
              null,
            vehicles: (msg.vehicles as TransitVehicle[]) ?? [],
            exited:
              (msg.exited as { x: number; z: number; lineId: string | null; label: string | null } | null) ??
              null,
          });
          break;
        case 'error':
          this.options.onError?.(String(msg.code ?? 'error'), String(msg.message ?? ''));
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
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

  switchPlace(place: Place) {
    this.options.place = place;
    if (this.socket) {
      this.closedByUser = true;
      this.socket.close();
      this.socket = null;
    }
    this.retry = 0;
    this.closedByUser = false;
    this.open();
  }

  close() {
    this.closedByUser = true;
    this.stopPoseLoop();
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.options.onStatus?.('idle');
  }
}
