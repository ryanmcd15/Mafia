/**
 * Guess Who — Server-side types
 */

export type GWPhase = "upload" | "pick" | "play" | "gameOver";

export interface GWPhoto {
  id: string;
  dataUrl: string;
  uploadedBy: string;
}

export interface GWSide {
  sideId: string;
  playerIds: string[];
  pickedPhotoId: string | null;
}

export interface GWState {
  phase: GWPhase;
  mode: "1v1" | "2v2";
  photos: GWPhoto[];
  sides: GWSide[];
  activeSideIndex: number;
  winner: string | null;
  winnerPlayerIds: string[];
}

/** Personalized client state returned by getState */
export interface GWClientState {
  phase: GWPhase;
  mode: "1v1" | "2v2";
  photos: GWPhoto[];
  mySideId: string;
  myPick: string | null;         // photo ID my side picked (null if not yet)
  opponentHasPicked: boolean;    // whether opponent has picked (don't reveal which)
  activeSideIndex: number;
  isMyTurn: boolean;
  winner: string | null;
  winnerPlayerIds: string[];
  winnerPickId: string | null;
  loserPickId: string | null;
  teamMates: string[];
}
