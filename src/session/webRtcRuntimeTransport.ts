import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  LocalRuntimeConnection,
  LocalRuntimeEnvelope,
  LocalRuntimePayload,
  LocalRuntimeSnapshot,
} from './localRuntimeTransport'

interface WebRtcRuntimeTransportOptions {
  role: 'instructor' | 'candidate'
  sessionKey: string
  sessionId: string
  clientId: string
  onConnection: (state: LocalRuntimeConnection) => void
  onEnvelope: (envelope: LocalRuntimeEnvelope) => void
}

type SignalMessage =
  | { kind: 'hello'; from: string; role: 'candidate'; sessionId: string; sessionKey: string }
  | { kind: 'offer'; from: string; to: string; sessionId: string; sessionKey: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; from: string; to: string; sessionId: string; sessionKey: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; to: string; sessionId: string; sessionKey: string; candidate: RTCIceCandidateInit }

interface PeerState {
  peer: RTCPeerConnection
  channel: RTCDataChannel | null
}

const CHANNEL_LABEL = 'eduvent-runtime'
const REPLAY_LIMIT = 128
const HELLO_INTERVAL_MS = 2000
const RECONNECT_DELAY_MS = 1200

function peerConfig(): RTCConfiguration {
  return {
    // Host candidates are sufficient on the same LAN. STUN improves discovery when
    // the peers are not on the same subnet, but EDUVENT does not require TURN for
    // the classroom fast path because Supabase remains the fallback transport.
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    iceCandidatePoolSize: 2,
  }
}

export class WebRtcRuntimeTransport {
  private signalling: RealtimeChannel | null = null
  private peers = new Map<string, PeerState>()
  private instructorPeer: PeerState | null = null
  private intentionallyClosed = false
  private helloTimer: number | null = null
  private reconnectTimer: number | null = null
  private sequence = 0
  private lastSequence = 0
  private replay: LocalRuntimeEnvelope[] = []
  private lastSnapshot: LocalRuntimeEnvelope | null = null

  constructor(private readonly options: WebRtcRuntimeTransportOptions) {}

  connect() {
    if (typeof RTCPeerConnection === 'undefined') {
      this.options.onConnection('error')
      return
    }
    this.intentionallyClosed = false
    this.options.onConnection('connecting')
    this.openSignalling()
  }

  disconnect() {
    this.intentionallyClosed = true
    if (this.helloTimer != null) window.clearInterval(this.helloTimer)
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer)
    this.helloTimer = null
    this.reconnectTimer = null
    for (const state of this.peers.values()) this.closePeer(state)
    this.peers.clear()
    if (this.instructorPeer) this.closePeer(this.instructorPeer)
    this.instructorPeer = null
    if (this.signalling) void supabase.removeChannel(this.signalling)
    this.signalling = null
    this.options.onConnection('disabled')
  }

  publish(payload: LocalRuntimePayload) {
    if (this.options.role !== 'instructor') return false
    const envelope: LocalRuntimeEnvelope = {
      type: 'runtime',
      sequence: ++this.sequence,
      serverTime: Date.now(),
      payload,
    }
    this.replay.push(envelope)
    if (this.replay.length > REPLAY_LIMIT) this.replay.splice(0, this.replay.length - REPLAY_LIMIT)
    if (payload.type === 'snapshot') this.lastSnapshot = envelope

    let sent = 0
    for (const state of this.peers.values()) {
      if (this.sendEnvelope(state.channel, envelope)) sent += 1
    }
    return sent > 0
  }

  private openSignalling() {
    if (this.signalling) void supabase.removeChannel(this.signalling)
    const channel = supabase.channel(`eduvent-webrtc-${this.options.sessionId}`, {
      config: { broadcast: { self: false } },
    })
    this.signalling = channel
    channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        void this.handleSignal(payload as SignalMessage)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (this.options.role === 'candidate') this.startCandidateHello()
          else this.options.onConnection(this.peers.size ? 'connected' : 'connecting')
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.options.onConnection('error')
          this.scheduleReconnect()
        }
      })
  }

  private validSignal(signal: SignalMessage) {
    return signal && signal.sessionId === this.options.sessionId && signal.sessionKey === this.options.sessionKey
  }

  private async sendSignal(signal: SignalMessage) {
    if (!this.signalling) return
    await this.signalling.send({ type: 'broadcast', event: 'signal', payload: signal })
  }

  private startCandidateHello() {
    const hello = () => {
      if (this.intentionallyClosed || this.instructorPeer?.channel?.readyState === 'open') return
      void this.sendSignal({
        kind: 'hello',
        from: this.options.clientId,
        role: 'candidate',
        sessionId: this.options.sessionId,
        sessionKey: this.options.sessionKey,
      })
    }
    hello()
    if (this.helloTimer != null) window.clearInterval(this.helloTimer)
    this.helloTimer = window.setInterval(hello, HELLO_INTERVAL_MS)
  }

  private async handleSignal(signal: SignalMessage) {
    if (!this.validSignal(signal) || signal.from === this.options.clientId) return
    if ('to' in signal && signal.to !== this.options.clientId) return

    if (this.options.role === 'instructor') {
      if (signal.kind === 'hello') {
        await this.createInstructorPeer(signal.from)
        return
      }
      const state = this.peers.get(signal.from)
      if (!state) return
      if (signal.kind === 'answer') {
        await state.peer.setRemoteDescription(signal.sdp)
      } else if (signal.kind === 'ice') {
        try { await state.peer.addIceCandidate(signal.candidate) } catch { /* peer may be restarting */ }
      }
      return
    }

    if (signal.kind === 'offer') {
      await this.acceptInstructorOffer(signal.from, signal.sdp)
      return
    }
    if (!this.instructorPeer || signal.from === this.options.clientId) return
    if (signal.kind === 'ice') {
      try { await this.instructorPeer.peer.addIceCandidate(signal.candidate) } catch { /* peer may be restarting */ }
    }
  }

  private async createInstructorPeer(candidateId: string) {
    const existing = this.peers.get(candidateId)
    if (existing && existing.peer.connectionState !== 'failed' && existing.peer.connectionState !== 'closed') return
    if (existing) this.closePeer(existing)

    const peer = new RTCPeerConnection(peerConfig())
    const channel = peer.createDataChannel(CHANNEL_LABEL, { ordered: true })
    const state: PeerState = { peer, channel }
    this.peers.set(candidateId, state)
    this.wirePeer(candidateId, state, true)
    this.wireChannel(state, true)

    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    await this.sendSignal({
      kind: 'offer',
      from: this.options.clientId,
      to: candidateId,
      sessionId: this.options.sessionId,
      sessionKey: this.options.sessionKey,
      sdp: offer,
    })
  }

  private async acceptInstructorOffer(instructorId: string, sdp: RTCSessionDescriptionInit) {
    if (this.instructorPeer) this.closePeer(this.instructorPeer)
    const peer = new RTCPeerConnection(peerConfig())
    const state: PeerState = { peer, channel: null }
    this.instructorPeer = state
    this.wirePeer(instructorId, state, false)
    peer.addEventListener('datachannel', (event) => {
      if (event.channel.label !== CHANNEL_LABEL) return
      state.channel = event.channel
      this.wireChannel(state, false)
    })
    await peer.setRemoteDescription(sdp)
    const answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)
    await this.sendSignal({
      kind: 'answer',
      from: this.options.clientId,
      to: instructorId,
      sessionId: this.options.sessionId,
      sessionKey: this.options.sessionKey,
      sdp: answer,
    })
  }

  private wirePeer(remoteId: string, state: PeerState, instructorSide: boolean) {
    state.peer.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return
      void this.sendSignal({
        kind: 'ice',
        from: this.options.clientId,
        to: remoteId,
        sessionId: this.options.sessionId,
        sessionKey: this.options.sessionKey,
        candidate: event.candidate.toJSON(),
      })
    })
    state.peer.addEventListener('connectionstatechange', () => {
      const status = state.peer.connectionState
      if (status === 'connected') {
        this.options.onConnection('connected')
        return
      }
      if (status === 'failed' || status === 'disconnected' || status === 'closed') {
        if (instructorSide) {
          this.peers.delete(remoteId)
          if (!this.peers.size) this.options.onConnection('reconnecting')
        } else if (!this.intentionallyClosed) {
          this.options.onConnection('reconnecting')
          this.startCandidateHello()
        }
      }
    })
  }

  private wireChannel(state: PeerState, instructorSide: boolean) {
    const channel = state.channel
    if (!channel) return
    channel.addEventListener('open', () => {
      this.options.onConnection('connected')
      if (instructorSide) this.replayToChannel(channel, 0)
      else if (this.helloTimer != null) {
        window.clearInterval(this.helloTimer)
        this.helloTimer = null
      }
    })
    channel.addEventListener('message', (event) => {
      let message: unknown
      try { message = JSON.parse(String(event.data)) } catch { return }
      if (instructorSide) {
        if (message && typeof message === 'object' && (message as { type?: string }).type === 'resync') {
          const after = Number((message as { lastSequence?: number }).lastSequence ?? 0)
          this.replayToChannel(channel, Number.isFinite(after) ? after : 0)
        }
        return
      }
      if (!message || typeof message !== 'object' || (message as { type?: string }).type !== 'runtime') return
      const envelope = message as LocalRuntimeEnvelope
      if (!Number.isFinite(envelope.sequence) || envelope.sequence <= 0) return
      if (this.lastSequence > 0 && envelope.sequence > this.lastSequence + 1) {
        channel.send(JSON.stringify({ type: 'resync', lastSequence: this.lastSequence }))
        return
      }
      if (envelope.sequence <= this.lastSequence) return
      this.lastSequence = envelope.sequence
      this.options.onEnvelope(envelope)
    })
    channel.addEventListener('close', () => {
      if (!this.intentionallyClosed && !instructorSide) {
        this.options.onConnection('reconnecting')
        this.startCandidateHello()
      }
    })
  }

  private replayToChannel(channel: RTCDataChannel, afterSequence: number) {
    if (channel.readyState !== 'open') return
    const snapshot = this.lastSnapshot
    if (snapshot && snapshot.sequence > afterSequence) this.sendEnvelope(channel, snapshot)
    const floor = snapshot?.sequence ?? afterSequence
    for (const envelope of this.replay) {
      if (envelope.sequence > Math.max(afterSequence, floor)) this.sendEnvelope(channel, envelope)
    }
  }

  private sendEnvelope(channel: RTCDataChannel | null, envelope: LocalRuntimeEnvelope) {
    if (!channel || channel.readyState !== 'open') return false
    try {
      channel.send(JSON.stringify(envelope))
      return true
    } catch {
      return false
    }
  }

  private closePeer(state: PeerState) {
    try { state.channel?.close() } catch { /* no-op */ }
    try { state.peer.close() } catch { /* no-op */ }
  }

  private scheduleReconnect() {
    if (this.intentionallyClosed || this.reconnectTimer != null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (this.intentionallyClosed) return
      this.options.onConnection('reconnecting')
      this.openSignalling()
    }, RECONNECT_DELAY_MS)
  }
}

export type WebRtcRuntimeSnapshot = LocalRuntimeSnapshot
