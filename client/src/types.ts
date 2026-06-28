/**
 * Client-side TypeScript types mirroring the server definitions.
 * These are separate copies to avoid monorepo import complexity.
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
  id: string;
  name: string;
  role: Role | null;
  isAlive: boolean;
  isHost: boolean;
  isConnected: boolean;
  disconnectedAt: string | null;
  isReady?: boolean;
  color?: string;
}

export interface NarrationResult {
  segments: string[];
  eliminatedPlayerId: string | null;
  wasSaved: boolean;
}

export interface VoteResult {
  eliminatedPlayerId: string | null;
  voteCounts: Record<string, number>;
  isTie: boolean;
  tiedPlayers: string[];
}

export interface WinCondition {
  winner: "Civilians" | "Killer";
  reason: string;
}

export interface GameStore {
  roomCode: string | null;
  phase: GamePhase | null;
  myPlayer: Player | null;
  players: Player[];
  role: Role | null;
  error: string | null;
  narration: NarrationResult | null;
  voteResult: VoteResult | null;
  winCondition: WinCondition | null;
  isConnected: boolean;
  disconnectedAt: number | null;
  voteHistory: Array<{ round: number; votes: Record<string, string> }>;
  round: number;
  medicFeedback: string | null;
}
