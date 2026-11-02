import type { RealtimeChannel } from '@supabase/supabase-js'
import { publishLocalPresentationBroadcast, subscribeLocalRuntimePayload } from '../session/localRuntimeTransport'
import { supabase } from '../session/supabase'

type BroadcastHandler = (payload: unknown) => void

type PendingMessage = { event: string; payload: unknown }

type SessionBus = {
  channel: RealtimeChannel
  handlers: Map<string, Set<BroadcastHandler>>
  boundEvents: Set<string>
  pending: PendingMessage[]
  subscribed: boolean
  users: number
  closeTimer: number | null
}

const buses = new Map<string, SessionBus>()

/**
 * Ephemeral instructor presentation events get a LAN fast path and in-memory
 * relay replay. They are deliberately not persisted as patient/session state.
 */
const LOCAL_PRESENTATION_EVENTS = new Set([
  'teaching-laser-pointer',
  'teaching-laser-waveform-snapshot',
  'teaching-session-clock',
])

function ensureBus(sessionId: string): SessionBus {
  const existing = buses.get(sessionId)
  if (existing) return existing

  const handlers = new Map<string, Set<BroadcastHandler>>()
  const boundEvents = new Set<string>()
  const pending: PendingMessage[] = []
  const channel = supabase.channel(`teaching-live:${sessionId}`, {
    config: { broadcast: { self: false, ack: true } },
  })

  const bus: SessionBus = {
    channel,
    handlers,
    boundEvents,
    pending,
    subscribed: false,
    users: 0,
    closeTimer: null,
  }

  channel.subscribe((status) => {
    bus.subscribed = status === 'SUBSCRIBED'
    if (!bus.subscribed) return
    const queued = bus.pending.splice(0)
    for (const message of queued) {
      void channel.send({ type: 'broadcast', event: message.event, payload: message.payload })
    }
  })

  buses.set(sessionId, bus)
  return bus
}

function bindEvent(bus: SessionBus, event: string) {
  if (bus.boundEvents.has(event)) return
  bus.boundEvents.add(event)
  bus.channel.on('broadcast', { event }, ({ payload }) => {
    const listeners = bus.handlers.get(event)
    if (!listeners) return
    for (const listener of Array.from(listeners)) listener(payload)
  })
}

export function subscribeTeachingBroadcast(sessionId: string, event: string, handler: BroadcastHandler) {
  const bus = ensureBus(sessionId)
  if (bus.closeTimer != null) {
    window.clearTimeout(bus.closeTimer)
    bus.closeTimer = null
  }
  bindEvent(bus, event)
  const listeners = bus.handlers.get(event) ?? new Set<BroadcastHandler>()
  listeners.add(handler)
  bus.handlers.set(event, listeners)
  bus.users += 1

  const unsubscribeLocal = LOCAL_PRESENTATION_EVENTS.has(event)
    ? subscribeLocalRuntimePayload(sessionId, (message) => {
        if (message.type !== 'presentation' || message.presentation.event !== event) return
        handler(message.presentation.payload)
      })
    : () => undefined

  return () => {
    unsubscribeLocal()
    listeners.delete(handler)
    bus.users = Math.max(0, bus.users - 1)
    if (bus.users > 0) return
    bus.closeTimer = window.setTimeout(() => {
      if (bus.users > 0) return
      buses.delete(sessionId)
      void supabase.removeChannel(bus.channel)
    }, 1500)
  }
}

export function sendTeachingBroadcast(sessionId: string, event: string, payload: unknown) {
  if (LOCAL_PRESENTATION_EVENTS.has(event)) {
    publishLocalPresentationBroadcast(sessionId, event, payload)
  }

  const bus = ensureBus(sessionId)
  if (bus.subscribed) {
    return bus.channel.send({ type: 'broadcast', event, payload })
  }
  bus.pending.push({ event, payload })
  return Promise.resolve('queued')
}
