import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import { PhaseController } from "../../PhaseController.js";
import { VoteManager } from "../../VoteManager.js";
import {
  GamePhase,
  GameState,
  NarrationResult,
  Player,
  Role,
  Room,
  WinCondition,
} from "./types.js";

/**
 * Mafia Game Module — wraps existing PhaseController and VoteManager
 * in the GameModule interface for the Party Games Platform.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 20.1, 20.2
 */
export class MafiaModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "mafia",
    name: "Mafia",
    minPlayers: 4,
    maxPlayers: 10,
    description:
      "A social deduction game where the Killer eliminates players at night while the town tries to identify and vote out the Killer during the day.",
  };

  private phaseController: PhaseController;
  private voteManager: VoteManager;
  private room: Room | null = null;
  private context: GameModuleContext | null = null;
  private lastNarration: NarrationResult | null = null;

  constructor(
    phaseController?: PhaseController,
    voteManager?: VoteManager
  ) {
    this.phaseController = phaseController ?? new PhaseController();
    this.voteManager = voteManager ?? new VoteManager();
  }

  /**
   * Initialize the Mafia game with players from the platform context.
   * Builds the internal Room structure, assigns roles, and transitions to RoleReveal.
   */
  start(context: GameModuleContext): void {
    this.context = context;

    const platformPlayers = context.getPlayers();

    // Build Room from platform players
    const players = new Map<string, Player>();
    let hostId = platformPlayers[0]?.id ?? "";

    for (let i = 0; i < platformPlayers.length; i++) {
      const pp = platformPlayers[i];
      const player: Player = {
        id: pp.id,
        name: pp.name,
        role: null,
        isAlive: true,
        isHost: i === 0,
        isConnected: pp.isConnected,
        disconnectedAt: null,
        isReady: false,
        color: "",
      };
      players.set(pp.id, player);
      if (i === 0) {
        hostId = pp.id;
      }
    }

    const gameState: GameState = {
      nightActions: { killTarget: null, saveTarget: null },
      votes: new Map(),
      eliminatedPlayers: [],
      phaseTimer: null,
      roleAcknowledgements: new Set(),
      narrationCompletes: new Set(),
      voteHistory: [],
      accusations: new Map(),
      accusationResults: null,
      round: 1,
    };

    this.room = {
      roomCode: "MODULE",
      hostId,
      players,
      phase: GamePhase.Lobby,
      gameState,
      createdAt: new Date(),
    };

    // Assign roles via PhaseController
    this.phaseController.assignRoles(this.room);

    // Transition to RoleReveal phase
    this.phaseController.transitionTo(
      this.room,
      GamePhase.RoleReveal,
      () => this.onRoleRevealExpire(),
      undefined,
      (event, payload) => this.context?.emitToRoom(event, payload)
    );

    // Emit individual role assignments to each player
    for (const [socketId, player] of this.room.players) {
      this.context.emitToPlayer(socketId, "roleAssigned", {
        role: player.role,
        playerName: player.name,
      });
    }
  }

  /**
   * Route incoming socket events to the appropriate handler based on event type
   * and current game phase.
   */
  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.room || !this.context) return;

    const player = this.room.players.get(socketId);
    if (!player) return;

    switch (eventType) {
      case "acknowledgeRole":
        this.handleAcknowledgeRole(socketId);
        break;
      case "nightAction":
        this.handleNightAction(socketId, payload as { targetId: string | null });
        break;
      case "narrationComplete":
        this.handleNarrationComplete(socketId);
        break;
      case "accusation":
        this.handleAccusation(socketId, payload as { targetId: string });
        break;
      case "startDiscussionTimer":
        this.handleStartDiscussionTimer(socketId, payload as { duration?: number });
        break;
      case "skipDiscussion":
        this.handleSkipDiscussion(socketId);
        break;
      case "submitVote":
        this.handleSubmitVote(socketId, payload as { targetId: string });
        break;
      case "skipVote":
        this.handleSkipVote(socketId);
        break;
      default:
        // Unknown event type — ignore
        break;
    }
  }

  /**
   * Returns role-appropriate game state for reconnection.
   * Hides sensitive information based on the player's role.
   */
  getState(socketId: string): unknown {
    if (!this.room) return null;

    const player = this.room.players.get(socketId);
    if (!player) return null;

    const playersState = Array.from(this.room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isAlive: p.isAlive,
      isConnected: p.isConnected,
      // Only reveal the requesting player's own role
      role: p.id === socketId ? p.role : null,
    }));

    const state: Record<string, unknown> = {
      phase: this.room.phase,
      players: playersState,
      myRole: player.role,
      isAlive: player.isAlive,
      round: this.room.gameState?.round ?? 1,
      eliminatedPlayers: this.room.gameState?.eliminatedPlayers ?? [],
      voteHistory: this.room.gameState?.voteHistory ?? [],
    };

    // Phase-specific state
    if (this.room.phase === GamePhase.Night) {
      // Only Killer/Medic see their own action target
      if (player.role === Role.Killer) {
        state.myNightAction = this.room.gameState?.nightActions.killTarget ?? null;
      } else if (player.role === Role.Medic) {
        state.myNightAction = this.room.gameState?.nightActions.saveTarget ?? null;
      }
    }

    if (this.room.phase === GamePhase.Morning && this.lastNarration) {
      state.narration = this.lastNarration.segments;
      state.eliminatedPlayerId = this.lastNarration.eliminatedPlayerId;
      state.wasSaved = this.lastNarration.wasSaved;
    }

    if (this.room.phase === GamePhase.Discussion) {
      state.accusations = this.room.gameState?.accusationResults ?? null;
    }

    if (this.room.phase === GamePhase.Voting) {
      const hasVoted = this.room.gameState
        ? this.voteManager.hasVoted(this.room, socketId)
        : false;
      state.hasVoted = hasVoted;
    }

    return state;
  }

  /**
   * Handle player disconnect during an active game.
   * Marks the player as disconnected and handles game implications.
   */
  handleDisconnect(socketId: string): void {
    if (!this.room || !this.room.gameState) return;

    const player = this.room.players.get(socketId);
    if (!player) return;

    player.isConnected = false;
    player.disconnectedAt = new Date();

    // Emit updated player list
    this.emitPlayersUpdate();

    // Handle phase-specific implications
    if (this.room.phase === GamePhase.Night) {
      this.handleNightDisconnect(player);
    } else if (this.room.phase === GamePhase.RoleReveal) {
      // Count disconnected player as having acknowledged
      this.room.gameState.roleAcknowledgements.add(socketId);
      this.checkAllRolesAcknowledged();
    } else if (this.room.phase === GamePhase.Morning) {
      // Count disconnected player as having completed narration
      this.room.gameState.narrationCompletes.add(socketId);
      this.checkAllNarrationComplete();
    } else if (this.room.phase === GamePhase.Voting) {
      // Check if all remaining connected alive players have voted
      this.checkAllVotesIn();
    }
  }

  /**
   * End the game — cancel all timers and clear state.
   */
  end(): void {
    if (this.room) {
      this.phaseController.cancelPhaseTimer(this.room);
    }
    this.room = null;
    this.context = null;
    this.lastNarration = null;
  }

  /**
   * Transfer host to the next living connected player if the eliminated player was host.
   */
  private transferHostIfNeeded(eliminatedId: string): void {
    if (!this.room) return;
    const eliminated = this.room.players.get(eliminatedId);
    if (!eliminated?.isHost) return;

    // Find next living connected player
    for (const [id, player] of this.room.players) {
      if (id !== eliminatedId && player.isAlive && player.isConnected) {
        eliminated.isHost = false;
        player.isHost = true;
        this.room.hostId = id;
        return;
      }
    }
  }

  /**
   * Handle permanent player removal after 60s timeout.
   * Remove the player from the internal room and check phase progression.
   */
  handlePlayerRemoval(socketId: string): void {
    if (!this.room || !this.room.gameState) return;

    const player = this.room.players.get(socketId);
    if (!player) return;

    // Mark as not alive (they're gone permanently)
    player.isAlive = false;
    this.room.gameState.eliminatedPlayers.push(socketId);

    this.emitPlayersUpdate();

    // Check win condition after removal
    const winCondition = this.phaseController.checkWinCondition(this.room);
    if (winCondition) {
      this.endGame(winCondition);
      return;
    }

    // Handle phase-specific implications
    if (this.room.phase === GamePhase.Night) {
      this.handleNightDisconnect(player);
    } else if (this.room.phase === GamePhase.Voting) {
      this.checkAllVotesIn();
    }
  }

  // ─── Private Event Handlers ─────────────────────────────────────────

  private handleAcknowledgeRole(socketId: string): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.RoleReveal) return;

    const player = this.room.players.get(socketId);
    if (!player || !player.isAlive) return;

    this.room.gameState.roleAcknowledgements.add(socketId);
    this.checkAllRolesAcknowledged();
  }

  private handleNightAction(
    socketId: string,
    payload: { targetId: string | null }
  ): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.Night) return;

    const player = this.room.players.get(socketId);
    if (!player || !player.isAlive) return;

    if (player.role === Role.Killer) {
      this.room.gameState.nightActions.killTarget = payload.targetId;
      this.checkNightActionsComplete();
    } else if (player.role === Role.Medic) {
      this.room.gameState.nightActions.saveTarget = payload.targetId;
      this.checkNightActionsComplete();
    }
  }

  private handleNarrationComplete(socketId: string): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.Morning) return;

    const player = this.room.players.get(socketId);
    if (!player) return;

    this.room.gameState.narrationCompletes.add(socketId);
    this.checkAllNarrationComplete();
  }

  private handleAccusation(
    socketId: string,
    payload: { targetId: string }
  ): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.Discussion) return;

    const player = this.room.players.get(socketId);
    if (!player || !player.isAlive) return;

    // Record the accusation (one per player, overwrites previous)
    this.room.gameState.accusations.set(socketId, payload.targetId);

    this.context?.emitToRoom("accusationUpdate", {
      accuserId: socketId,
      targetId: payload.targetId,
    });

    // Auto-advance to voting if all alive players have submitted accusations
    const alivePlayers = Array.from(this.room.players.values()).filter(
      (p) => p.isAlive && p.isConnected
    );
    const allAccused = alivePlayers.every(
      (p) => this.room!.gameState!.accusations.has(p.id)
    );
    if (allAccused) {
      this.onDiscussionExpire();
    }
  }

  private handleStartDiscussionTimer(
    socketId: string,
    payload: { duration?: number }
  ): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.Discussion) return;

    // Only the host can start the discussion timer
    if (socketId !== this.room.hostId) return;

    const duration = payload.duration ?? 120_000;

    this.phaseController.startPhaseTimer(
      this.room,
      GamePhase.Discussion,
      duration,
      () => this.onDiscussionExpire()
    );

    this.context?.emitToRoom("discussionTimerStarted", { duration });
  }

  private handleSkipDiscussion(socketId: string): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.Discussion) return;

    // Only the host can skip discussion
    if (socketId !== this.room.hostId) return;

    // Immediately transition to voting
    this.onDiscussionExpire();
  }

  private handleSubmitVote(
    socketId: string,
    payload: { targetId: string }
  ): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.Voting) return;

    const player = this.room.players.get(socketId);
    if (!player || !player.isAlive) return;

    try {
      this.voteManager.recordVote(this.room, socketId, payload.targetId);
      this.context?.emitToRoom("voteRecorded", {
        voterId: socketId,
        voterName: player.name,
      });
      this.checkAllVotesIn();
    } catch {
      // Vote validation failed — ignore silently
    }
  }

  private handleSkipVote(socketId: string): void {
    if (!this.room?.gameState) return;
    if (this.room.phase !== GamePhase.Voting) return;

    const player = this.room.players.get(socketId);
    if (!player || !player.isAlive) return;

    try {
      this.voteManager.recordSkipVote(this.room, socketId);
      this.context?.emitToRoom("voteRecorded", {
        voterId: socketId,
        voterName: player.name,
      });
      this.checkAllVotesIn();
    } catch {
      // Vote validation failed — ignore silently
    }
  }

  // ─── Phase Transition Logic ─────────────────────────────────────────

  private checkAllRolesAcknowledged(): void {
    if (!this.room?.gameState) return;

    const alivePlayers = this.getAlivePlayers();
    const allAcknowledged = alivePlayers.every(
      (p) => this.room!.gameState!.roleAcknowledgements.has(p.id)
    );

    if (allAcknowledged) {
      this.transitionToNight();
    }
  }

  private checkNightActionsComplete(): void {
    if (!this.room?.gameState) return;

    const { killTarget, saveTarget } = this.room.gameState.nightActions;

    // Check if the Killer has acted
    const killer = this.getAlivePlayerByRole(Role.Killer);
    const killerActed = !killer || !killer.isConnected || killTarget !== null;

    // Check if the Medic has acted
    const medic = this.getAlivePlayerByRole(Role.Medic);
    const medicActed = !medic || !medic.isConnected || saveTarget !== null;

    if (killerActed && medicActed) {
      this.resolveNight();
    }
  }

  private resolveNight(): void {
    if (!this.room?.gameState) return;

    // Resolve night actions
    this.lastNarration = this.phaseController.resolveNightActions(this.room);

    // Transition to Morning
    this.phaseController.transitionTo(
      this.room,
      GamePhase.Morning,
      () => this.onMorningExpire(),
      30_000,
      (event, payload) => this.context?.emitToRoom(event, payload)
    );

    // Clear narration completes for this round
    this.room.gameState.narrationCompletes.clear();

    // Emit narration to all players
    this.context?.emitToRoom("narration", {
      segments: this.lastNarration.segments,
      eliminatedPlayerId: this.lastNarration.eliminatedPlayerId,
      wasSaved: this.lastNarration.wasSaved,
    });

    // Transfer host if the killed player was host
    if (this.lastNarration.eliminatedPlayerId) {
      this.transferHostIfNeeded(this.lastNarration.eliminatedPlayerId);
    }
  }

  private checkAllNarrationComplete(): void {
    if (!this.room?.gameState) return;

    const connectedPlayers = Array.from(this.room.players.values()).filter(
      (p) => p.isConnected && p.isAlive
    );

    const allComplete = connectedPlayers.every(
      (p) => this.room!.gameState!.narrationCompletes.has(p.id)
    );

    if (allComplete) {
      this.afterMorning();
    }
  }

  private afterMorning(): void {
    if (!this.room?.gameState) return;

    // Check win condition after night elimination
    if (this.lastNarration?.eliminatedPlayerId) {
      const winCondition = this.phaseController.checkWinCondition(this.room);
      if (winCondition) {
        this.endGame(winCondition);
        return;
      }
    }

    // Transition to Discussion
    this.transitionToDiscussion();
  }

  private transitionToDiscussion(): void {
    if (!this.room?.gameState) return;

    // Clear accusations for new discussion
    this.room.gameState.accusations.clear();
    this.room.gameState.accusationResults = null;

    this.phaseController.transitionTo(
      this.room,
      GamePhase.Discussion,
      undefined, // No auto-expire; host starts timer explicitly
      undefined,
      (event, payload) => this.context?.emitToRoom(event, payload)
    );
  }

  private onDiscussionExpire(): void {
    if (!this.room?.gameState) return;

    // Tally accusations for reveal
    this.tallyAccusations();

    // Wait 4 seconds for players to see accusation results, then transition to Voting
    setTimeout(() => {
      this.transitionToVoting();
    }, 4000);
  }

  private tallyAccusations(): void {
    if (!this.room?.gameState) return;

    const room = this.room;
    const counts: Record<string, number> = {};
    for (const targetId of room.gameState!.accusations.values()) {
      const target: Player | undefined = room.players.get(targetId);
      if (target) {
        const name = target.name;
        counts[name] = (counts[name] ?? 0) + 1;
      }
    }
    room.gameState!.accusationResults = counts;

    this.context?.emitToRoom("accusationResults", { results: counts });
  }

  private transitionToVoting(): void {
    if (!this.room?.gameState) return;

    // Clear votes for new voting phase
    this.voteManager.clearVotes(this.room);

    this.phaseController.transitionTo(
      this.room,
      GamePhase.Voting,
      () => this.onVotingExpire(),
      undefined,
      (event, payload) => this.context?.emitToRoom(event, payload)
    );
  }

  private checkAllVotesIn(): void {
    if (!this.room?.gameState) return;

    const alivePlayers = this.getAlivePlayers().filter((p) => p.isConnected);
    const allVoted = alivePlayers.every((p) =>
      this.voteManager.hasVoted(this.room!, p.id)
    );

    if (allVoted) {
      this.resolveVotes();
    }
  }

  private onVotingExpire(): void {
    this.resolveVotes();
  }

  private resolveVotes(): void {
    if (!this.room?.gameState) return;

    this.phaseController.cancelPhaseTimer(this.room);

    const voteResult = this.voteManager.tallyVotes(this.room);

    // Record vote history
    const voteRecord: Record<string, string> = {};
    for (const [voterId, targetId] of this.room.gameState.votes) {
      const voter = this.room.players.get(voterId);
      const target = this.room.players.get(targetId);
      if (voter) {
        voteRecord[voter.name] = target ? target.name : "Skip";
      }
    }
    this.room.gameState.voteHistory.push({
      round: this.room.gameState.round,
      votes: voteRecord,
    });

    // Handle elimination
    if (voteResult.eliminatedPlayerId) {
      const eliminated = this.room.players.get(voteResult.eliminatedPlayerId);
      if (eliminated) {
        eliminated.isAlive = false;
        this.room.gameState.eliminatedPlayers.push(voteResult.eliminatedPlayerId);
      }

      // Transfer host if eliminated player was host
      this.transferHostIfNeeded(voteResult.eliminatedPlayerId);

      // Emit vote results
      this.context?.emitToRoom("voteResults", {
        eliminatedPlayerId: voteResult.eliminatedPlayerId,
        eliminatedPlayerName: eliminated?.name ?? null,
        voteCounts: Object.fromEntries(voteResult.voteCounts),
        isTie: voteResult.isTie,
      });

      // Check win condition
      const winCondition = this.phaseController.checkWinCondition(this.room);
      if (winCondition) {
        this.endGame(winCondition);
        return;
      }
    } else {
      // No elimination (tie or skip majority)
      this.context?.emitToRoom("voteResults", {
        eliminatedPlayerId: null,
        eliminatedPlayerName: null,
        voteCounts: Object.fromEntries(voteResult.voteCounts),
        isTie: voteResult.isTie,
        tiedPlayers: voteResult.tiedPlayers,
      });
    }

    // Transition to Results briefly, then Night
    this.transitionToResults();
  }

  private transitionToResults(): void {
    if (!this.room?.gameState) return;

    this.phaseController.transitionTo(
      this.room,
      GamePhase.Results,
      () => this.transitionToNight(),
      5_000,
      (event, payload) => this.context?.emitToRoom(event, payload)
    );
  }

  private transitionToNight(): void {
    if (!this.room?.gameState) return;

    // Increment round
    this.room.gameState.round++;

    // Reset night actions
    this.room.gameState.nightActions = { killTarget: null, saveTarget: null };

    this.phaseController.transitionTo(
      this.room,
      GamePhase.Night,
      () => this.onNightExpire(),
      undefined,
      (event, payload) => this.context?.emitToRoom(event, payload)
    );

    // Emit night started with role-specific prompts
    for (const [socketId, player] of this.room.players) {
      if (!player.isAlive) continue;

      if (player.role === Role.Killer) {
        const targets = this.getAlivePlayers().filter((p) => p.id !== socketId);
        this.context?.emitToPlayer(socketId, "nightPrompt", {
          role: Role.Killer,
          targets: targets.map((t) => ({ id: t.id, name: t.name })),
        });
      } else if (player.role === Role.Medic) {
        const targets = this.getAlivePlayers();
        this.context?.emitToPlayer(socketId, "nightPrompt", {
          role: Role.Medic,
          targets: targets.map((t) => ({ id: t.id, name: t.name })),
        });
      }
    }
  }

  private onNightExpire(): void {
    // Night timer expired — resolve with whatever actions were submitted
    this.resolveNight();
  }

  private onRoleRevealExpire(): void {
    // Timer expired — force transition to Night
    this.transitionToNight();
  }

  private onMorningExpire(): void {
    // Morning timer expired — move on
    this.afterMorning();
  }

  private endGame(winCondition: WinCondition): void {
    if (!this.room) return;

    this.phaseController.transitionTo(
      this.room,
      GamePhase.GameOver,
      undefined,
      undefined,
      (event, payload) => this.context?.emitToRoom(event, payload)
    );

    // Build results payload
    const results = {
      winner: winCondition.winner,
      reason: winCondition.reason,
      players: Array.from(this.room.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        isAlive: p.isAlive,
      })),
      voteHistory: this.room.gameState?.voteHistory ?? [],
      rounds: this.room.gameState?.round ?? 1,
    };

    // Signal game over to the platform
    this.context?.signalGameOver(results);
  }

  // ─── Disconnect Helpers ─────────────────────────────────────────────

  private handleNightDisconnect(player: Player): void {
    if (!this.room?.gameState) return;

    // If the Killer disconnects, treat as no kill
    if (player.role === Role.Killer && player.isAlive) {
      if (this.room.gameState.nightActions.killTarget === null) {
        // Killer hadn't chosen yet — leave as null (no kill attempt)
        this.checkNightActionsComplete();
      }
    }

    // If the Medic disconnects, treat as no save
    if (player.role === Role.Medic && player.isAlive) {
      if (this.room.gameState.nightActions.saveTarget === null) {
        // Medic hadn't chosen yet — leave as null (no save)
        this.checkNightActionsComplete();
      }
    }
  }

  // ─── Utility Helpers ────────────────────────────────────────────────

  private getAlivePlayers(): Player[] {
    if (!this.room) return [];
    return Array.from(this.room.players.values()).filter((p) => p.isAlive);
  }

  private getAlivePlayerByRole(role: Role): Player | undefined {
    return this.getAlivePlayers().find((p) => p.role === role);
  }

  private emitPlayersUpdate(): void {
    if (!this.room) return;

    const players = Array.from(this.room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isAlive: p.isAlive,
      isConnected: p.isConnected,
    }));

    this.context?.emitToRoom("playersUpdate", { players });
  }
}
