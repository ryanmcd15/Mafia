import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import { Prompt, TruthOrDareState } from "./types.js";
import { randomUUID } from "crypto";

/**
 * Truth or Dare Game Module
 *
 * Two phases:
 * 1. Submission — players submit truth/dare prompts, then mark themselves ready.
 * 2. Play — host spins a wheel to select a player, that player picks truth or dare,
 *    a random prompt from the pool is revealed.
 *
 * Requirements: 5.1–5.8, 6.1–6.9, 7.1–7.4
 */
export class TruthOrDareModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "truth-or-dare",
    name: "Truth or Dare",
    minPlayers: 2,
    maxPlayers: 10,
    description:
      "Players submit truth and dare prompts, then take turns spinning a wheel to see who answers next.",
  };

  private context: GameModuleContext | null = null;
  private state: TruthOrDareState | null = null;

  /** Track how many prompts each player has submitted */
  private submissionCounts: Map<string, number> = new Map();

  /**
   * Initialize the game: set host, start in submission phase.
   */
  start(context: GameModuleContext): void {
    this.context = context;

    const players = context.getPlayers();
    const hostId = players[0]?.id ?? "";

    this.state = {
      phase: "submission",
      promptPool: [],
      readyPlayers: [],
      currentSelectedPlayer: null,
      currentPrompt: null,
      currentCategory: null,
      hostId,
    };

    this.submissionCounts = new Map();
    for (const p of players) {
      this.submissionCounts.set(p.id, 0);
    }

    context.emitToRoom("truthOrDareStarted", {
      phase: "submission",
      hostId,
    });
  }

  /**
   * Route incoming events based on type.
   */
  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.state || !this.context) return;

    switch (eventType) {
      case "submitPrompt":
        this.handleSubmitPrompt(socketId, payload as { text: string; category: "truth" | "dare" });
        break;
      case "playerReady":
        this.handlePlayerReady(socketId);
        break;
      case "spinWheel":
        this.handleSpinWheel(socketId);
        break;
      case "choiceSelected":
        this.handleChoiceSelected(socketId, payload as { category: "truth" | "dare" });
        break;
      case "nextTurn":
        this.handleNextTurn(socketId);
        break;
      case "endGame":
        this.handleEndGame(socketId);
        break;
      default:
        break;
    }
  }

  /**
   * Return current game state for reconnection.
   */
  getState(_socketId: string): unknown {
    if (!this.state) return null;

    return {
      phase: this.state.phase,
      promptPool: this.state.promptPool,
      readyPlayers: this.state.readyPlayers,
      currentSelectedPlayer: this.state.currentSelectedPlayer,
      currentPrompt: this.state.currentPrompt,
      currentCategory: this.state.currentCategory,
      hostId: this.state.hostId,
      submissionCounts: Object.fromEntries(this.submissionCounts),
    };
  }

  /**
   * Handle player disconnect: retain submitted prompts, keep ready status.
   * Check if all remaining connected players are ready to transition.
   */
  handleDisconnect(socketId: string): void {
    if (!this.state || !this.context) return;

    // Prompts are retained (no removal from promptPool).
    // Ready status is kept — do not remove from readyPlayers.

    // If in submission phase, check if all remaining connected players are ready
    if (this.state.phase === "submission") {
      this.checkAllReady();
    }
  }

  /**
   * Handle permanent player removal after 60s timeout.
   * Retain submitted content; check if phase transitions are needed.
   */
  handlePlayerRemoval(socketId: string): void {
    if (!this.state || !this.context) return;

    // If in submission phase, check if all remaining connected players are ready
    if (this.state.phase === "submission") {
      this.checkAllReady();
    }
  }

  /**
   * Clean up all state.
   */
  end(): void {
    this.state = null;
    this.context = null;
    this.submissionCounts = new Map();
  }

  // ─── Private Event Handlers ─────────────────────────────────────────

  private handleSubmitPrompt(
    socketId: string,
    payload: { text: string; category: "truth" | "dare" }
  ): void {
    if (!this.state || !this.context) return;
    if (this.state.phase !== "submission") return;

    const { text, category } = payload;

    // Validate text length (1-280 chars)
    if (!text || text.length < 1 || text.length > 280) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Prompt text must be between 1 and 280 characters.",
      });
      return;
    }

    // Validate category
    if (category !== "truth" && category !== "dare") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Category must be 'truth' or 'dare'.",
      });
      return;
    }

    const prompt: Prompt = {
      id: randomUUID(),
      text,
      category,
      submittedBy: socketId,
    };

    this.state.promptPool.push(prompt);

    // Track submission count
    const currentCount = this.submissionCounts.get(socketId) ?? 0;
    this.submissionCounts.set(socketId, currentCount + 1);

    this.context.emitToRoom("promptSubmitted", {
      playerId: socketId,
      count: currentCount + 1,
      totalPrompts: this.state.promptPool.length,
    });
  }

  private handlePlayerReady(socketId: string): void {
    if (!this.state || !this.context) return;
    if (this.state.phase !== "submission") return;

    // Require at least 1 prompt before allowing ready
    const count = this.submissionCounts.get(socketId) ?? 0;
    if (count < 1) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You must submit at least 1 prompt before readying up.",
      });
      return;
    }

    // Add to ready list if not already there
    if (!this.state.readyPlayers.includes(socketId)) {
      this.state.readyPlayers.push(socketId);
    }

    this.context.emitToRoom("playerReadyUpdate", {
      playerId: socketId,
      readyPlayers: this.state.readyPlayers,
    });

    this.checkAllReady();
  }

  private handleSpinWheel(socketId: string): void {
    if (!this.state || !this.context) return;
    if (this.state.phase !== "play") return;

    // Only host can spin
    if (socketId !== this.state.hostId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Only the host can spin the wheel.",
      });
      return;
    }

    // Randomly select from connected players
    const players = this.context.getPlayers().filter((p) => p.isConnected);
    if (players.length === 0) return;

    const selectedIndex = Math.floor(Math.random() * players.length);
    const selectedPlayer = players[selectedIndex];

    this.state.currentSelectedPlayer = selectedPlayer.id;
    this.state.currentCategory = null;
    this.state.currentPrompt = null;

    this.context.emitToRoom("wheelResult", {
      selectedPlayer: selectedPlayer.id,
      selectedPlayerName: selectedPlayer.name,
    });
  }

  private handleChoiceSelected(
    socketId: string,
    payload: { category: "truth" | "dare" }
  ): void {
    if (!this.state || !this.context) return;
    if (this.state.phase !== "play") return;

    // Only the currently selected player can choose
    if (socketId !== this.state.currentSelectedPlayer) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Only the selected player can choose truth or dare.",
      });
      return;
    }

    const { category } = payload;
    if (category !== "truth" && category !== "dare") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Category must be 'truth' or 'dare'.",
      });
      return;
    }

    this.state.currentCategory = category;

    // Select random prompt from matching category
    let matchingPrompts = this.state.promptPool.filter(
      (p) => p.category === category
    );

    // If chosen category is empty, notify the player to choose the other
    let substituted = false;
    if (matchingPrompts.length === 0) {
      this.context.emitToRoom("promptRevealed", {
        prompt: null,
        category,
        selectedPlayerName: this.context.getPlayers().find(
          (p) => p.id === this.state!.currentSelectedPlayer
        )?.name ?? "Unknown",
        substituted: false,
        message: `No ${category}s remaining! Pick ${category === "truth" ? "dare" : "truth"} instead.`,
        promptsRemaining: this.state.promptPool.length,
      });
      // Reset so they can pick again
      this.state.currentCategory = null;
      return;
    }

    const randomIndex = Math.floor(Math.random() * matchingPrompts.length);
    const selectedPrompt = matchingPrompts[randomIndex];

    this.state.currentPrompt = selectedPrompt;

    // Remove prompt from pool (one-time use)
    this.state.promptPool = this.state.promptPool.filter(
      (p) => p.id !== selectedPrompt.id
    );

    this.context.emitToRoom("promptRevealed", {
      prompt: selectedPrompt,
      category: selectedPrompt.category,
      selectedPlayerName: this.context.getPlayers().find(
        (p) => p.id === this.state!.currentSelectedPlayer
      )?.name ?? "Unknown",
      substituted,
      promptsRemaining: this.state.promptPool.length,
    });
  }

  private handleNextTurn(socketId: string): void {
    if (!this.state || !this.context) return;
    if (this.state.phase !== "play") return;

    // Only host can advance
    if (socketId !== this.state.hostId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Only the host can advance to the next turn.",
      });
      return;
    }

    // Reset turn state
    this.state.currentSelectedPlayer = null;
    this.state.currentPrompt = null;
    this.state.currentCategory = null;

    this.context.emitToRoom("nextTurnStarted", {
      promptsRemaining: this.state.promptPool.length,
    });
  }

  private handleEndGame(socketId: string): void {
    if (!this.state || !this.context) return;

    // Only host can end
    if (socketId !== this.state.hostId) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Only the host can end the game.",
      });
      return;
    }

    this.context.signalGameOver({
      game: "truth-or-dare",
      promptsUsed:
        this.state.promptPool.length === 0
          ? "all"
          : `${this.state.promptPool.length} remaining`,
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private checkAllReady(): void {
    if (!this.state || !this.context) return;
    if (this.state.phase !== "submission") return;

    const connectedPlayers = this.context
      .getPlayers()
      .filter((p) => p.isConnected);

    // All connected players must be ready
    const allReady = connectedPlayers.every((p) =>
      this.state!.readyPlayers.includes(p.id)
    );

    if (allReady && connectedPlayers.length >= this.config.minPlayers) {
      this.transitionToPlay();
    }
  }

  private transitionToPlay(): void {
    if (!this.state || !this.context) return;

    this.state.phase = "play";

    this.context.emitToRoom("todPhaseChanged", {
      phase: "play",
      state: {
        readyPlayers: this.state.readyPlayers,
        currentSelectedPlayer: this.state.currentSelectedPlayer,
        currentPrompt: this.state.currentPrompt,
        currentCategory: this.state.currentCategory,
      },
      promptCount: this.state.promptPool.length,
    });
  }
}
