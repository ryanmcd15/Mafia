/**
 * Mafia game-specific TypeScript interfaces and enums.
 * These types are used exclusively by the Mafia game module.
 */

export enum GamePhase {
  Lobby = "Lobby",
  RoleReveal = "RoleReveal",
  Night = "Night",
  Morning = "Morning",
  Discussion = "Discussion",
  Voting = "Voting",
  Results = "Results",
  GameOver = "GameOver",
}

export enum Role {
  Killer = "Killer",
  Medic = "Medic",
  Civilian = "Civilian",
}

export interface Player {
  id: string; // Socket ID
  name: string; // 1-32 chars (host), 1-20 chars (join)
  role: Role | null; // Assigned during RoleReveal, null in Lobby
  isAlive: boolean; // Alive status
  isHost: boolean; // Host flag
  isConnected: boolean; // Connection status
  disconnectedAt: Date | null; // Timestamp of disconnect, null if connected
  isReady: boolean; // Ready status in Lobby
  color: string; // Player color for visual tracking
}

export interface GameState {
  nightActions: {
    killTarget: string | null; // Player ID targeted by Killer
    saveTarget: string | null; // Player ID protected by Medic
  };
  votes: Map<string, string>; // voterId -> targetId
  eliminatedPlayers: string[]; // Array of eliminated player IDs
  phaseTimer: NodeJS.Timeout | null; // Active phase timer
  roleAcknowledgements: Set<string>; // Player IDs who acknowledged role
  narrationCompletes: Set<string>; // Player IDs who finished narration
  voteHistory: Array<{
    round: number;
    votes: Record<string, string>; // voterName -> targetName (or "Skip")
  }>;
  round: number; // Current round number
}

export interface Room {
  roomCode: string; // 6-char uppercase alphanumeric
  hostId: string; // Socket ID of host
  players: Map<string, Player>; // Map of socketId -> Player
  phase: GamePhase; // Current game phase
  gameState: GameState | null; // Null in Lobby, populated when game starts
  createdAt: Date; // Room creation timestamp
}

export interface WinCondition {
  winner: "Civilians" | "Killer";
  reason: string;
}

export interface NarrationResult {
  segments: string[]; // Array of narrative text strings
  eliminatedPlayerId: string | null; // Player killed, null if saved or no kill
  wasSaved: boolean; // True if save matched kill
}

export interface VoteResult {
  eliminatedPlayerId: string | null; // Most-voted player, null if tie
  voteCounts: Map<string, number>; // targetId -> vote count
  isTie: boolean; // True if multiple players tied
  tiedPlayers: string[]; // Array of tied player IDs
}
