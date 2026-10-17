import type { Socket } from 'socket.io-client';

export type EmergencyTransport = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener: (name: string, callback: () => void) => void;
  start: () => void;
  close: () => void;
};

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
  const transport = process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT
    ?? (process.env.NODE_ENV === 'development' ? 'socket.io' : 'sse');
  if (transport !== 'socket.io' && transport !== 'sse') throw new Error('Unsupported emergency transport');
  if (transport === 'socket.io') {
    const { io } = await import('socket.io-client');
    const socket = io(origin || window.location.origin, {
      path: '/api/events/v1/socket.io', transports: ['websocket'],
      autoConnect: false, reconnection: false, withCredentials: true,
      forceNew: true, multiplex: false, timeout: 10_000,
    });
    return socketEmergencyTransport(socket);
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
