export type SharedTeachingRuntimeConnection = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface SharedTeachingRuntimeEnvelope<TPayload = unknown> {
  type: 'runtime'
  sequence: number
  serverTime: number
  payload: TPayload
}

export interface SharedTeachingRuntimeTransport<TPayload = unknown> {
  connect: () => void
  disconnect: () => void
  publish: (payload: TPayload) => boolean
}

export interface SharedTeachingRuntimeTransportOptions<TEnvelope = SharedTeachingRuntimeEnvelope> {
  role: 'instructor' | 'candidate'
  sessionKey: string
  sessionId: string
  clientId: string
  onConnection: (state: SharedTeachingRuntimeConnection) => void
  onEnvelope: (envelope: TEnvelope) => void
}
