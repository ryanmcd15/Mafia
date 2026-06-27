// client/src/store/types.ts

export enum PlatformPhase {
  Lobby = "Lobby",
  GameSelection = "GameSelection",
  ActiveGame = "ActiveGame",
  GameResults = "GameResults",
}

export interface PlatformPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  disconnectedAt?: number | null; // timestamp as number for client, optional since server may omit
  color: string;
}

export interface GameModuleConfig {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
}

export interface PlatformStore {
  // Connection
  isConnected: boolean;
  disconnectedAt: number | null;

  // Room
  roomCode: string | null;
  platformPhase: PlatformPhase | null;
  players: PlatformPlayer[];
  myPlayer: PlatformPlayer | null;

  // Game selection
  availableGames: GameModuleConfig[];
  activeGameId: string | null;

  // Game results (from last completed game)
  gameResults: unknown | null;

  // Errors
  error: string | null;
}
