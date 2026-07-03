/** Phases of the Fake Artist game */
export type FAPhase =
  | "roleAssignment"
  | "drawing1"
  | "drawing2"
  | "voting"
  | "result";

/** A single point on the canvas (normalized 0-1) */
export interface FAPoint {
  x: number;
  y: number;
}

/** A completed stroke */
export interface FAStroke {
  playerId: string;
  color: string;
  points: FAPoint[];
  round: 1 | 2;
}

/** Player info with color */
export interface FAPlayer {
  id: string;
  name: string;
  color: string;
}

/** Client state from getState */
export interface FAClientState {
  phase: FAPhase;
  word: string | null;
  isFakeArtist: boolean;
  myColor: string;
  players: FAPlayer[];
  turnOrder: string[];
  currentTurnIndex: number;
  currentPlayerId: string;
  isMyTurn: boolean;
  strokes: FAStroke[];
  turnTimeRemaining: number;
  votes: Record<string, string>;
  accusedId: string | null;
  fakeArtistId: string | null;
  fakeArtistGuess: string | null;
  fakeArtistWon: boolean | null;
  round: 1 | 2;
}
