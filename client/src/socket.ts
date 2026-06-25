import { io, Socket } from "socket.io-client";

/**
 * Singleton Socket.io client instance.
 * Uses exponential backoff: 1s, 2s, 4s, 8s, capped at 15s.
 * Connects via the Vite proxy (/socket.io -> http://localhost:3000).
 */
const socket: Socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 15000,
  reconnectionAttempts: Infinity,
});

export default socket;
