/**
 * Platform-level TypeScript interfaces and enums for the Party Games Platform.
 * Game-specific types live in their respective game module directories.
 */

/** Platform-level phases (not game-specific) */
export enum PlatformPhase {
  Lobby = "Lobby",
  GameSelection = "GameSelection",
  ActiveGame = "ActiveGame",
  GameResults = "GameResults",
}

/** Platform-level player (game-agnostic) */
export interface PlatformPlayer {
  id: string;               // Socket ID
  name: string;             // 1-32 chars (host), 1-20 chars (join)
  isHost: boolean;
  isConnected: boolean;
  disconnectedAt: Date | null;
  color: string;
}

/** Platform-level room */
export interface PlatformRoom {
  roomCode: string;         // 6-char uppercase alphanumeric
  hostId: string;           // Socket ID of host
  players: Map<string, PlatformPlayer>;
  platformPhase: PlatformPhase;
  activeGameId: string | null;
  createdAt: Date;
}

/** Game module interface config */
export interface GameModuleConfig {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
}

/** Context passed to game modules */
export interface GameModuleContext {
  emitToRoom: (event: string, payload: unknown) => void;
  emitToPlayer: (socketId: string, event: string, payload: unknown) => void;
  signalGameOver: (results: unknown) => void;
  getPlayers: () => Array<{ id: string; name: string; isConnected: boolean }>;
}

/** Game module interface — each game implements this */
export interface GameModule {
  readonly config: GameModuleConfig;
  start(context: GameModuleContext): void;
  handleEvent(socketId: string, eventType: string, payload: unknown): void;
  getState(socketId: string): unknown;
  handleDisconnect(socketId: string): void;
  /** Handle permanent player removal after 60s disconnection timeout */
  handlePlayerRemoval?(socketId: string): void;
  end(): void;
}
