import type { Socket } from 'socket.io-client';

export type EmergencyTransport = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener: (name: string, callback: () => void) => void;
  start: () => void;
  close: () => void;
};

/** A canary can opt into the existing authenticated endpoint, never change origins or downgrade WebSocket. */
export function emergencyTransportSelection(configured: string | undefined, development: boolean, canary: string | undefined, search = '') {
  const transport = configured ?? (development ? 'socket.io' : 'sse');
  if (transport !== 'socket.io' && transport !== 'sse') throw new Error('Unsupported emergency transport');
  if (canary !== undefined && canary !== 'true' && canary !== 'false') throw new Error('Unsupported emergency canary');
  const selections = new URLSearchParams(search).getAll('__realtime');
  const requested = selections.length === 1 && selections[0] === 'socket.io';
  const selected = canary === 'true' && requested ? 'socket.io' : transport;
  return { transport: selected, diagnostics: requested && selected === 'socket.io' } as const;
}

export function socketEmergencyTransport(socket: Pick<Socket, 'on' | 'connect' | 'disconnect' | 'removeAllListeners'>): EmergencyTransport {
  const result: EmergencyTransport = {
    onopen: null, onerror: null,
    addEventListener: (name, callback) => {
      socket.on('emergency.event', (event: unknown) => {
        if (event && typeof event === 'object' && 'type' in event && event.type === name) callback();
      });
    },
    start: () => { socket.connect(); },
    close: () => { socket.removeAllListeners(); socket.disconnect(); },
  };
  socket.on('connect', () => result.onopen?.());
  socket.on('connect_error', () => result.onerror?.());
  socket.on('disconnect', () => result.onerror?.());
  return result;
}

export async function createEmergencyTransport(origin: string): Promise<EmergencyTransport> {
  const { transport, diagnostics } = emergencyTransportSelection(process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT,
    process.env.NODE_ENV === 'development', process.env.NEXT_PUBLIC_EMERGENCY_CANARY,
    typeof window === 'undefined' ? '' : window.location.search);
  if (transport === 'socket.io') {
    const { io } = await import('socket.io-client');
    const socket = io(origin || window.location.origin, {
      path: '/api/events/v1/socket.io', transports: ['websocket'],
      autoConnect: false, reconnection: false, withCredentials: true,
      forceNew: true, multiplex: false, timeout: 10_000,
    });
    // Fixed public protocol markers only, on the explicit diagnostic URL. Never log payloads, IDs or errors.
    const heartbeat = () => {
      if (diagnostics && socket.connected && socket.io.engine.transport.name === 'websocket') console.info('Emergency realtime: WebSocket heartbeat received');
    };
    if (diagnostics) {
      socket.on('connect', () => {
        if (socket.io.engine.transport.name === 'websocket') console.info('Emergency realtime: authenticated Socket.IO WebSocket connected');
      });
      socket.on('connect_error', () => console.info('Emergency realtime: WebSocket connection not established'));
      socket.io.on('ping', heartbeat);
    }
    const result = socketEmergencyTransport(socket), close = result.close;
    result.close = () => { socket.io.off('ping', heartbeat); close(); };
    return result;
  }
  const source = new EventSource(`${origin}/api/events/v1/stream`, { withCredentials: true });
  const result: EmergencyTransport = {
    onopen: null, onerror: null,
    addEventListener: (name, callback) => source.addEventListener(name, callback),
    start: () => {}, close: () => { source.close(); },
  };
  source.onopen = () => result.onopen?.();
  source.onerror = () => result.onerror?.();
  return result;
}
