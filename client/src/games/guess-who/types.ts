/**
 * Guess Who — Client-side types
 */

export type GWPhase = "upload" | "pick" | "play" | "gameOver";

export interface GWPhoto {
  id: string;
  dataUrl: string;
  uploadedBy: string;
}

export interface GWClientState {
  phase: GWPhase;
  mode: "1v1" | "2v2";
  photos: GWPhoto[];
  mySideId: string;
  myPick: string | null;
  opponentHasPicked: boolean;
  activeSideIndex: number;
  isMyTurn: boolean;
  winner: string | null;
  winnerPlayerIds: string[];
  winnerPickId: string | null;
  loserPickId: string | null;
  teamMates: string[];
}
