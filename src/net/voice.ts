/**
 * Proximity voice (WebRTC mesh).
 *
 * The server only relays SDP/ICE between players in the same instance; audio
 * flows peer-to-peer. Voice is opt-in: nothing is captured until the player
 * enables it. Two input modes are supported: `open` keeps the microphone live
 * (voice activity, the phone default) and `push` only transmits while a
 * push-to-talk key or the on-screen hold button is down. Audibility follows
 * the same bands as text chat (whisper 4 m, say 14 m, shout 35 m), so the
 * spatial rules are consistent.
 */
import type { RemotePlayer, VoiceSignal } from './realtime';

export type VoiceStatus = 'off' | 'requesting' | 'ready' | 'denied' | 'unsupported';
export type VoiceMode = 'whisper' | 'say' | 'shout';
/** `open` is voice activity (live mic); `push` transmits only while held. */
export type VoiceInputMode = 'open' | 'push';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const MAX_HEARING_RANGE = 35;

const rangeFor = (mode: VoiceMode) =>
  mode === 'whisper' ? 4 : mode === 'shout' ? 35 : 14;

interface PeerEntry {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement | null;
  stream: MediaStream;
  initiator: boolean;
}

export interface VoiceSyncContext {
  selfConnId: string | null;
  x: number;
  z: number;
  location: string;
}

export class VoiceManager {
  status: VoiceStatus = 'off';
  voiceMode: VoiceMode = 'say';
  pushToTalk = false;
  openMic = false;

  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerEntry>();
  private sendSignal: (to: string, kind: 'offer' | 'answer' | 'ice', data: unknown) => boolean;
  private onChange: () => void;
  private anchor: VoiceSyncContext = { selfConnId: null, x: 0, z: 0, location: 'world' };
  private lastPlayers: RemotePlayer[] = [];

  constructor(options: {
    sendSignal: (to: string, kind: 'offer' | 'answer' | 'ice', data: unknown) => boolean;
    onChange: () => void;
  }) {
    this.sendSignal = options.sendSignal;
    this.onChange = options.onChange;
  }

  get enabled() {
    return this.status === 'ready';
  }

  private emit() {
    this.onChange();
  }

  async enable() {
    if (this.status === 'ready' || this.status === 'requesting') return;
    if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.status = 'unsupported';
      this.emit();
      return;
    }
    this.status = 'requesting';
    this.emit();
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.applyTrackEnabled();
      this.status = 'ready';
    } catch {
      this.status = 'denied';
      this.localStream = null;
    }
    this.emit();
  }

  disable() {
    for (const connId of [...this.peers.keys()]) this.dropPeer(connId);
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    this.status = 'off';
    this.emit();
  }

  /** Open mic transmits whenever voice is on; push-to-talk only while held. */
  setOpenMic(on: boolean) {
    this.openMic = on;
    this.applyTrackEnabled();
  }

  private applyTrackEnabled() {
    if (!this.localStream) return;
    const enabled = this.openMic || this.pushToTalk;
    for (const track of this.localStream.getAudioTracks()) track.enabled = enabled;
  }

  setPushToTalk(on: boolean) {
    this.pushToTalk = on;
    this.applyTrackEnabled();
  }

  setVoiceMode(mode: VoiceMode) {
    this.voiceMode = mode;
    this.applyVolumes();
  }

  setAnchor(anchor: Partial<VoiceSyncContext>) {
    this.anchor = { ...this.anchor, ...anchor };
  }

  private createPeer(connId: string, initiator: boolean): PeerEntry {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const stream = new MediaStream();
    const entry: PeerEntry = { pc, audio: null, stream, initiator };
    this.peers.set(connId, entry);

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal(connId, 'ice', event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const remote = event.streams[0];
      if (!entry.audio) {
        const audio = new Audio();
        audio.autoplay = true;
        audio.srcObject = remote ?? entry.stream;
        // Start silent; sync() raises the volume once the peer is verified in range.
        audio.volume = 0;
        entry.audio = audio;
      } else {
        entry.audio.srcObject = remote ?? entry.stream;
      }
      void entry.audio.play().catch(() => {
        // Autoplay can be blocked until the next user gesture; the element
        // keeps the stream and will play on the next interaction.
      });
    };
    pc.onnegotiationneeded = () => {
      if (!initiator) return;
      void this.sendOffer(connId, pc);
    };
    return entry;
  }

  private async sendOffer(connId: string, pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal(connId, 'offer', pc.localDescription?.toJSON() ?? offer);
    } catch {
      // A failed negotiation simply means no audio with this peer.
    }
  }

  private dropPeer(connId: string) {
    const entry = this.peers.get(connId);
    if (!entry) return;
    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.onnegotiationneeded = null;
    if (entry.audio) {
      entry.audio.pause();
      entry.audio.srcObject = null;
    }
    entry.pc.close();
    this.peers.delete(connId);
  }

  /** Reconcile peer connections with the players currently around us. */
  sync(players: RemotePlayer[], context: VoiceSyncContext) {
    this.anchor = context;
    this.lastPlayers = players;
    if (!this.enabled) {
      for (const connId of [...this.peers.keys()]) this.dropPeer(connId);
      return;
    }
    if (!context.selfConnId) return;

    const wanted = new Set<string>();
    for (const player of players) {
      if (!player.voice) continue;
      if (player.location !== context.location) continue;
      if (player.connId === context.selfConnId) continue;
      const distance = Math.hypot(player.x - context.x, player.z - context.z);
      if (distance > MAX_HEARING_RANGE) continue;
      wanted.add(player.connId);
      if (!this.peers.has(player.connId)) {
        this.createPeer(player.connId, context.selfConnId < player.connId);
      }
    }
    for (const connId of [...this.peers.keys()]) {
      if (!wanted.has(connId)) this.dropPeer(connId);
    }
    this.applyVolumes();
  }

  /** Distance-based volume for each connected peer. */
  private applyVolumes(players: RemotePlayer[] = this.lastPlayers) {
    for (const player of players) {
      const entry = this.peers.get(player.connId);
      if (!entry?.audio) continue;
      const distance = Math.hypot(player.x - this.anchor.x, player.z - this.anchor.z);
      const range = rangeFor(player.voiceMode ?? 'say');
      if (distance > range) {
        entry.audio.volume = 0;
      } else {
        entry.audio.volume = Math.max(0.04, Math.min(1, 1 - distance / range) ** 1.35);
      }
    }
  }

  /** Called by the realtime layer. Accepts only signals from known/valued peers. */
  async handleSignal(signal: VoiceSignal) {
    if (!this.enabled) return;
    const { from } = signal;
    let entry = this.peers.get(from.connId);
    if (!entry) {
      // An offer can arrive before the next presence snapshot. The peer starts
      // silent (volume 0) until sync() confirms it is nearby.
      if (signal.kind !== 'offer') return;
      entry = this.createPeer(from.connId, false);
    }
    const pc = entry.pc;
    try {
      if (signal.kind === 'offer') {
        await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(from.connId, 'answer', pc.localDescription?.toJSON() ?? answer);
      } else if (signal.kind === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
        }
      } else if (signal.kind === 'ice') {
        await pc.addIceCandidate(signal.data as RTCIceCandidateInit);
      }
    } catch {
      // Stale or malformed signalling is ignored; the peer renegotiates on the
      // next sync if it is still in range.
    }
  }
}
