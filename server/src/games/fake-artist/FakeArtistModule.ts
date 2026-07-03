import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import {
  FAPhase,
  FAPoint,
  FAStroke,
  FAClientState,
  FA_COLORS,
  FA_WORDS,
} from "./types.js";

const TURN_TIMER_MS = 30_000; // 30 seconds per turn
const VOTE_TIMER_MS = 30_000; // 30 seconds for voting
const GUESS_TIMER_MS = 30_000; // 30 seconds for word guess

/**
 * Fake Artist Game Module
 *
 * One player is the Fake Artist who doesn't know the word.
 * All players draw one stroke per round (2 rounds total).
 * After drawing, players vote on who they think is the Fake Artist.
 * If caught, the Fake Artist gets one chance to guess the word.
 */
export class FakeArtistModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "fake-artist",
    name: "Fake Artist",
    minPlayers: 3,
    maxPlayers: 8,
    description:
      "One player doesn't know the word — can they fake their way through drawing? 🎨",
  };

  private context: GameModuleContext | null = null;
  private phase: FAPhase = "roleAssignment";
  private word: string = "";
  private fakeArtistId: string = "";
  private turnOrder: string[] = [];
  private currentTurnIndex: number = 0;
  private round: 1 | 2 = 1;
  private strokes: FAStroke[] = [];
  private currentStrokePoints: FAPoint[] = [];
  private playerColors: Map<string, string> = new Map();
  private votes: Map<string, string> = new Map(); // voterId -> accusedId
  private accusedId: string | null = null;
  private fakeArtistGuess: string | null = null;
  private fakeArtistWon: boolean | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimerStart: number = 0;

  // ─── GameModule Interface ───────────────────────────────────────────

  start(context: GameModuleContext): void {
    this.context = context;
    this.resetState();

    const players = context.getPlayers();

    // Assign colors
    players.forEach((p, i) => {
      this.playerColors.set(p.id, FA_COLORS[i % FA_COLORS.length]);
    });

    // Pick a random word
    this.word = FA_WORDS[Math.floor(Math.random() * FA_WORDS.length)];

    // Pick a random fake artist
    const fakeIndex = Math.floor(Math.random() * players.length);
    this.fakeArtistId = players[fakeIndex].id;

    // Set turn order (shuffled)
    this.turnOrder = players.map((p) => p.id).sort(() => Math.random() - 0.5);

    // Send role assignments to each player
    for (const player of players) {
      const isFake = player.id === this.fakeArtistId;
      context.emitToPlayer(player.id, "faRoleAssigned", {
        word: isFake ? null : this.word,
        isFakeArtist: isFake,
        color: this.playerColors.get(player.id),
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          color: this.playerColors.get(p.id),
        })),
        turnOrder: this.turnOrder,
      });
    }

    // Emit phase change
    context.emitToRoom("faPhaseChanged", { phase: "roleAssignment" });

    // Auto-transition to drawing round 1 after 5 seconds
    setTimeout(() => {
      this.startDrawingPhase(1);
    }, 5000);
  }

  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.context) return;

    switch (eventType) {
      case "drawPoint":
        this.handleDrawPoint(socketId, payload as { x: number; y: number });
        break;
      case "strokeDone":
        this.handleStrokeDone(socketId);
        break;
      case "submitVote":
        this.handleSubmitVote(socketId, payload as { accusedId: string });
        break;
      case "submitWordGuess":
        this.handleWordGuess(socketId, payload as { word: string });
        break;
      default:
        break;
    }
  }

  getState(socketId: string): FAClientState | null {
    if (!this.context) return null;

    const isFake = socketId === this.fakeArtistId;
    const players = this.context.getPlayers();
    const currentPlayerId = this.turnOrder[this.currentTurnIndex] ?? "";

    // Calculate remaining time
    let turnTimeRemaining = 30;
    if (this.turnTimerStart > 0) {
      const elapsed = (Date.now() - this.turnTimerStart) / 1000;
      turnTimeRemaining = Math.max(0, 30 - elapsed);
    }

    return {
      phase: this.phase,
      word: isFake ? null : this.word,
      isFakeArtist: isFake,
      myColor: this.playerColors.get(socketId) ?? FA_COLORS[0],
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        color: this.playerColors.get(p.id) ?? FA_COLORS[0],
      })),
      turnOrder: this.turnOrder,
      currentTurnIndex: this.currentTurnIndex,
      currentPlayerId,
      isMyTurn: currentPlayerId === socketId,
      strokes: this.strokes,
      turnTimeRemaining: Math.round(turnTimeRemaining),
      votes: this.phase === "result" ? Object.fromEntries(this.votes) : {},
      accusedId: this.accusedId,
      fakeArtistId: this.phase === "result" ? this.fakeArtistId : null,
      fakeArtistGuess: this.fakeArtistGuess,
      fakeArtistWon: this.fakeArtistWon,
      round: this.round,
    };
  }

  handleDisconnect(_socketId: string): void {
    // Game continues — if it's their turn, auto-advance after timer
  }

  handlePlayerRemoval(socketId: string): void {
    if (!this.context) return;

    // Remove from turn order
    this.turnOrder = this.turnOrder.filter((id) => id !== socketId);
    this.playerColors.delete(socketId);

    // If it was their turn, advance
    if (this.turnOrder.length > 0 && this.currentTurnIndex >= this.turnOrder.length) {
      this.currentTurnIndex = 0;
    }
  }

  end(): void {
    this.clearTurnTimer();
    this.context = null;
    this.resetState();
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private resetState(): void {
    this.phase = "roleAssignment";
    this.word = "";
    this.fakeArtistId = "";
    this.turnOrder = [];
    this.currentTurnIndex = 0;
    this.round = 1;
    this.strokes = [];
    this.currentStrokePoints = [];
    this.playerColors = new Map();
    this.votes = new Map();
    this.accusedId = null;
    this.fakeArtistGuess = null;
    this.fakeArtistWon = null;
    this.clearTurnTimer();
  }

  private startDrawingPhase(round: 1 | 2): void {
    if (!this.context) return;

    this.round = round;
    this.phase = round === 1 ? "drawing1" : "drawing2";
    this.currentTurnIndex = 0;
    this.currentStrokePoints = [];

    this.context.emitToRoom("faPhaseChanged", {
      phase: this.phase,
      round,
      turnOrder: this.turnOrder,
      currentTurnIndex: 0,
      currentPlayerId: this.turnOrder[0],
    });

    this.startTurnTimer();
  }

  private startTurnTimer(): void {
    if (!this.context) return;

    this.clearTurnTimer();
    this.turnTimerStart = Date.now();
    this.currentStrokePoints = [];

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    this.context.emitToRoom("faTurnStarted", {
      currentTurnIndex: this.currentTurnIndex,
      currentPlayerId,
      round: this.round,
    });

    this.turnTimer = setTimeout(() => {
      // Auto-advance if player is too slow
      this.finishCurrentTurn();
    }, TURN_TIMER_MS);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnTimerStart = 0;
  }

  private handleDrawPoint(socketId: string, payload: { x: number; y: number }): void {
    if (!this.context) return;
    if (this.phase !== "drawing1" && this.phase !== "drawing2") return;

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (socketId !== currentPlayerId) return;

    if (!payload || typeof payload.x !== "number" || typeof payload.y !== "number") return;

    const point = { x: payload.x, y: payload.y };
    this.currentStrokePoints.push(point);

    // Broadcast real-time stroke point to all other players
    this.context.emitToRoom("faStrokePoint", {
      playerId: socketId,
      color: this.playerColors.get(socketId),
      point,
    });
  }

  private handleStrokeDone(socketId: string): void {
    if (!this.context) return;
    if (this.phase !== "drawing1" && this.phase !== "drawing2") return;

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (socketId !== currentPlayerId) return;

    this.finishCurrentTurn();
  }

  private finishCurrentTurn(): void {
    if (!this.context) return;

    this.clearTurnTimer();

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    const color = this.playerColors.get(currentPlayerId) ?? FA_COLORS[0];

    // Save stroke (even if empty — player might have run out of time)
    if (this.currentStrokePoints.length > 0) {
      const stroke: FAStroke = {
        playerId: currentPlayerId,
        color,
        points: [...this.currentStrokePoints],
        round: this.round,
      };
      this.strokes.push(stroke);
    }

    // Emit stroke complete
    this.context.emitToRoom("faStrokeComplete", {
      playerId: currentPlayerId,
      color,
      points: [...this.currentStrokePoints],
      round: this.round,
    });

    this.currentStrokePoints = [];

    // Advance to next player
    this.currentTurnIndex++;

    if (this.currentTurnIndex >= this.turnOrder.length) {
      // End of round
      if (this.round === 1) {
        // Start round 2
        this.startDrawingPhase(2);
      } else {
        // Start voting
        this.startVotingPhase();
      }
    } else {
      // Next player's turn
      this.startTurnTimer();
    }
  }

  private startVotingPhase(): void {
    if (!this.context) return;

    this.phase = "voting";
    this.votes = new Map();

    this.context.emitToRoom("faPhaseChanged", {
      phase: "voting",
    });

    // Vote timer
    this.turnTimerStart = Date.now();
    this.turnTimer = setTimeout(() => {
      this.tallyVotes();
    }, VOTE_TIMER_MS);
  }

  private handleSubmitVote(socketId: string, payload: { accusedId: string }): void {
    if (!this.context) return;
    if (this.phase !== "voting") return;

    if (!payload || !payload.accusedId) return;

    // "skip" is valid — means no vote
    this.votes.set(socketId, payload.accusedId);

    const players = this.context.getPlayers().filter((p) => p.isConnected);
    if (this.votes.size >= players.length) {
      // Everyone has voted
      this.clearTurnTimer();
      this.tallyVotes();
    }
  }

  private tallyVotes(): void {
    if (!this.context) return;

    // Count votes (exclude "skip")
    const voteCounts = new Map<string, number>();
    for (const [, accusedId] of this.votes) {
      if (accusedId === "skip") continue;
      voteCounts.set(accusedId, (voteCounts.get(accusedId) ?? 0) + 1);
    }

    // Find the player with most votes
    let maxVotes = 0;
    let accusedId: string | null = null;
    let tie = false;

    for (const [playerId, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        accusedId = playerId;
        tie = false;
      } else if (count === maxVotes) {
        tie = true;
      }
    }

    // Need majority (more than half of connected players)
    const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);
    const majority = Math.floor(connectedPlayers.length / 2) + 1;
    const hasMajority = maxVotes >= majority && !tie;

    this.accusedId = hasMajority ? accusedId : null;

    this.context.emitToRoom("faVoteResult", {
      votes: Object.fromEntries(this.votes),
      accusedId: this.accusedId,
      caught: hasMajority && this.accusedId === this.fakeArtistId,
    });

    if (hasMajority && this.accusedId === this.fakeArtistId) {
      // Fake artist was caught — give them a chance to guess
      this.startGuessPhase();
    } else {
      // Fake artist was NOT caught — fake artist wins
      this.fakeArtistWon = true;
      this.endGame();
    }
  }

  private startGuessPhase(): void {
    if (!this.context) return;

    this.phase = "result";

    this.context.emitToRoom("faPhaseChanged", {
      phase: "result",
      caught: true,
      fakeArtistId: this.fakeArtistId,
      waitingForGuess: true,
    });

    // Give fake artist 30 seconds to guess
    this.turnTimerStart = Date.now();
    this.turnTimer = setTimeout(() => {
      // Timeout — fake artist didn't guess, other players win
      this.fakeArtistWon = false;
      this.fakeArtistGuess = null;
      this.endGame();
    }, GUESS_TIMER_MS);
  }

  private handleWordGuess(socketId: string, payload: { word: string }): void {
    if (!this.context) return;
    if (this.phase !== "result") return;
    if (socketId !== this.fakeArtistId) return;

    this.clearTurnTimer();

    const guess = (payload?.word ?? "").trim().toLowerCase();
    this.fakeArtistGuess = payload?.word ?? "";

    if (guess === this.word.toLowerCase()) {
      // Correct guess — fake artist wins!
      this.fakeArtistWon = true;
    } else {
      // Wrong guess — other players win
      this.fakeArtistWon = false;
    }

    this.endGame();
  }

  private endGame(): void {
    if (!this.context) return;

    this.phase = "result";

    const players = this.context.getPlayers();
    const fakeArtistName =
      players.find((p) => p.id === this.fakeArtistId)?.name ?? "Unknown";

    this.context.emitToRoom("faGuessResult", {
      fakeArtistId: this.fakeArtistId,
      fakeArtistName,
      word: this.word,
      fakeArtistGuess: this.fakeArtistGuess,
      fakeArtistWon: this.fakeArtistWon,
      accusedId: this.accusedId,
      votes: Object.fromEntries(this.votes),
    });

    this.context.emitToRoom("faPhaseChanged", {
      phase: "result",
      caught: this.accusedId === this.fakeArtistId,
      fakeArtistId: this.fakeArtistId,
      fakeArtistWon: this.fakeArtistWon,
      waitingForGuess: false,
    });

    // Determine winners
    const winnerPlayerIds = this.fakeArtistWon
      ? [this.fakeArtistId]
      : players.filter((p) => p.id !== this.fakeArtistId).map((p) => p.id);

    this.context.signalGameOver({
      game: "fake-artist",
      winner: this.fakeArtistWon ? "fake-artist" : "artists",
      winnerPlayerIds,
      word: this.word,
      fakeArtistId: this.fakeArtistId,
    });
  }
}
