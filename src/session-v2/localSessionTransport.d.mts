export interface LocalSessionChannel {
  readyState: number;
  protocol: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(raw: string): void;
  close(code?: number, reason?: string): void;
}
export function createLocalSessionTransport(sessionId: string): LocalSessionChannel;
