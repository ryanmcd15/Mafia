import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import { SpyfallState, SPYFALL_LOCATIONS } from "./types.js";

/**
 * Spyfall Game Module
 *
 * One player is secretly the spy and doesn't know the location.
 * All other players know the location but not who the spy is.
 * Players ask each other questions to identify the spy, while
 * the spy tries to figure out the location.
 *
 * Phases:
 * 1. Question — players take turns asking/answering questions
 * 2. Voting — players vote on who they think the spy is
 *
 * Requirements: 11.1–11.6, 12.1–12.6, 13.1–13.9, 14.1–14.5, 19.2, 19.3
 */
export class SpyfallModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "spyfall",
    name: "Spyfall",
    minPlayers: 4,
    maxPlayers: 10,
    description:
      "One player is the spy and must figure out the secret location while others try to identify the spy through clever questions.",
  };

  private context: GameModuleContext | null = null;
  private phase: "question" | "voting" = "question";
  private spyId: string = "";
  private location: string = "";
  private turnOrder: string[] = [];
  private currentTurnIndex: number = 0;
  private currentTarget: string | null = null;
  private turnsCompleted: Map<string, number> = new Map();

  private votes: Map<string, string> = new Map(); // voterId -> accusedId
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  private roundTimerInterval: ReturnType<typeof setInterval> | null = null;
  private voteTimer: ReturnType<typeof setTimeout> | null = null;
  private voteTimerInterval: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private roundTimeRemaining: number = 480; // seconds
  private voteTimeRemaining: number = 30;
  private roundDuration: number = 480; // configurable default

  /**
   * Start the game: assign spy, pick location, determine turn order, start timer.
   */
  start(context: GameModuleContext): void {
    this.context = context;

    const players = context.getPlayers();

    // Randomly select spy
    const spyIndex = Math.floor(Math.random() * players.length);
    this.spyId = players[spyIndex].id;

    // Randomly select location
    const locationIndex = Math.floor(
      Math.random() * SPYFALL_LOCATIONS.length
    );
    this.location = SPYFALL_LOCATIONS[locationIndex];

    // Randomly determine turn order (shuffle)
    this.turnOrder = players.map((p) => p.id);
    this.shuffleArray(this.turnOrder);

    this.currentTurnIndex = 0;
    this.currentTarget = null;
    this.phase = "question";

    // Initialize turns completed tracking
    this.turnsCompleted = new Map();
    for (const p of players) {
      this.turnsCompleted.set(p.id, 0);
    }

    // Reset votes
    this.votes = new Map();

    // Emit roleAssigned to each player
    for (const player of players) {
      if (player.id === this.spyId) {
        context.emitToPlayer(player.id, "roleAssigned", {
          isSpy: true,
          location: null,
          allLocations: [...SPYFALL_LOCATIONS],
        });
      } else {
        context.emitToPlayer(player.id, "roleAssigned", {
          isSpy: false,
          location: this.location,
          allLocations: [...SPYFALL_LOCATIONS],
        });
      }
    }

    // Start round timer
    this.roundTimeRemaining = this.roundDuration;
    this.startRoundTimer();

    // Emit turnStarted with first questioner
    const firstQuestioner = this.turnOrder[this.currentTurnIndex];
    const firstQuestionerPlayer = context.getPlayers().find((p) => p.id === firstQuestioner);
    context.emitToRoom("turnStarted", {
      questioner: firstQuestioner,
      questionerName: firstQuestionerPlayer?.name ?? "Unknown",
    });
  }

  /**
   * Route incoming events based on type.
   */
  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.context) return;

    switch (eventType) {
      case "selectTarget":
        this.handleSelectTarget(socketId, payload as { targetId: string });
        break;
      case "answerComplete":
        this.handleAnswerComplete(socketId);
        break;
      case "callVote":
        this.handleCallVote(socketId);
        break;
      case "submitVote":
        this.handleSubmitVote(socketId, payload as { accusedId: string });
        break;
      case "spyGuess":
        this.handleSpyGuess(socketId, payload as { location: string });
        break;
      default:
        break;
    }
  }

  /**
   * Return current game state personalized per player.
   */
  getState(socketId: string): unknown {
    const isSpy = socketId === this.spyId;

    const state: SpyfallState = {
      phase: this.phase,
      isSpy,
      location: isSpy ? null : this.location,
      allLocations: [...SPYFALL_LOCATIONS],
      currentQuestioner: this.turnOrder[this.currentTurnIndex] ?? "",
      currentTarget: this.currentTarget,
      timeRemaining:
        this.phase === "question"
          ? this.roundTimeRemaining
          : this.voteTimeRemaining,
      turnOrder: [...this.turnOrder],
    };

    return state;
  }

  /**
   * Handle player disconnect.
   * - If current questioner: 10s grace, then skip
   * - During voting: abstain
   */
  handleDisconnect(socketId: string): void {
    if (!this.context) return;

    const currentQuestioner = this.turnOrder[this.currentTurnIndex];

    if (
      this.phase === "question" &&
      socketId === currentQuestioner
    ) {
      // Start 10s grace period, then skip
      this.clearDisconnectTimer();
      this.disconnectTimer = setTimeout(() => {
        this.disconnectTimer = null;
        // Check if still disconnected
        const players = this.context?.getPlayers();
        const player = players?.find((p) => p.id === socketId);
        if (player && !player.isConnected) {
          this.advanceTurn();
        }
      }, 10_000);
    }

    // During voting: their vote simply won't be counted (abstain)
    // No special handling needed — they just won't submit a vote
  }

  /**
   * Handle permanent player removal after 60s timeout.
   * Remove from turn order and advance if it was their turn.
   */
  handlePlayerRemoval(socketId: string): void {
    if (!this.context) return;

    // Clear any pending disconnect timer for this player
    this.clearDisconnectTimer();

    // Remove from turn order
    const turnIndex = this.turnOrder.indexOf(socketId);
    if (turnIndex !== -1) {
      this.turnOrder.splice(turnIndex, 1);
      this.turnsCompleted.delete(socketId);

      // Adjust currentTurnIndex if needed
      if (this.turnOrder.length === 0) return;
      if (turnIndex < this.currentTurnIndex) {
        this.currentTurnIndex--;
      } else if (turnIndex === this.currentTurnIndex) {
        // They were the current questioner — adjust index to stay valid
        if (this.currentTurnIndex >= this.turnOrder.length) {
          this.currentTurnIndex = 0;
        }
        // Emit new turn
        if (this.phase === "question") {
          const nextQ = this.turnOrder[this.currentTurnIndex];
          const nextQPlayer = this.context.getPlayers().find((p) => p.id === nextQ);
          this.context.emitToRoom("turnStarted", {
            questioner: nextQ,
            questionerName: nextQPlayer?.name ?? "Unknown",
          });
        }
      }
    }

    // During voting: remove their vote if any (they abstain)
    this.votes.delete(socketId);

    // Check if all remaining connected players have voted
    if (this.phase === "voting") {
      const players = this.context.getPlayers();
      const connectedPlayers = players.filter((p) => p.isConnected);
      if (this.votes.size >= connectedPlayers.length) {
        this.tallyVotes();
      }
    }
  }

  /**
   * Clean up all timers.
   */
  end(): void {
    this.clearRoundTimer();
    this.clearVoteTimer();
    this.clearDisconnectTimer();
    this.context = null;
  }

  // ─── Private Event Handlers ─────────────────────────────────────────

  private handleSelectTarget(
    socketId: string,
    payload: { targetId: string }
  ): void {
    if (!this.context) return;
    if (this.phase !== "question") return;

    const currentQuestioner = this.turnOrder[this.currentTurnIndex];

    // Validate: only current questioner can select target
    if (socketId !== currentQuestioner) {
      this.context.emitToPlayer(socketId, "error", {
        message: "It's not your turn to ask a question.",
      });
      return;
    }

    // Validate: target must be a valid player and not self
    const players = this.context.getPlayers();
    const targetExists = players.some((p) => p.id === payload.targetId);
    if (!targetExists || payload.targetId === socketId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Invalid target selection.",
      });
      return;
    }

    this.currentTarget = payload.targetId;

    this.context.emitToRoom("questionTarget", {
      questioner: currentQuestioner,
      target: payload.targetId,
    });
  }

  private handleAnswerComplete(socketId: string): void {
    if (!this.context) return;
    if (this.phase !== "question") return;

    // Only the current target can signal answer complete
    if (socketId !== this.currentTarget) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You are not the current target.",
      });
      return;
    }

    this.advanceTurn();
  }

  private handleCallVote(_socketId: string): void {
    if (!this.context) return;
    if (this.phase !== "question") return;

    this.transitionToVoting();
  }

  private handleSubmitVote(
    socketId: string,
    payload: { accusedId: string }
  ): void {
    if (!this.context) return;
    if (this.phase !== "voting") return;

    // Validate: player hasn't already voted
    if (this.votes.has(socketId)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You have already voted.",
      });
      return;
    }

    // Validate: accused is a valid player
    const players = this.context.getPlayers();
    const accusedExists = players.some((p) => p.id === payload.accusedId);
    if (!accusedExists) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Invalid vote target.",
      });
      return;
    }

    this.votes.set(socketId, payload.accusedId);

    this.context.emitToRoom("voteSubmitted", {
      playerId: socketId,
      votesReceived: this.votes.size,
    });

    // Check if all connected players have voted
    const connectedPlayers = players.filter((p) => p.isConnected);
    if (this.votes.size >= connectedPlayers.length) {
      this.tallyVotes();
    }
  }

  private handleSpyGuess(
    socketId: string,
    payload: { location: string }
  ): void {
    if (!this.context) return;

    // Only spy can guess
    if (socketId !== this.spyId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Only the spy can guess the location.",
      });
      return;
    }

    const correct =
      payload.location.toLowerCase() === this.location.toLowerCase();

    const outcome = correct ? "Spy Wins" : "Players Win";

    this.clearRoundTimer();
    this.clearVoteTimer();

    this.context.emitToRoom("gameOver", {
      outcome,
      spy: this.spyId,
      location: this.location,
      reason: correct
        ? "The spy correctly guessed the location!"
        : "The spy guessed incorrectly.",
    });

    this.context.signalGameOver({
      game: "spyfall",
      outcome,
      spy: this.spyId,
      location: this.location,
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private advanceTurn(): void {
    if (!this.context) return;

    this.clearDisconnectTimer();

    // Record that current questioner completed a turn
    const currentQuestioner = this.turnOrder[this.currentTurnIndex];
    const currentCount = this.turnsCompleted.get(currentQuestioner) ?? 0;
    this.turnsCompleted.set(currentQuestioner, currentCount + 1);

    // Reset target
    this.currentTarget = null;

    // Move to next in turn order
    this.currentTurnIndex =
      (this.currentTurnIndex + 1) % this.turnOrder.length;

    // Ensure fairness: if the next player has more turns than the minimum,
    // skip ahead to find a player with the fewest turns
    this.balanceTurnOrder();

    // Skip disconnected players (with check to avoid infinite loop)
    const players = this.context.getPlayers();
    let attempts = 0;
    while (attempts < this.turnOrder.length) {
      const nextId = this.turnOrder[this.currentTurnIndex];
      const nextPlayer = players.find((p) => p.id === nextId);
      if (nextPlayer && nextPlayer.isConnected) break;
      this.currentTurnIndex =
        (this.currentTurnIndex + 1) % this.turnOrder.length;
      attempts++;
    }

    const advancedQ = this.turnOrder[this.currentTurnIndex];
    const advancedQPlayer = this.context.getPlayers().find((p) => p.id === advancedQ);
    this.context.emitToRoom("turnStarted", {
      questioner: advancedQ,
      questionerName: advancedQPlayer?.name ?? "Unknown",
    });
  }

  /**
   * Ensure each player gets equal turns before anyone gets an extra turn.
   */
  private balanceTurnOrder(): void {
    const minTurns = Math.min(...this.turnsCompleted.values());
    const nextId = this.turnOrder[this.currentTurnIndex];
    const nextTurns = this.turnsCompleted.get(nextId) ?? 0;

    // If the next player already has more than the minimum turns,
    // find someone with fewer turns
    if (nextTurns > minTurns) {
      for (let i = 0; i < this.turnOrder.length; i++) {
        const idx = (this.currentTurnIndex + i) % this.turnOrder.length;
        const playerId = this.turnOrder[idx];
        const turns = this.turnsCompleted.get(playerId) ?? 0;
        if (turns <= minTurns) {
          this.currentTurnIndex = idx;
          return;
        }
      }
    }
  }

  private transitionToVoting(): void {
    if (!this.context) return;

    this.phase = "voting";
    this.votes = new Map();
    this.currentTarget = null;

    // Clear round timer
    this.clearRoundTimer();
    this.clearDisconnectTimer();

    // Start 30-second vote timer
    this.voteTimeRemaining = 30;
    this.startVoteTimer();

    this.context.emitToRoom("spyfallPhaseChanged", {
      phase: "voting",
      timeRemaining: this.voteTimeRemaining,
    });
  }

  private tallyVotes(): void {
    if (!this.context) return;

    this.clearVoteTimer();

    // Count votes per accused
    const voteCounts = new Map<string, number>();
    for (const accusedId of this.votes.values()) {
      voteCounts.set(accusedId, (voteCounts.get(accusedId) ?? 0) + 1);
    }

    // Find player with most votes
    let maxVotes = 0;
    let accused: string | null = null;
    let isTie = false;

    for (const [playerId, count] of voteCounts.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        accused = playerId;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    // Determine strict majority
    const connectedPlayers = this.context
      .getPlayers()
      .filter((p) => p.isConnected);
    const majorityThreshold = Math.floor(connectedPlayers.length / 2) + 1;

    let outcome: string;
    let reason: string;

    if (isTie || maxVotes < majorityThreshold) {
      // No strict majority — spy wins
      outcome = "Spy Wins";
      reason = "No majority reached — the spy escapes!";
    } else if (accused === this.spyId) {
      // Accused is the spy — players win
      outcome = "Players Win";
      reason = "The spy was correctly identified!";
    } else {
      // Accused is not the spy — spy wins
      outcome = "Spy Wins";
      reason = "An innocent player was accused — the spy escapes!";
    }

    this.context.emitToRoom("gameOver", {
      outcome,
      spy: this.spyId,
      location: this.location,
      accused,
      reason,
      votes: Object.fromEntries(this.votes),
    });

    this.context.signalGameOver({
      game: "spyfall",
      outcome,
      spy: this.spyId,
      location: this.location,
      accused,
    });
  }

  private startRoundTimer(): void {
    this.roundTimerInterval = setInterval(() => {
      this.roundTimeRemaining--;
      if (this.roundTimeRemaining <= 0) {
        this.clearRoundTimer();
        // Time's up — transition to voting
        this.transitionToVoting();
      }
    }, 1000);

    this.roundTimer = setTimeout(() => {
      // Backup: ensure transition happens even if interval drift
      this.clearRoundTimer();
      if (this.phase === "question") {
        this.transitionToVoting();
      }
    }, this.roundDuration * 1000 + 500);
  }

  private startVoteTimer(): void {
    this.voteTimerInterval = setInterval(() => {
      this.voteTimeRemaining--;
      if (this.voteTimeRemaining <= 0) {
        this.clearVoteTimer();
        this.tallyVotes();
      }
    }, 1000);

    this.voteTimer = setTimeout(() => {
      this.clearVoteTimer();
      if (this.phase === "voting") {
        this.tallyVotes();
      }
    }, 30_000 + 500);
  }

  private clearRoundTimer(): void {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    if (this.roundTimerInterval) {
      clearInterval(this.roundTimerInterval);
      this.roundTimerInterval = null;
    }
  }

  private clearVoteTimer(): void {
    if (this.voteTimer) {
      clearTimeout(this.voteTimer);
      this.voteTimer = null;
    }
    if (this.voteTimerInterval) {
      clearInterval(this.voteTimerInterval);
      this.voteTimerInterval = null;
    }
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
