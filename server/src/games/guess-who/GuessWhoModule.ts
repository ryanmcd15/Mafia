import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import { GWClientState, GWPhase, GWPhoto, GWSide } from "./types.js";

const REQUIRED_PHOTOS = 24;

/**
 * Guess Who Game Module
 *
 * A photo-based deduction game. Players upload photos, each side secretly picks
 * one as "their person", then they alternate turns asking yes/no questions and
 * eliminating photos until someone makes a final guess.
 *
 * Supports 1v1 (2 players) and 2v2 (3-4 players, random team assignment).
 */
export class GuessWhoModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "guess-who",
    name: "Guess Who",
    minPlayers: 2,
    maxPlayers: 4,
    description:
      "Upload photos, pick your person, then ask yes/no questions to guess your opponent's pick! 🔍",
  };

  private context: GameModuleContext | null = null;
  private phase: GWPhase = "upload";
  private mode: "1v1" | "2v2" = "1v1";
  private photos: GWPhoto[] = [];
  private sides: GWSide[] = [];
  private activeSideIndex: number = 0;
  private winner: string | null = null;
  private winnerPlayerIds: string[] = [];

  // ─── GameModule Interface ───────────────────────────────────────────

  start(context: GameModuleContext): void {
    this.context = context;
    this.phase = "upload";
    this.photos = [];
    this.winner = null;
    this.winnerPlayerIds = [];
    this.activeSideIndex = 0;

    const players = context.getPlayers();
    const playerCount = players.length;

    if (playerCount === 2) {
      this.mode = "1v1";
      this.sides = [
        { sideId: players[0].id, playerIds: [players[0].id], pickedPhotoId: null },
        { sideId: players[1].id, playerIds: [players[1].id], pickedPhotoId: null },
      ];
    } else {
      this.mode = "2v2";
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const half = Math.ceil(shuffled.length / 2);
      const side0Players = shuffled.slice(0, half);
      const side1Players = shuffled.slice(half);
      this.sides = [
        {
          sideId: `team-${side0Players.map((p) => p.id).join("-")}`,
          playerIds: side0Players.map((p) => p.id),
          pickedPhotoId: null,
        },
        {
          sideId: `team-${side1Players.map((p) => p.id).join("-")}`,
          playerIds: side1Players.map((p) => p.id),
          pickedPhotoId: null,
        },
      ];
    }

    context.emitToRoom("gwPhaseChanged", {
      phase: "upload",
      teams: this.sides.map((s) => ({ sideId: s.sideId, playerIds: s.playerIds })),
      mode: this.mode,
    });
  }

  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.context) return;

    switch (eventType) {
      case "uploadPhoto":
        this.handleUploadPhoto(socketId, payload as { dataUrl: string });
        break;
      case "pickPerson":
        this.handlePickPerson(socketId, payload as { photoId: string });
        break;
      case "endTurn":
        this.handleEndTurn(socketId);
        break;
      case "makeGuess":
        this.handleMakeGuess(socketId, payload as { photoId: string });
        break;
      default:
        break;
    }
  }

  getState(socketId: string): GWClientState | null {
    if (!this.context) return null;

    const mySide = this.findSideForPlayer(socketId);
    if (!mySide) return null;

    const opponentSide = this.sides.find((s) => s.sideId !== mySide.sideId) ?? null;

    // In gameOver phase, reveal both picks
    let winnerPickId: string | null = null;
    let loserPickId: string | null = null;
    if (this.phase === "gameOver") {
      const winningSide = this.sides.find((s) => s.sideId === this.winner);
      const losingSide = this.sides.find((s) => s.sideId !== this.winner);
      winnerPickId = winningSide?.pickedPhotoId ?? null;
      loserPickId = losingSide?.pickedPhotoId ?? null;
    }

    return {
      phase: this.phase,
      mode: this.mode,
      photos: this.photos,
      mySideId: mySide.sideId,
      myPick: mySide.pickedPhotoId,
      opponentHasPicked: opponentSide?.pickedPhotoId !== null ?? false,
      activeSideIndex: this.activeSideIndex,
      isMyTurn: this.sides[this.activeSideIndex]?.playerIds.includes(socketId) ?? false,
      winner: this.winner,
      winnerPlayerIds: this.winnerPlayerIds,
      winnerPickId,
      loserPickId,
      teamMates: mySide.playerIds.filter((id) => id !== socketId),
    };
  }

  handleDisconnect(_socketId: string): void {
    // No special handling needed — game continues
  }

  handlePlayerRemoval(socketId: string): void {
    if (!this.context) return;

    for (const side of this.sides) {
      const idx = side.playerIds.indexOf(socketId);
      if (idx !== -1) {
        side.playerIds.splice(idx, 1);
      }
    }
  }

  end(): void {
    this.context = null;
    this.photos = [];
    this.sides = [];
  }

  // ─── Private Event Handlers ─────────────────────────────────────────

  private handleUploadPhoto(socketId: string, payload: { dataUrl: string }): void {
    if (!this.context) return;

    if (this.phase !== "upload") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Cannot upload photos: not in upload phase.",
      });
      return;
    }

    if (this.photos.length >= REQUIRED_PHOTOS) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Photo pool is already full (24/24).",
      });
      return;
    }

    if (!payload || !payload.dataUrl) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Invalid photo payload.",
      });
      return;
    }

    const photo: GWPhoto = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dataUrl: payload.dataUrl,
      uploadedBy: socketId,
    };

    this.photos.push(photo);

    // Broadcast to all players
    this.context.emitToRoom("gwPhotoUploaded", {
      photo,
      count: this.photos.length,
      total: REQUIRED_PHOTOS,
    });

    // Auto-transition when 24 photos reached
    if (this.photos.length >= REQUIRED_PHOTOS) {
      this.transitionToPick();
    }
  }

  private handlePickPerson(socketId: string, payload: { photoId: string }): void {
    if (!this.context) return;

    if (this.phase !== "pick") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Cannot pick: not in pick phase.",
      });
      return;
    }

    const side = this.findSideForPlayer(socketId);
    if (!side) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Player not found on any side.",
      });
      return;
    }

    if (side.pickedPhotoId !== null) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Your side has already picked.",
      });
      return;
    }

    if (!payload || !payload.photoId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Invalid pick payload.",
      });
      return;
    }

    const photoExists = this.photos.some((p) => p.id === payload.photoId);
    if (!photoExists) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Photo not found in pool.",
      });
      return;
    }

    side.pickedPhotoId = payload.photoId;

    // Notify the picking side
    for (const playerId of side.playerIds) {
      this.context.emitToPlayer(playerId, "gwPickConfirmed", {
        sideId: side.sideId,
        photoId: payload.photoId,
      });
    }

    // Notify opponent that this side has picked (without revealing which)
    const opponentSide = this.sides.find((s) => s.sideId !== side.sideId);
    if (opponentSide) {
      for (const playerId of opponentSide.playerIds) {
        this.context.emitToPlayer(playerId, "gwPickConfirmed", {
          sideId: side.sideId,
          photoId: null, // don't reveal
        });
      }
    }

    // Check if both sides have picked
    const allPicked = this.sides.every((s) => s.pickedPhotoId !== null);
    if (allPicked) {
      this.transitionToPlay();
    }
  }

  private handleEndTurn(socketId: string): void {
    if (!this.context) return;

    if (this.phase !== "play") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Cannot end turn: not in play phase.",
      });
      return;
    }

    const activeSide = this.sides[this.activeSideIndex];
    if (!activeSide.playerIds.includes(socketId)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "It is not your side's turn.",
      });
      return;
    }

    this.advanceTurn();
  }

  private handleMakeGuess(socketId: string, payload: { photoId: string }): void {
    if (!this.context) return;

    if (this.phase !== "play") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Cannot guess: not in play phase.",
      });
      return;
    }

    const activeSide = this.sides[this.activeSideIndex];
    if (!activeSide.playerIds.includes(socketId)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "It is not your side's turn.",
      });
      return;
    }

    if (!payload || !payload.photoId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Invalid guess payload.",
      });
      return;
    }

    const opponentSide = this.sides.find((s) => s.sideId !== activeSide.sideId);
    if (!opponentSide) return;

    const isCorrect = payload.photoId === opponentSide.pickedPhotoId;

    if (isCorrect) {
      // Guesser wins
      this.endGame(activeSide, payload.photoId, true);
    } else {
      // Guesser loses
      this.endGame(opponentSide, payload.photoId, false);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private findSideForPlayer(socketId: string): GWSide | undefined {
    return this.sides.find((s) => s.playerIds.includes(socketId));
  }

  private transitionToPick(): void {
    if (!this.context) return;
    this.phase = "pick";
    this.context.emitToRoom("gwPhaseChanged", {
      phase: "pick",
      photoCount: this.photos.length,
    });
  }

  private transitionToPlay(): void {
    if (!this.context) return;
    this.phase = "play";
    // Randomly pick starting side
    this.activeSideIndex = Math.floor(Math.random() * 2);

    this.context.emitToRoom("gwPhaseChanged", {
      phase: "play",
      activeSideIndex: this.activeSideIndex,
    });

    this.context.emitToRoom("gwTurnStarted", {
      activeSideIndex: this.activeSideIndex,
      sideId: this.sides[this.activeSideIndex].sideId,
    });
  }

  private advanceTurn(): void {
    if (!this.context) return;

    this.activeSideIndex = 1 - this.activeSideIndex;

    this.context.emitToRoom("gwTurnStarted", {
      activeSideIndex: this.activeSideIndex,
      sideId: this.sides[this.activeSideIndex].sideId,
    });
  }

  private endGame(winningSide: GWSide, guessedPhotoId: string, correct: boolean): void {
    if (!this.context) return;

    this.phase = "gameOver";
    this.winner = winningSide.sideId;
    this.winnerPlayerIds = [...winningSide.playerIds];

    this.context.emitToRoom("gwGuessResult", {
      correct,
      guessedPhotoId,
      side0Pick: this.sides[0].pickedPhotoId,
      side1Pick: this.sides[1].pickedPhotoId,
    });

    this.context.emitToRoom("gwPhaseChanged", {
      phase: "gameOver",
      winner: this.winner,
      winnerPlayerIds: this.winnerPlayerIds,
      side0Pick: this.sides[0].pickedPhotoId,
      side1Pick: this.sides[1].pickedPhotoId,
    });

    this.context.signalGameOver({
      game: "guess-who",
      winner: this.winner,
      winnerPlayerIds: this.winnerPlayerIds,
    });
  }
}
