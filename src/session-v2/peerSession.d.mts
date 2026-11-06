import type { LocalSessionChannel } from './localSessionTransport.mjs'
export function createCandidatePeerTransport(offer: string, onAnswer: (text: string) => void): LocalSessionChannel;
