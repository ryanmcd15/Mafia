export interface Statement {
  text: string; // 1-200 chars
  isLie: boolean;
}

export interface StatementSet {
  playerId: string;
  playerName: string;
  statements: Statement[]; // exactly 3
}

export interface TwoTruthsOneLieState {
  phase: "submission" | "play" | "reveal" | "scores";
  currentPresenter: string | null;
  currentStatements: string[] | null; // shuffled text only (no isLie)
  votes: Record<string, number>; // playerId -> statement index voted
  scores: Record<string, number>; // playerId -> total score
  roundNumber: number;
  totalRounds: number;
  voteTimeRemaining: number;
}
