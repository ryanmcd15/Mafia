import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import { Statement, StatementSet, TwoTruthsOneLieState } from "./types.js";

/**
 * Two Truths One Lie Game Module
 *
 * Phases:
 * 1. Submission — each player submits exactly 3 statements (2 truths, 1 lie).
 * 2. Play — one player's statements are presented in shuffled order; others vote on the lie.
 * 3. Reveal — the lie is revealed, points awarded.
 * 4. Scores — final scoreboard shown when all rounds complete.
 *
 * Requirements: 8.1–8.7, 9.1–9.8, 10.1–10.4
 */
export class TwoTruthsOneLieModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "two-truths-one-lie",
    name: "2 Truths 1 Lie",
    minPlayers: 3,
    maxPlayers: 10,
    description:
      "Each player submits two truths and one lie. Others vote to identify the lie. Earn points for correct guesses!",
  };

  private context: GameModuleContext | null = null;
  private phase: TwoTruthsOneLieState["phase"] = "submission";
  private scores: Record<string, number> = {};
  private votes: Record<string, number> = {};
  private submittedSets: Map<string, StatementSet> = new Map();
  private presentationOrder: string[] = [];
  private currentRoundIndex: number = 0;
  private currentShuffledStatements: Statement[] | null = null;
  private voteTimer: ReturnType<typeof setTimeout> | null = null;
  private voteCountdownInterval: ReturnType<typeof setInterval> | null = null;
  private voteTimeRemaining: number = 0;

  private static readonly VOTE_DURATION_MS = 45_000;

  /**
   * Initialize game: set submission phase, emit gamePhaseChanged.
   */
  start(context: GameModuleContext): void {
    this.context = context;
    this.phase = "submission";
    this.scores = {};
    this.votes = {};
    this.submittedSets = new Map();
    this.presentationOrder = [];
    this.currentRoundIndex = 0;
    this.currentShuffledStatements = null;
    this.voteTimeRemaining = 0;

    const players = context.getPlayers();
    for (const p of players) {
      this.scores[p.id] = 0;
    }

    context.emitToRoom("ttolPhaseChanged", {
      phase: "submission",
    });
  }

  /**
   * Route incoming events.
   */
  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.context) return;

    switch (eventType) {
      case "submitStatements":
        this.handleSubmitStatements(socketId, payload as { statements: Array<{ text: string; isLie: boolean }> });
        break;
      case "submitLieVote":
        this.handleSubmitLieVote(socketId, payload as { statementIndex: number });
        break;
      case "nextRound":
        this.handleNextRound(socketId);
        break;
      default:
        break;
    }
  }

  /**
   * Return current game state for reconnection.
   * Hides lie identity during play phase (voting).
   */
  getState(_socketId: string): unknown {
    const currentPresenter = this.getCurrentPresenterId();

    const state: TwoTruthsOneLieState = {
      phase: this.phase,
      currentPresenter,
      currentStatements: this.phase === "play" || this.phase === "reveal"
        ? this.getShuffledTexts()
        : null,
      votes: this.phase === "reveal" ? { ...this.votes } : {},
      scores: { ...this.scores },
      roundNumber: this.currentRoundIndex + 1,
      totalRounds: this.presentationOrder.length || this.getExpectedTotalRounds(),
      voteTimeRemaining: this.voteTimeRemaining,
    };

    return state;
  }

  /**
   * Handle player disconnect: count as abstain for active votes.
   * Check if all remaining connected voters have voted.
   */
  handleDisconnect(socketId: string): void {
    if (!this.context) return;

    if (this.phase === "play") {
      // Check if all remaining connected voters have voted
      this.checkAllVotesIn();
    }
  }

  /**
   * Handle permanent player removal after 60s timeout.
   * Check if all remaining connected voters have voted.
   */
  handlePlayerRemoval(socketId: string): void {
    if (!this.context) return;

    if (this.phase === "play") {
      this.checkAllVotesIn();
    }
  }

  /**
   * Clear any active timers.
   */
  end(): void {
    this.clearTimers();
    this.context = null;
    this.submittedSets = new Map();
    this.presentationOrder = [];
    this.currentShuffledStatements = null;
    this.scores = {};
    this.votes = {};
  }

  // ─── Private Event Handlers ─────────────────────────────────────────

  private handleSubmitStatements(
    socketId: string,
    payload: { statements: Array<{ text: string; isLie: boolean }> }
  ): void {
    if (!this.context) return;
    if (this.phase !== "submission") return;

    // Reject if already submitted
    if (this.submittedSets.has(socketId)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You have already submitted your statements.",
      });
      return;
    }

    const { statements } = payload;

    // Validate exactly 3 statements
    if (!Array.isArray(statements) || statements.length !== 3) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You must submit exactly 3 statements.",
      });
      return;
    }

    // Validate each statement text (1-200 chars)
    for (const stmt of statements) {
      if (!stmt.text || typeof stmt.text !== "string" || stmt.text.length < 1 || stmt.text.length > 200) {
        this.context.emitToPlayer(socketId, "error", {
          message: "Each statement must be between 1 and 200 characters.",
        });
        return;
      }
    }

    // Validate exactly 1 lie
    const lieCount = statements.filter((s) => s.isLie).length;
    if (lieCount !== 1) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You must mark exactly 1 statement as the lie.",
      });
      return;
    }

    // Find the player name
    const players = this.context.getPlayers();
    const player = players.find((p) => p.id === socketId);
    if (!player) return;

    const statementSet: StatementSet = {
      playerId: socketId,
      playerName: player.name,
      statements: statements.map((s) => ({ text: s.text, isLie: s.isLie })),
    };

    this.submittedSets.set(socketId, statementSet);

    this.context.emitToRoom("playerSubmitted", {
      playerId: socketId,
      playerName: player.name,
      submittedCount: this.submittedSets.size,
      totalPlayers: players.filter((p) => p.isConnected).length,
    });

    // Auto-transition to play when all connected players have submitted
    this.checkAllSubmitted();
  }

  private handleSubmitLieVote(
    socketId: string,
    payload: { statementIndex: number }
  ): void {
    if (!this.context) return;
    if (this.phase !== "play") return;

    const { statementIndex } = payload;

    // Validate vote index
    if (typeof statementIndex !== "number" || statementIndex < 0 || statementIndex > 2) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Vote must be a statement index (0, 1, or 2).",
      });
      return;
    }

    // Presenter cannot vote on their own statements
    const currentPresenter = this.getCurrentPresenterId();
    if (socketId === currentPresenter) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You cannot vote on your own statements.",
      });
      return;
    }

    // Reject duplicate votes
    if (socketId in this.votes) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You have already voted this round.",
      });
      return;
    }

    this.votes[socketId] = statementIndex;

    this.context.emitToRoom("voteReceived", {
      playerId: socketId,
      votesIn: Object.keys(this.votes).length,
      totalEligible: this.getEligibleVoterCount(),
    });

    // Check if all eligible voters have voted
    this.checkAllVotesIn();
  }

  private handleNextRound(socketId: string): void {
    if (!this.context) return;
    if (this.phase !== "reveal") return;

    // Only host can advance
    const players = this.context.getPlayers();
    const hostId = players[0]?.id;
    if (socketId !== hostId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Only the host can advance to the next round.",
      });
      return;
    }

    this.currentRoundIndex++;

    // Check if all rounds are complete
    if (this.currentRoundIndex >= this.presentationOrder.length) {
      this.endGame();
      return;
    }

    // Start the next round
    this.startPlayRound();
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private checkAllSubmitted(): void {
    if (!this.context) return;
    if (this.phase !== "submission") return;

    const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);
    const allSubmitted = connectedPlayers.every((p) => this.submittedSets.has(p.id));

    if (allSubmitted && connectedPlayers.length >= this.config.minPlayers) {
      this.transitionToPlay();
    }
  }

  private transitionToPlay(): void {
    if (!this.context) return;

    // Set presentation order (order of submission or player list order)
    this.presentationOrder = Array.from(this.submittedSets.keys());
    this.currentRoundIndex = 0;
    this.phase = "play";

    // Don't emit separate phase change — startPlayRound emits everything
    this.startPlayRound();
  }

  private startPlayRound(): void {
    if (!this.context) return;

    this.phase = "play";
    this.votes = {};

    const presenterId = this.presentationOrder[this.currentRoundIndex];
    const statementSet = this.submittedSets.get(presenterId);
    if (!statementSet) return;

    // Shuffle statements (must differ from submission order)
    this.currentShuffledStatements = this.shuffleStatements(statementSet.statements);

    this.voteTimeRemaining = 45;

    this.context.emitToRoom("roundStarted", {
      roundNumber: this.currentRoundIndex + 1,
      totalRounds: this.presentationOrder.length,
      presenterId: statementSet.playerId,
      presenterName: statementSet.playerName,
      statements: this.currentShuffledStatements.map((s) => s.text),
      voteTimeRemaining: this.voteTimeRemaining,
    });

    // Start 45-second voting timer
    this.startVoteTimer();
  }

  private startVoteTimer(): void {
    this.clearTimers();

    this.voteCountdownInterval = setInterval(() => {
      this.voteTimeRemaining--;
      if (this.voteTimeRemaining <= 0) {
        if (this.voteCountdownInterval) {
          clearInterval(this.voteCountdownInterval);
          this.voteCountdownInterval = null;
        }
      }
    }, 1000);

    this.voteTimer = setTimeout(() => {
      this.clearTimers();
      this.revealLie();
    }, TwoTruthsOneLieModule.VOTE_DURATION_MS);
  }

  private clearTimers(): void {
    if (this.voteTimer) {
      clearTimeout(this.voteTimer);
      this.voteTimer = null;
    }
    if (this.voteCountdownInterval) {
      clearInterval(this.voteCountdownInterval);
      this.voteCountdownInterval = null;
    }
  }

  private checkAllVotesIn(): void {
    if (!this.context) return;
    if (this.phase !== "play") return;

    const eligibleCount = this.getEligibleVoterCount();
    const votedCount = Object.keys(this.votes).length;

    if (votedCount >= eligibleCount) {
      this.clearTimers();
      this.revealLie();
    }
  }

  private revealLie(): void {
    if (!this.context) return;
    if (!this.currentShuffledStatements) return;

    this.phase = "reveal";

    // Find the lie index in shuffled order
    const lieIndex = this.currentShuffledStatements.findIndex((s) => s.isLie);

    // Award points for correct guesses
    const correctVoters: string[] = [];
    for (const [playerId, votedIndex] of Object.entries(this.votes)) {
      if (votedIndex === lieIndex) {
        this.scores[playerId] = (this.scores[playerId] ?? 0) + 1;
        correctVoters.push(playerId);
      }
    }

    const presenterId = this.getCurrentPresenterId();
    const presenterSet = this.submittedSets.get(presenterId!);

    this.context.emitToRoom("lieRevealed", {
      lieIndex,
      lieText: this.currentShuffledStatements[lieIndex]?.text ?? "",
      correctVoters,
      scores: { ...this.scores },
      presenterName: presenterSet?.playerName ?? "",
      roundNumber: this.currentRoundIndex + 1,
      totalRounds: this.presentationOrder.length,
    });
  }

  private endGame(): void {
    if (!this.context) return;

    this.phase = "scores";
    this.clearTimers();

    // Build sorted scoreboard (descending)
    const scoreboard = Object.entries(this.scores)
      .map(([playerId, score]) => {
        const players = this.context!.getPlayers();
        const player = players.find((p) => p.id === playerId);
        return {
          playerId,
          playerName: player?.name ?? "Unknown",
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    this.context.emitToRoom("ttolPhaseChanged", { phase: "scores" });

    this.context.signalGameOver({
      game: "two-truths-one-lie",
      scoreboard,
    });
  }

  private getCurrentPresenterId(): string | null {
    if (this.presentationOrder.length === 0) return null;
    if (this.currentRoundIndex >= this.presentationOrder.length) return null;
    return this.presentationOrder[this.currentRoundIndex];
  }

  private getShuffledTexts(): string[] | null {
    if (!this.currentShuffledStatements) return null;
    return this.currentShuffledStatements.map((s) => s.text);
  }

  private getExpectedTotalRounds(): number {
    if (!this.context) return 0;
    return this.context.getPlayers().filter((p) => p.isConnected).length;
  }

  private getEligibleVoterCount(): number {
    if (!this.context) return 0;

    const currentPresenter = this.getCurrentPresenterId();
    const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);

    // Eligible voters: connected players who are NOT the presenter
    return connectedPlayers.filter((p) => p.id !== currentPresenter).length;
  }

  /**
   * Shuffle statements using Fisher-Yates algorithm.
   * Ensures shuffled order differs from the original submission order.
   */
  private shuffleStatements(statements: Statement[]): Statement[] {
    const shuffled = [...statements];
    let attempts = 0;
    const maxAttempts = 10;

    do {
      // Fisher-Yates shuffle
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      attempts++;
    } while (this.isSameOrder(statements, shuffled) && attempts < maxAttempts);

    // If after max attempts it's still the same (extremely unlikely with 3 items),
    // just do a simple rotation
    if (this.isSameOrder(statements, shuffled)) {
      return [statements[1], statements[2], statements[0]];
    }

    return shuffled;
  }

  private isSameOrder(original: Statement[], shuffled: Statement[]): boolean {
    return original.every((stmt, i) => stmt.text === shuffled[i].text && stmt.isLie === shuffled[i].isLie);
  }
}
