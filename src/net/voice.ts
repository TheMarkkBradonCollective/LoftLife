/**
 * Proximity voice (WebRTC mesh).
 *
 * The server only relays SDP/ICE between players in the same instance; audio
 * flows peer-to-peer. This layer owns the microphone and the peer mesh. It does
 * not decide *when* to transmit: `VoiceControlState` (shared/voice-controls)
 * does, and the session pushes the result in with `setTransmitting`. That keeps
 * desktop keys, the phone bubble and the settings panel on one policy while
 * the media plumbing stays in one place.
 *
 * Audibility uses the same bands as text chat (whisper 4 m, say 14 m, shout
 * 35 m), so spatial rules stay consistent. Voice Range Off disables the local
 * track and stops advertising voice to nearby players.
 */
import type { RemotePlayer, VoiceSignal } from './realtime';
import { rangeToAudibleMode, type VoiceRange } from '../../shared/voice-controls.mjs';

export type VoiceStatus = 'off' | 'requesting' | 'ready' | 'denied' | 'unsupported';
/** Audible distance band; `say` is the wire name for the Talk range. */
export type VoiceMode = 'whisper' | 'say' | 'shout';

export interface VoiceDevice {
  deviceId: string;
  label: string;
}

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
  range: VoiceRange = 'off';
  inputDevices: VoiceDevice[] = [];
  activeDeviceId = '';

  private transmitting = false;
  private localStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;
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

  get audibleMode(): VoiceMode {
    return rangeToAudibleMode(this.range) as VoiceMode;
  }

  /** True while the local audio track is actually live (range + policy). */
  get isTransmitting() {
    return this.transmitting && this.range !== 'off' && this.status === 'ready';
  }

  private emit() {
    this.onChange();
  }

  private applyTrackEnabled() {
    if (!this.localStream) return;
    const enabled = this.isTransmitting;
    for (const track of this.localStream.getAudioTracks()) track.enabled = enabled;
  }

  /** Voice Range: Off silences the track immediately. */
  setRange(range: VoiceRange) {
    this.range = range;
    if (range === 'off') this.transmitting = false;
    this.applyTrackEnabled();
  }

  /** The policy layer's current transmission decision. */
  setTransmitting(on: boolean) {
    const next = Boolean(on) && this.range !== 'off';
    if (next === this.transmitting) {
      this.applyTrackEnabled();
      return;
    }
    this.transmitting = next;
    this.applyTrackEnabled();
  }

  private async openStream(deviceId?: string) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
  }

  private attachAnalyser(stream: MediaStream) {
    try {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      this.audioContext = this.audioContext ?? new Ctor();
      if (this.audioContext.state === 'suspended') {
        void this.audioContext.resume().catch(() => {});
      }
      this.disconnectAnalyser();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.15;
      this.levelBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
      // Intentionally not connected to the destination: no local echo.
    } catch {
      this.analyser = null;
      this.levelBuffer = null;
    }
  }

  private disconnectAnalyser() {
    this.analyser = null;
    this.levelBuffer = null;
  }

  /** Normalized microphone loudness (0..1) for voice activation and the meter. */
  getLevel(): number {
    const analyser = this.analyser;
    const buffer = this.levelBuffer;
    if (!analyser || !buffer) return 0;
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const value = (buffer[i] - 128) / 128;
      sum += value * value;
    }
    return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
  }

  async refreshDevices(): Promise<VoiceDevice[]> {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.();
      if (!devices) return this.inputDevices;
      const inputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      this.inputDevices = inputs;
      if (!this.activeDeviceId && inputs[0]) this.activeDeviceId = inputs[0].deviceId;
      return inputs;
    } catch {
      return this.inputDevices;
    }
  }

  async enable(deviceId?: string) {
    if (this.status === 'ready' || this.status === 'requesting') return;
    if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.status = 'unsupported';
      this.emit();
      return;
    }
    this.status = 'requesting';
    this.emit();
    try {
      this.localStream = await this.openStream(deviceId || this.activeDeviceId || undefined);
      const track = this.localStream.getAudioTracks()[0];
      this.activeDeviceId = track?.getSettings?.().deviceId || deviceId || '';
      this.attachAnalyser(this.localStream);
      this.status = 'ready';
      this.applyTrackEnabled();
      await this.refreshDevices();
    } catch (error) {
      const name = (error as { name?: string })?.name;
      this.status = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported';
      this.localStream = null;
    }
    this.emit();
  }

  disable() {
    for (const connId of [...this.peers.keys()]) this.dropPeer(connId);
    this.disposeStream();
    this.transmitting = false;
    this.status = 'off';
    this.emit();
  }

  private disposeStream() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    this.disconnectAnalyser();
    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  /** Switch microphone input without re-asking for permission. */
  async setInputDevice(deviceId: string): Promise<boolean> {
    if (!deviceId) return false;
    if (this.status !== 'ready') {
      this.activeDeviceId = deviceId;
      return true;
    }
    try {
      const stream = await this.openStream(deviceId);
      const previous = this.localStream;
      this.localStream = stream;
      this.activeDeviceId = deviceId;
      this.attachAnalyser(stream);
      if (previous) {
        for (const track of previous.getTracks()) track.stop();
      }
      this.applyTrackEnabled();
      const track = stream.getAudioTracks()[0] ?? null;
      for (const entry of this.peers.values()) {
        const sender = entry.pc.getSenders().find((candidate) => candidate.track?.kind === 'audio');
        if (sender && track) void sender.replaceTrack(track);
      }
      this.emit();
      return true;
    } catch {
      return false;
    }
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
