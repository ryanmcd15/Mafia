import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import {
  SpiceLevel,
  SecretAdmirerConfig,
  SecretAdmirerState,
  SecretAdmirerClientState,
  RoundMessage,
  RevealData,
  DEFAULT_CONFIG,
  MIN_ROUNDS,
  MAX_ROUNDS,
  MIN_TIMER,
  MAX_TIMER,
  TIMER_STEP,
  MAX_ANSWER_LENGTH,
  MAX_CUSTOM_PROMPT_LENGTH,
  VALID_REACTION_EMOJIS,
} from "./types.js";
import { generateAdmirerCycle } from "./cycleGenerator.js";
import { calculateRoundScores, calculateGuessScores, buildLeaderboard } from "./scoreCalculator.js";
import { calculateAwards } from "./awardsCalculator.js";
import { PromptPool } from "./promptPool.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

/**
 * Secret Admirer Game Module
 *
 * A party game where players are arranged in a secret admirer cycle.
 * Each round, players write anonymous messages to their assigned target
 * based on prompts. At the end, players guess who their secret admirer is.
 *
 * Requirements: 1.1, 1.3, 2.1–2.9, 3.1–3.8
 */
export class SecretAdmirerModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "secret-admirer",
    name: "Secret Admirer",
    minPlayers: 3,
    maxPlayers: 20,
    description:
      "Write anonymous messages to a secret target each round. At the end, guess who your admirer is!",
  };

  private context: GameModuleContext | null = null;
  private hostId: string | null = null;
  private state: SecretAdmirerState = this.createInitialState();
  private promptPool: PromptPool;

  constructor(promptFilePath?: string) {
    const defaultPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "prompts.json"
    );
    this.promptPool = new PromptPool(promptFilePath ?? defaultPath);
  }

  private createInitialState(): SecretAdmirerState {
    return {
      phase: "config",
      config: { ...DEFAULT_CONFIG },
      cycle: new Map(),
      currentRound: 0,
      totalRounds: DEFAULT_CONFIG.rounds,
      usedPrompts: new Set(),
      currentPrompt: null,
      customPromptQueue: new Map(),
      roundMessages: new Map(),
      currentRoundAnswers: new Map(),
      votes: new Map(),
      guesses: new Map(),
      scores: new Map(),
      roundStartTime: null,
      roundTimer: null,
      reactionTimer: null,
      votingTimer: null,
      guessingTimer: null,
    };
  }

  /**
   * Initialize the game: set phase to "config", emit saPhaseChanged.
   */
  start(context: GameModuleContext): void {
    this.context = context;
    this.state = this.createInitialState();

    // Validate and load the prompt pool (Req 13.3, 13.4)
    const validation = this.promptPool.validate();
    if (!validation.valid) {
      context.emitToRoom("saError", {
        message: `Prompt pool validation failed: ${validation.error}`,
      });
    }

    const players = context.getPlayers();
    this.hostId = players.length > 0 ? players[0].id : null;

    context.emitToRoom("saPhaseChanged", {
      phase: this.state.phase,
      config: this.state.config,
    });
  }

  /**
   * Route incoming events to appropriate handlers.
   */
  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.context) return;

    switch (eventType) {
      case "configure":
        this.handleConfigure(socketId, payload);
        break;
      case "startGame":
        this.handleStartGame(socketId);
        break;
      case "submitAnswer":
        this.handleSubmitAnswer(socketId, payload);
        break;
      case "submitCustomPrompt":
        this.handleSubmitCustomPrompt(socketId, payload);
        break;
      case "react":
        this.handleReact(socketId, payload);
        break;
      case "submitVote":
        this.handleSubmitVote(socketId, payload);
        break;
      case "submitGuess":
        this.handleSubmitGuess(socketId, payload);
        break;
      default:
        break;
    }
  }

  /**
   * Return basic client state (phase, config). Full implementation in task 10.1.
   */
  getState(socketId: string): unknown {
    if (!this.context) {
      return { phase: this.state.phase, config: this.state.config };
    }

    const players = this.context.getPlayers();
    const playerNames = new Map<string, string>();
    for (const p of players) {
      playerNames.set(p.id, p.name);
    }

    // --- My target name (only after game starts, Req 3.5) ---
    const myTargetId = this.state.cycle.get(socketId) ?? null;
    const myTargetName = myTargetId ? (playerNames.get(myTargetId) ?? null) : null;

    // --- Time remaining ---
    let timeRemaining = 0;
    if (this.state.roundStartTime && (this.state.phase === "roundActive")) {
      const elapsed = (Date.now() - this.state.roundStartTime) / 1000;
      timeRemaining = Math.max(0, this.state.config.roundTimer - elapsed);
    }

    // --- Submission status ---
    const hasSubmittedAnswer = this.state.currentRoundAnswers.has(socketId);
    const submittedCount = this.state.currentRoundAnswers.size;
    const connectedPlayers = players.filter((p) => p.isConnected);
    const totalPlayers = connectedPlayers.length;

    // --- Messages I've received (anonymous — no author info, Req 5.6) ---
    const myMessages: Array<{
      id: string;
      roundNumber: number;
      text: string;
      reactions: Record<string, number>;
      myReactions: string[];
    }> = [];

    for (const [roundNumber, roundMsgs] of this.state.roundMessages) {
      for (const msg of roundMsgs) {
        // Only include messages targeted at this player with non-blank text
        if (msg.targetId === socketId && msg.text !== "") {
          // Build reaction counts (aggregate only — no identity, Req 6.2)
          const reactions: Record<string, number> = {};
          const myReactions: string[] = [];
          for (const [emoji, reactors] of msg.reactions) {
            reactions[emoji] = reactors.size;
            if (reactors.has(socketId)) {
              myReactions.push(emoji);
            }
          }

          myMessages.push({
            id: msg.id,
            roundNumber,
            text: msg.text,
            reactions,
            myReactions,
          });
        }
      }
    }

    // --- Voting messages (only during voting phase) ---
    let votingMessages: Array<{ id: string; text: string }> | null = null;
    if (this.state.phase === "voting") {
      const roundMsgs = this.state.roundMessages.get(this.state.currentRound) ?? [];
      votingMessages = roundMsgs
        .filter((m) => m.text !== "")
        .map((m) => ({ id: m.id, text: m.text }));
    }

    // --- Has voted ---
    const roundVotes = this.state.votes.get(this.state.currentRound);
    const hasVoted = roundVotes ? roundVotes.has(socketId) : false;

    // --- Guess options (only during guessing phase) ---
    let guessOptions: Array<{ id: string; name: string }> | null = null;
    if (this.state.phase === "guessing") {
      guessOptions = players
        .filter((p) => p.id !== socketId)
        .map((p) => ({ id: p.id, name: p.name }));
    }

    // --- Has guessed (Req 8.8 — never reveal other players' guesses) ---
    const hasGuessed = this.state.guesses.has(socketId);

    // --- Scores (cumulative, visible to all) ---
    const scores: Record<string, number> = Object.fromEntries(this.state.scores);

    // --- Reveal data (only during reveal phase, Req 3.5) ---
    let revealData: RevealData | null = null;
    if (this.state.phase === "reveal") {
      revealData = this.buildRevealData(playerNames, players);
    }

    return {
      phase: this.state.phase,
      config: this.state.config,
      myTargetName,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      currentPrompt: this.state.currentPrompt,
      timeRemaining,
      hasSubmittedAnswer,
      submittedCount,
      totalPlayers,
      myMessages,
      votingMessages,
      hasVoted,
      guessOptions,
      hasGuessed,
      scores,
      revealData,
    };
  }

  /**
   * Handle player disconnect mid-game.
   * - If in roundActive phase and player hasn't submitted: record blank (Req 12.5)
   * - Check if all connected players have submitted → end round early (Req 5.7)
   * - If connected players drop below 3: end game early (Req 12.4)
   * - Retain disconnected player's previously submitted messages and scores (Req 12.3)
   */
  handleDisconnect(socketId: string): void {
    if (!this.context) return;

    // If in roundActive phase and the player hasn't submitted an answer, record blank (Req 12.5)
    if (this.state.phase === "roundActive") {
      if (!this.state.currentRoundAnswers.has(socketId)) {
        this.state.currentRoundAnswers.set(socketId, "");
      }

      // Check if all connected players have now submitted (Req 5.7)
      const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);
      const allSubmitted = connectedPlayers.every((p) =>
        this.state.currentRoundAnswers.has(p.id)
      );
      if (allSubmitted && connectedPlayers.length > 0) {
        this.endRound();
        // After endRound, re-check connected player count for early termination
        this.checkEarlyTermination();
        return;
      }
    }

    // Check if connected players have dropped below 3 → end game early (Req 12.4)
    this.checkEarlyTermination();
  }

  /**
   * Handle permanent player removal (called after 60s disconnection timeout).
   * Same logic as disconnect — record blank, check player count, potentially end game early.
   */
  handlePlayerRemoval(socketId: string): void {
    // Delegate to disconnect logic since the behavior is identical for this game
    this.handleDisconnect(socketId);
  }

  /**
   * Check if connected player count has dropped below 3 and end game early if so.
   * Req 12.4: emit leaderboard with current scores and signal game over.
   */
  private checkEarlyTermination(): void {
    if (!this.context) return;

    const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);
    if (connectedPlayers.length < 3) {
      // Build player name lookup
      const players = this.context.getPlayers();
      const playerNames = new Map<string, string>();
      for (const p of players) {
        playerNames.set(p.id, p.name);
      }

      // Build leaderboard from current scores
      const leaderboard = buildLeaderboard(this.state.scores, playerNames);

      // Calculate awards from whatever data we have so far
      const awards = calculateAwards({
        roundMessages: this.state.roundMessages,
        guesses: this.state.guesses,
        cycle: this.state.cycle,
        playerNames,
      });

      // Emit leaderboard to all remaining players
      this.context.emitToRoom("saRevealData", {
        leaderboard,
        awards,
        earlyTermination: true,
        reason: "Not enough connected players to continue",
      });

      // Signal game over to the platform (Req 12.4)
      this.context.signalGameOver({ leaderboard, awards });

      // Clear all timers and state (Req 12.2)
      this.end();
    }
  }

  /**
   * Clean up timers and null out context.
   */
  end(): void {
    if (this.state.roundTimer) {
      clearTimeout(this.state.roundTimer);
      this.state.roundTimer = null;
    }
    if (this.state.reactionTimer) {
      clearTimeout(this.state.reactionTimer);
      this.state.reactionTimer = null;
    }
    if (this.state.votingTimer) {
      clearTimeout(this.state.votingTimer);
      this.state.votingTimer = null;
    }
    if (this.state.guessingTimer) {
      clearTimeout(this.state.guessingTimer);
      this.state.guessingTimer = null;
    }
    this.context = null;
  }

  // ─── Private Handlers ─────────────────────────────────────────────

  /**
   * Handle configure event: validate host-only access, validate all config fields.
   * Req 2.1–2.9
   */
  private handleConfigure(socketId: string, payload: unknown): void {
    if (!this.context) return;

    // Host-only check (Req 2.8)
    if (socketId !== this.hostId) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Only the host can modify settings",
      });
      return;
    }

    const data = payload as Partial<SecretAdmirerConfig> | null;
    if (!data || typeof data !== "object") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Invalid configuration payload",
      });
      return;
    }

    // Validate rounds (Req 2.2, 2.3)
    if (data.rounds !== undefined) {
      if (
        typeof data.rounds !== "number" ||
        !Number.isInteger(data.rounds) ||
        data.rounds < MIN_ROUNDS ||
        data.rounds > MAX_ROUNDS
      ) {
        this.context.emitToPlayer(socketId, "saError", {
          message: "Rounds must be between 5 and 20",
        });
        return;
      }
    }

    // Validate spiceLevel (Req 2.4)
    if (data.spiceLevel !== undefined) {
      const validLevels: SpiceLevel[] = ["mild", "medium", "hot"];
      if (!validLevels.includes(data.spiceLevel as SpiceLevel)) {
        this.context.emitToPlayer(socketId, "saError", {
          message: "Invalid spice level",
        });
        return;
      }
    }

    // Validate roundTimer (Req 2.7)
    if (data.roundTimer !== undefined) {
      if (
        typeof data.roundTimer !== "number" ||
        data.roundTimer < MIN_TIMER ||
        data.roundTimer > MAX_TIMER ||
        data.roundTimer % TIMER_STEP !== 0
      ) {
        this.context.emitToPlayer(socketId, "saError", {
          message:
            "Timer must be between 30 and 120 seconds in increments of 5",
        });
        return;
      }
    }

    // Validate customPrompts (Req 2.5)
    if (data.customPrompts !== undefined) {
      if (typeof data.customPrompts !== "boolean") {
        this.context.emitToPlayer(socketId, "saError", {
          message: "Custom prompts must be a boolean",
        });
        return;
      }
    }

    // Apply partial config update
    if (data.rounds !== undefined) this.state.config.rounds = data.rounds;
    if (data.spiceLevel !== undefined)
      this.state.config.spiceLevel = data.spiceLevel;
    if (data.roundTimer !== undefined)
      this.state.config.roundTimer = data.roundTimer;
    if (data.customPrompts !== undefined)
      this.state.config.customPrompts = data.customPrompts;

    // Update totalRounds to match config
    this.state.totalRounds = this.state.config.rounds;

    // Emit updated config (Req 2.9)
    this.context.emitToRoom("saPhaseChanged", {
      phase: this.state.phase,
      config: this.state.config,
    });
  }

  /**
   * Handle startGame event: validate host, phase, player count; generate cycle.
   * Req 3.1–3.8
   */
  private handleStartGame(socketId: string): void {
    if (!this.context) return;

    // Host-only check (Req 3.7)
    if (socketId !== this.hostId) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Only the host can start the game",
      });
      return;
    }

    // Must be in config phase (Req 3.8)
    if (this.state.phase !== "config") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Game is already in progress",
      });
      return;
    }

    // Need ≥3 connected players (Req 3.6)
    const players = this.context.getPlayers();
    const connectedPlayers = players.filter((p) => p.isConnected);
    if (connectedPlayers.length < 3) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Need at least 3 players to start",
      });
      return;
    }

    // Generate admirer cycle (Req 3.1–3.3)
    const playerIds = connectedPlayers.map((p) => p.id);
    const cycle = generateAdmirerCycle(playerIds);
    this.state.cycle = cycle;

    // Initialize scores to 0 for all players
    this.state.scores = new Map();
    for (const id of playerIds) {
      this.state.scores.set(id, 0);
    }

    // Send saAssignment per-player with their target info (Req 3.4)
    for (const [admirerId, targetId] of cycle) {
      const targetPlayer = connectedPlayers.find((p) => p.id === targetId);
      this.context.emitToPlayer(admirerId, "saAssignment", {
        targetId,
        targetName: targetPlayer?.name ?? "Unknown",
      });
    }

    // Transition to roundActive
    this.state.phase = "roundActive";
    this.state.currentRound = 1;
    this.state.totalRounds = this.state.config.rounds;

    // Emit phase change
    this.context.emitToRoom("saPhaseChanged", {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      config: this.state.config,
    });

    // Start the first round
    this.startRound();
  }

  // ─── Round Management ──────────────────────────────────────────────

  /**
   * Start a new round: select prompt, emit saRoundStarted, start timer.
   * Req 4.1–4.8, 5.1
   */
  private startRound(): void {
    if (!this.context) return;

    // Select prompt: prefer custom prompt if enabled and queue has entries (Req 4.4, 4.8)
    let selectedPrompt: string | null = null;

    if (this.state.config.customPrompts && this.state.customPromptQueue.size > 0) {
      // Randomly select one custom prompt from the queue (Req 4.8)
      const entries = Array.from(this.state.customPromptQueue.values());
      const idx = Math.floor(Math.random() * entries.length);
      selectedPrompt = entries[idx];
      // Clear the queue after selection
      this.state.customPromptQueue.clear();
    } else {
      // Select from prompt pool (Req 4.1)
      selectedPrompt = this.promptPool.getPrompt(
        this.state.config.spiceLevel,
        this.state.usedPrompts
      );

      // Try fallback if primary level exhausted (Req 4.5)
      if (selectedPrompt === null) {
        selectedPrompt = this.promptPool.getFallbackPrompt(
          this.state.config.spiceLevel,
          this.state.usedPrompts
        );
      }
    }

    // If all prompt sources exhausted, end game early (Req 4.6)
    if (selectedPrompt === null) {
      this.context.signalGameOver({
        reason: "prompts_exhausted",
        scores: Object.fromEntries(this.state.scores),
      });
      return;
    }

    // Track selected prompt to avoid repetition (Req 4.2)
    this.state.usedPrompts.add(selectedPrompt);
    this.state.currentPrompt = selectedPrompt;
    this.state.currentRoundAnswers = new Map();
    this.state.roundStartTime = Date.now();

    // Emit saRoundStarted to all players (Req 5.1)
    this.context.emitToRoom("saRoundStarted", {
      roundNumber: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      prompt: selectedPrompt,
      timeRemaining: this.state.config.roundTimer,
    });

    // Start round timer (Req 5.7 — timer expiry ends round)
    this.state.roundTimer = setTimeout(() => {
      this.endRound();
    }, this.state.config.roundTimer * 1000);
  }

  /**
   * Handle submitAnswer event: validate phase, length, duplicates; store answer.
   * Req 5.2–5.7
   */
  private handleSubmitAnswer(socketId: string, payload: unknown): void {
    if (!this.context) return;

    // Must be in roundActive phase
    if (this.state.phase !== "roundActive") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Cannot submit answer outside of an active round",
      });
      return;
    }

    // Extract text from payload
    const data = payload as { text?: unknown } | null;
    const text = data?.text;

    // Validate text is a string with length 1-500 (Req 5.2, 5.3)
    if (typeof text !== "string" || text.length < 1 || text.length > MAX_ANSWER_LENGTH) {
      this.context.emitToPlayer(socketId, "saError", {
        message: `Answer must be between 1 and ${MAX_ANSWER_LENGTH} characters`,
      });
      return;
    }

    // Reject duplicate submission (Req 5.4)
    if (this.state.currentRoundAnswers.has(socketId)) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "You have already submitted an answer this round",
      });
      return;
    }

    // Store the answer (Req 5.5)
    this.state.currentRoundAnswers.set(socketId, text);

    // Emit progress to room (Req 5.1 progress tracking)
    const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);
    this.context.emitToRoom("saAnswerReceived", {
      playerId: socketId,
      submittedCount: this.state.currentRoundAnswers.size,
      totalPlayers: connectedPlayers.length,
    });

    // If all connected players have submitted, end round early (Req 5.7)
    if (this.state.currentRoundAnswers.size >= connectedPlayers.length) {
      this.endRound();
    }
  }

  /**
   * Handle submitCustomPrompt event: validate custom prompts enabled and length.
   * Req 4.7
   */
  private handleSubmitCustomPrompt(socketId: string, payload: unknown): void {
    if (!this.context) return;

    // Validate custom prompts are enabled
    if (!this.state.config.customPrompts) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Custom prompts are not enabled",
      });
      return;
    }

    // Extract prompt from payload
    const data = payload as { prompt?: unknown } | null;
    const prompt = data?.prompt;

    // Validate prompt string length 1-300 (Req 4.7)
    if (typeof prompt !== "string" || prompt.length < 1 || prompt.length > MAX_CUSTOM_PROMPT_LENGTH) {
      this.context.emitToPlayer(socketId, "saError", {
        message: `Custom prompt must be between 1 and ${MAX_CUSTOM_PROMPT_LENGTH} characters`,
      });
      return;
    }

    // Store in custom prompt queue
    this.state.customPromptQueue.set(socketId, prompt);
  }

  /**
   * End the current round: clear timer, deliver messages, transition to reactions.
   * Req 5.7, 5.8, 5.9, 6.6
   */
  private endRound(): void {
    if (!this.context) return;

    // Clear the round timer
    if (this.state.roundTimer) {
      clearTimeout(this.state.roundTimer);
      this.state.roundTimer = null;
    }

    // For each player in the cycle, record blank if they didn't submit (Req 5.9)
    for (const [admirerId] of this.state.cycle) {
      if (!this.state.currentRoundAnswers.has(admirerId)) {
        this.state.currentRoundAnswers.set(admirerId, "");
      }
    }

    // Build RoundMessage objects and deliver messages to targets
    const roundMessages: RoundMessage[] = [];
    let messageIndex = 0;

    for (const [admirerId, targetId] of this.state.cycle) {
      const text = this.state.currentRoundAnswers.get(admirerId) ?? "";
      const roundStartTime = this.state.roundStartTime ?? Date.now();

      const message: RoundMessage = {
        id: `msg-${this.state.currentRound}-${messageIndex}`,
        authorId: admirerId,
        targetId,
        text,
        submittedAt: Date.now() - roundStartTime,
        reactions: new Map(),
      };

      roundMessages.push(message);

      // Deliver non-blank messages to the target (Req 5.8)
      if (text !== "") {
        this.context.emitToPlayer(targetId, "saMessageDelivered", {
          message: `💌 Anonymous admirer says... ${text}`,
          messageId: message.id,
          roundNumber: this.state.currentRound,
        });
      }

      messageIndex++;
    }

    // Store messages for this round
    this.state.roundMessages.set(this.state.currentRound, roundMessages);

    // Transition to reactions phase
    this.state.phase = "reactions";

    // Emit phase change
    this.context.emitToRoom("saPhaseChanged", {
      phase: "reactions",
    });

    // Start 60s reaction timer (Req 6.6)
    this.state.reactionTimer = setTimeout(() => {
      this.endReactionPhase();
    }, 60_000);
  }

  /**
   * End the reaction phase: clear timer, present messages for voting, start voting timer.
   * Req 6.6, 7.1, 7.4
   */
  private endReactionPhase(): void {
    if (!this.context) return;

    // Clear the reaction timer
    if (this.state.reactionTimer) {
      clearTimeout(this.state.reactionTimer);
    }
    this.state.reactionTimer = null;

    // Transition to voting phase
    this.state.phase = "voting";

    // Initialize the votes map for this round
    this.state.votes.set(this.state.currentRound, new Map());

    // Gather all non-blank messages from the current round (Req 7.1)
    const roundMessages = this.state.roundMessages.get(this.state.currentRound) ?? [];
    const nonBlankMessages = roundMessages.filter((m) => m.text !== "");

    // Emit voting started with anonymous messages (id and text only)
    this.context.emitToRoom("saVotingStarted", {
      messages: nonBlankMessages.map((m) => ({ id: m.id, text: m.text })),
      timeRemaining: 30,
    });

    // Emit phase changed
    this.context.emitToRoom("saPhaseChanged", {
      phase: "voting",
    });

    // Start 30-second voting timer (Req 7.4)
    this.state.votingTimer = setTimeout(() => {
      this.endVotingPhase();
    }, 30_000);
  }

  /**
   * Handle react event: validate phase, emoji, target, duplicates.
   * Req 6.1–6.6
   */
  private handleReact(socketId: string, payload: unknown): void {
    if (!this.context) return;

    // Must be in reactions phase
    if (this.state.phase !== "reactions") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Cannot react outside of the reactions phase",
      });
      return;
    }

    // Reaction window must still be open (Req 6.6)
    if (this.state.reactionTimer === null) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Reaction window has closed",
      });
      return;
    }

    // Extract messageId and emoji from payload
    const data = payload as { messageId?: unknown; emoji?: unknown } | null;
    const messageId = data?.messageId;
    const emoji = data?.emoji;

    if (typeof messageId !== "string" || typeof emoji !== "string") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Invalid reaction payload",
      });
      return;
    }

    // Validate emoji is in predefined set (Req 6.3)
    if (!VALID_REACTION_EMOJIS.includes(emoji)) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Invalid emoji reaction",
      });
      return;
    }

    // Find the message by ID in current round messages
    const currentRoundMessages = this.state.roundMessages.get(this.state.currentRound);
    if (!currentRoundMessages) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "No messages found for current round",
      });
      return;
    }

    const message = currentRoundMessages.find((m) => m.id === messageId);
    if (!message) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Message not found",
      });
      return;
    }

    // Validate the player is the message's target (Req 6.5)
    if (message.targetId !== socketId) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "You can only react to messages addressed to you",
      });
      return;
    }

    // Check for duplicate reaction (Req 6.4)
    if (!message.reactions.has(emoji)) {
      message.reactions.set(emoji, new Set());
    }
    const reactorSet = message.reactions.get(emoji)!;
    if (reactorSet.has(socketId)) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "You have already reacted with this emoji",
      });
      return;
    }

    // Store the reaction
    reactorSet.add(socketId);

    // Emit anonymous reaction counts to room (Req 6.2)
    const reactions: Record<string, number> = {};
    for (const [emojiKey, reactors] of message.reactions) {
      reactions[emojiKey] = reactors.size;
    }

    this.context.emitToRoom("saReactionUpdated", {
      messageId,
      reactions,
    });
  }

  /**
   * Handle submitVote event: validate phase, reject self-votes and duplicates, store vote.
   * Req 7.2, 7.3, 7.4
   */
  private handleSubmitVote(socketId: string, payload: unknown): void {
    if (!this.context) return;

    // Must be in voting phase
    if (this.state.phase !== "voting") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Cannot vote outside of the voting phase",
      });
      return;
    }

    // Extract messageId from payload
    const data = payload as { messageId?: unknown } | null;
    const messageId = data?.messageId;

    if (typeof messageId !== "string") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Invalid vote payload",
      });
      return;
    }

    // Find the message in the current round's messages
    const roundMessages = this.state.roundMessages.get(this.state.currentRound) ?? [];
    const message = roundMessages.find((m) => m.id === messageId);

    if (!message) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Message not found",
      });
      return;
    }

    // Reject self-votes (Req 7.3)
    if (message.authorId === socketId) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Self-voting is not permitted",
      });
      return;
    }

    // Reject duplicate votes (Req 7.2 — one vote per player)
    const roundVotes = this.state.votes.get(this.state.currentRound)!;
    if (roundVotes.has(socketId)) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "You have already voted this round",
      });
      return;
    }

    // Store the vote: voterId → messageAuthorId
    roundVotes.set(socketId, message.authorId);

    // Emit vote received with progress
    const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);
    this.context.emitToRoom("saVoteReceived", {
      votesIn: roundVotes.size,
      totalEligible: connectedPlayers.length,
    });

    // If all eligible connected players have voted, end voting immediately (Req 7.4)
    if (roundVotes.size >= connectedPlayers.length) {
      this.endVotingPhase();
    }
  }

  /**
   * End the voting phase: tally votes, award points, advance to next round or guessing.
   * Req 7.4, 7.5, 7.6
   */
  private endVotingPhase(): void {
    if (!this.context) return;

    // Clear the voting timer
    if (this.state.votingTimer) {
      clearTimeout(this.state.votingTimer);
      this.state.votingTimer = null;
    }

    // Get the votes for the current round
    const roundVotes = this.state.votes.get(this.state.currentRound) ?? new Map<string, string>();

    // Build reactions data: Map<authorId, Map<emoji, Set<reactorIds>>>
    const roundMessages = this.state.roundMessages.get(this.state.currentRound) ?? [];
    const reactions = new Map<string, Map<string, Set<string>>>();
    for (const msg of roundMessages) {
      if (msg.reactions.size > 0) {
        reactions.set(msg.authorId, msg.reactions);
      }
    }

    // Calculate scores using the scoreCalculator
    const scoreUpdates = calculateRoundScores(roundVotes, reactions);

    // Apply score updates to cumulative scores
    for (const update of scoreUpdates) {
      const current = this.state.scores.get(update.playerId) ?? 0;
      this.state.scores.set(update.playerId, current + update.points);
    }

    // Determine winning message ID(s) based on most votes
    let winningMessageId: string | string[] = [];
    if (roundVotes.size > 0) {
      // Count votes per author
      const voteCounts = new Map<string, number>();
      for (const authorId of roundVotes.values()) {
        voteCounts.set(authorId, (voteCounts.get(authorId) ?? 0) + 1);
      }
      const maxVotes = Math.max(...voteCounts.values());
      const winningAuthors: string[] = [];
      for (const [authorId, count] of voteCounts) {
        if (count === maxVotes) {
          winningAuthors.push(authorId);
        }
      }
      // Find message IDs for winning authors
      const winningIds = roundMessages
        .filter((m) => winningAuthors.includes(m.authorId) && m.text !== "")
        .map((m) => m.id);
      winningMessageId = winningIds.length === 1 ? winningIds[0] : winningIds;
    }

    // Emit round results
    this.context.emitToRoom("saRoundResults", {
      winningMessageId,
      scores: Object.fromEntries(this.state.scores),
    });

    // Advance: next round or guessing phase
    if (this.state.currentRound < this.state.totalRounds) {
      this.state.currentRound++;
      this.state.phase = "roundActive";
      this.startRound();
    } else {
      // All rounds complete — transition to guessing phase
      this.startGuessingPhase();
    }
  }

  // ─── Guessing Phase ────────────────────────────────────────────────

  /**
   * Start the guessing phase: set phase, emit saGuessingStarted, start 60s timer.
   * Req 8.1, 8.2
   */
  private startGuessingPhase(): void {
    if (!this.context) return;

    this.state.phase = "guessing";
    this.state.guesses = new Map();

    // Build player list for guessing UI
    const players = this.context.getPlayers().filter((p) => p.isConnected);
    const playerList = players.map((p) => ({ id: p.id, name: p.name }));

    // Emit saGuessingStarted with player list and timer (Req 8.1, 8.2)
    this.context.emitToRoom("saGuessingStarted", {
      players: playerList,
      timeRemaining: 60,
    });

    // Emit phase change
    this.context.emitToRoom("saPhaseChanged", {
      phase: "guessing",
    });

    // Start 60-second guessing timer (Req 8.1, 8.6, 8.7)
    this.state.guessingTimer = setTimeout(() => {
      this.endGuessingPhase();
    }, 60_000);
  }

  /**
   * Handle submitGuess event: validate phase, self-guess, existence, duplicates.
   * Req 8.2–8.5, 8.8
   */
  private handleSubmitGuess(socketId: string, payload: unknown): void {
    if (!this.context) return;

    // Must be in guessing phase (Req 8.3)
    if (this.state.phase !== "guessing") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Game is not in the guessing phase",
      });
      return;
    }

    // Check for duplicate guess (Req 8.5)
    if (this.state.guesses.has(socketId)) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "You have already submitted a guess",
      });
      return;
    }

    // Extract playerId from payload
    const data = payload as { playerId?: unknown } | null;
    const guessedPlayerId = data?.playerId;

    if (typeof guessedPlayerId !== "string") {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Invalid player selection",
      });
      return;
    }

    // Validate not self (Req 8.4)
    if (guessedPlayerId === socketId) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "You cannot guess yourself as your admirer",
      });
      return;
    }

    // Validate guessed player exists in game (Req 8.4)
    const players = this.context.getPlayers();
    const playerExists = players.some((p) => p.id === guessedPlayerId);
    if (!playerExists) {
      this.context.emitToPlayer(socketId, "saError", {
        message: "Invalid player selection",
      });
      return;
    }

    // Store the guess (Req 8.3)
    this.state.guesses.set(socketId, guessedPlayerId);

    // Check if all connected players have guessed (Req 8.7)
    const connectedPlayers = this.context.getPlayers().filter((p) => p.isConnected);
    if (this.state.guesses.size >= connectedPlayers.length) {
      this.endGuessingPhase();
    }
  }

  /**
   * End the guessing phase: clear timer, calculate guess scores, build reveal data,
   * emit reveal, leaderboard, awards, and signal game over.
   * Req 8.7, 9.1–9.6, 10.1, 10.6, 11.1–11.3, 12.1
   */
  private endGuessingPhase(): void {
    if (!this.context) return;

    // Clear the guessing timer
    if (this.state.guessingTimer) {
      clearTimeout(this.state.guessingTimer);
      this.state.guessingTimer = null;
    }

    // Calculate guess scores (Req 10.1)
    const guessScoreUpdates = calculateGuessScores(this.state.guesses, this.state.cycle);

    // Apply score updates to cumulative scores
    for (const update of guessScoreUpdates) {
      const current = this.state.scores.get(update.playerId) ?? 0;
      this.state.scores.set(update.playerId, current + update.points);
    }

    // Transition to reveal phase
    this.state.phase = "reveal";

    // Emit phase change
    this.context.emitToRoom("saPhaseChanged", {
      phase: "reveal",
    });

    // Build and emit full reveal data
    this.emitRevealData();
  }

  /**
   * Build and emit the full reveal data: cycle, guesses, messages, statistics,
   * leaderboard, and awards. Signal game over to the platform.
   * Req 9.2–9.6, 10.6, 11.1–11.3, 12.1
   */
  private emitRevealData(): void {
    if (!this.context) return;

    // Build player name lookup
    const players = this.context.getPlayers();
    const playerNames = new Map<string, string>();
    for (const p of players) {
      playerNames.set(p.id, p.name);
    }

    const revealData = this.buildRevealData(playerNames, players);

    this.context.emitToRoom("saRevealData", revealData);

    // --- Signal game over to platform (Req 12.1) ---
    this.context.signalGameOver({ leaderboard: revealData.leaderboard, awards: revealData.awards });
  }

  /**
   * Build the full reveal data object. Used by both emitRevealData and getState (during reveal phase).
   */
  private buildRevealData(
    playerNames: Map<string, string>,
    players: Array<{ id: string; name: string; isConnected: boolean }>
  ): RevealData {
    // --- 1. Build cycle reveal data (Req 9.2) ---
    const cycleReveal: RevealData["cycle"] = [];
    if (this.state.cycle.size > 0) {
      const startId = this.state.cycle.keys().next().value!;
      let currentId = startId;
      do {
        const targetId = this.state.cycle.get(currentId)!;
        cycleReveal.push({
          admirerId: currentId,
          admirerName: playerNames.get(currentId) ?? currentId,
          targetId,
          targetName: playerNames.get(targetId) ?? targetId,
        });
        currentId = targetId;
      } while (currentId !== startId);
    }

    // --- 2. Build guesses reveal data (Req 9.3) ---
    const targetToAdmirer = new Map<string, string>();
    for (const [admirerId, targetId] of this.state.cycle) {
      targetToAdmirer.set(targetId, admirerId);
    }

    const guessesReveal: RevealData["guesses"] = [];
    for (const p of players) {
      const guessedId = this.state.guesses.get(p.id) ?? null;
      const actualAdmirerId = targetToAdmirer.get(p.id) ?? "";
      guessesReveal.push({
        playerId: p.id,
        playerName: p.name,
        guessedId,
        guessedName: guessedId ? (playerNames.get(guessedId) ?? guessedId) : null,
        actualAdmirerId,
        actualAdmirerName: playerNames.get(actualAdmirerId) ?? actualAdmirerId,
        correct: guessedId !== null && guessedId === actualAdmirerId,
      });
    }

    // --- 3. Build messages by round (Req 9.4) ---
    const messagesReveal: RevealData["messages"] = [];
    const sortedRounds = Array.from(this.state.roundMessages.keys()).sort((a, b) => a - b);
    for (const roundNumber of sortedRounds) {
      const roundMsgs = this.state.roundMessages.get(roundNumber) ?? [];
      messagesReveal.push({
        roundNumber,
        messages: roundMsgs.map((msg) => ({
          authorId: msg.authorId,
          authorName: playerNames.get(msg.authorId) ?? msg.authorId,
          targetId: msg.targetId,
          targetName: playerNames.get(msg.targetId) ?? msg.targetId,
          text: msg.text,
        })),
      });
    }

    // --- 4. Build statistics (Req 9.5, 9.6) ---
    const allMessages: RoundMessage[] = [];
    for (const roundNumber of sortedRounds) {
      const roundMsgs = this.state.roundMessages.get(roundNumber) ?? [];
      allMessages.push(...roundMsgs);
    }

    // Most reacted message
    let mostReactedMessage: RevealData["statistics"]["mostReactedMessage"] = null;
    {
      let maxReactions = 0;
      let best: RoundMessage | null = null;
      for (const msg of allMessages) {
        const count = this.countMessageReactions(msg);
        if (count > maxReactions || (count === maxReactions && count > 0 && best !== null && msg.submittedAt < best.submittedAt)) {
          maxReactions = count;
          best = msg;
        }
      }
      if (best && maxReactions > 0) {
        mostReactedMessage = {
          authorName: playerNames.get(best.authorId) ?? best.authorId,
          text: best.text,
          reactionCount: maxReactions,
        };
      }
    }

    // Longest answer
    let longestAnswer: RevealData["statistics"]["longestAnswer"] = null;
    {
      let maxLength = 0;
      let best: RoundMessage | null = null;
      for (const msg of allMessages) {
        if (msg.text.length > maxLength || (msg.text.length === maxLength && msg.text.length > 0 && best !== null && msg.submittedAt < best.submittedAt)) {
          maxLength = msg.text.length;
          best = msg;
        }
      }
      if (best && maxLength > 0) {
        longestAnswer = {
          authorName: playerNames.get(best.authorId) ?? best.authorId,
          text: best.text,
          length: maxLength,
        };
      }
    }

    // Shortest answer (non-blank)
    let shortestAnswer: RevealData["statistics"]["shortestAnswer"] = null;
    {
      let minLength = Infinity;
      let best: RoundMessage | null = null;
      for (const msg of allMessages) {
        if (msg.text.length === 0) continue;
        if (msg.text.length < minLength || (msg.text.length === minLength && best !== null && msg.submittedAt < best.submittedAt)) {
          minLength = msg.text.length;
          best = msg;
        }
      }
      if (best && minLength !== Infinity) {
        shortestAnswer = {
          authorName: playerNames.get(best.authorId) ?? best.authorId,
          text: best.text,
          length: minLength,
        };
      }
    }

    // Fastest submission
    let fastestSubmission: RevealData["statistics"]["fastestSubmission"] = null;
    {
      let minTime = Infinity;
      let best: RoundMessage | null = null;
      for (const msg of allMessages) {
        if (msg.text.length === 0) continue;
        if (msg.submittedAt < minTime) {
          minTime = msg.submittedAt;
          best = msg;
        }
      }
      if (best && minTime !== Infinity) {
        fastestSubmission = {
          authorName: playerNames.get(best.authorId) ?? best.authorId,
          text: best.text,
          timeSeconds: minTime / 1000,
        };
      }
    }

    const statistics: RevealData["statistics"] = {
      mostReactedMessage,
      longestAnswer,
      shortestAnswer,
      fastestSubmission,
    };

    // --- 5. Build leaderboard (Req 10.6) ---
    const leaderboard = buildLeaderboard(this.state.scores, playerNames);

    // --- 6. Calculate awards (Req 11.1–11.3) ---
    const awards = calculateAwards({
      roundMessages: this.state.roundMessages,
      guesses: this.state.guesses,
      cycle: this.state.cycle,
      playerNames,
    });

    return {
      cycle: cycleReveal,
      guesses: guessesReveal,
      messages: messagesReveal,
      statistics,
      leaderboard,
      awards,
    };
  }

  /**
   * Count total reactions on a single message.
   */
  private countMessageReactions(msg: RoundMessage): number {
    let total = 0;
    for (const reactors of msg.reactions.values()) {
      total += reactors.size;
    }
    return total;
  }
}
