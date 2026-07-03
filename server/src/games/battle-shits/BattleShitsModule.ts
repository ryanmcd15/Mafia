import {
  GameModule,
  GameModuleConfig,
  GameModuleContext,
} from "../../types.js";
import {
  ALL_POOP_TYPES,
  BattleShitsClientState,
  BattleShitsState,
  FlushMarker,
  GamePhase,
  Orientation,
  PlacedPoop,
  POOP_SIZES,
  PoopType,
  SideGrid,
} from "./types.js";
import type { Cell } from "./types.js";
import {
  cellKey,
  computeOccupiedCells,
  hasAdjacency,
  hasOverlap,
  isInBounds,
} from "./utils.js";

/**
 * Battle Shits Game Module
 *
 * A Battleship-style game with a poop/toilet theme.
 * Supports 1v1 (2 players) and 2v2 (3-4 players, random team assignment).
 *
 * Phases:
 * 1. Placement — each side secretly places 4 Poops on their 10×10 Grid.
 * 2. Battle    — sides alternate Flushing (attacking) the opponent's Grid.
 * 3. GameOver  — winner announced.
 *
 * Requirements: 1.1–1.3, 2.1–2.3, 3.1–3.7, 4.1–4.4, 5.1–5.5,
 *               6.1–6.4, 7.1–7.3, 8.1–8.3, 9.1–9.5
 */
export class BattleShitsModule implements GameModule {
  readonly config: GameModuleConfig = {
    id: "battle-shits",
    name: "Battle Shits",
    minPlayers: 2,
    maxPlayers: 4,
    description:
      "Place your poops, then take turns flushing the opponent's grid! First to sink all 4 opponent poops wins. 💩",
  };

  private context: GameModuleContext | null = null;
  private phase: GamePhase = "placement";
  private mode: "1v1" | "2v2" = "1v1";
  private sides: SideGrid[] = [];

  // Battle phase state (populated when battle starts)
  private activeSideIndex: number = 0;
  private activeShooter: string = "";
  private turnTimeRemaining: number = 0;
  private winner: string | null = null;
  private winnerPlayerIds: string[] = [];

  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimerInterval: ReturnType<typeof setInterval> | null = null;

  // ─── GameModule Interface ───────────────────────────────────────────

  /**
   * Initialize game: assign teams, create SideGrids, emit bsPhaseChanged.
   * Requirements 2.1, 2.2, 2.3
   */
  start(context: GameModuleContext): void {
    this.context = context;
    this.phase = "placement";
    this.winner = null;
    this.winnerPlayerIds = [];
    this.activeSideIndex = 0;
    this.activeShooter = "";
    this.turnTimeRemaining = 0;

    const players = context.getPlayers();
    const playerCount = players.length;

    let mode: "1v1" | "2v2";
    let teams: Array<{ sideId: string; playerIds: string[] }>;

    if (playerCount === 2) {
      // 1v1: each player gets their own side
      mode = "1v1";
      teams = [
        { sideId: players[0].id, playerIds: [players[0].id] },
        { sideId: players[1].id, playerIds: [players[1].id] },
      ];
    } else {
      // 2v2: shuffle and split (3 players → 2+1, 4 players → 2+2)
      mode = "2v2";
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const half = Math.ceil(shuffled.length / 2);
      const side0Players = shuffled.slice(0, half);
      const side1Players = shuffled.slice(half);
      teams = [
        {
          sideId: `team-${side0Players.map((p) => p.id).join("-")}`,
          playerIds: side0Players.map((p) => p.id),
        },
        {
          sideId: `team-${side1Players.map((p) => p.id).join("-")}`,
          playerIds: side1Players.map((p) => p.id),
        },
      ];
    }

    this.mode = mode;

    // Build SideGrids
    this.sides = teams.map((t) => ({
      sideId: t.sideId,
      playerIds: t.playerIds,
      poops: new Map<PoopType, PlacedPoop>(),
      flushMarkers: new Map<string, FlushMarker>(),
      outgoingMarkers: new Map<string, FlushMarker>(),
      ready: false,
      shooterIndex: 0,
    }));

    context.emitToRoom("bsPhaseChanged", {
      phase: "placement",
      teams: teams.map((t) => ({ sideId: t.sideId, playerIds: t.playerIds })),
      mode,
    });
  }

  /**
   * Route incoming events.
   */
  handleEvent(socketId: string, eventType: string, payload: unknown): void {
    if (!this.context) return;

    switch (eventType) {
      case "placePoop":
        this.handlePlacePoop(
          socketId,
          payload as { type: PoopType; startCell: Cell; orientation: Orientation }
        );
        break;
      case "readyForBattle":
        this.handleReadyForBattle(socketId);
        break;
      case "flush":
        this.handleFlush(socketId, payload as { cell: Cell });
        break;
      default:
        break;
    }
  }

  /**
   * Return personalized client state — NEVER reveals opponent un-hit poop positions.
   * Requirements 3.6, 3.7, 8.1, 8.2, 8.3
   */
  getState(socketId: string): BattleShitsClientState | null {
    if (!this.context) return null;

    const mySide = this.findSideForPlayer(socketId);
    if (!mySide) return null;

    const opponentSide = this.sides.find((s) => s.sideId !== mySide.sideId) ?? null;

    const myPoops = Array.from(mySide.poops.values()).map((p) => ({
      type: p.type,
      cells: p.cells,
      orientation: p.orientation,
      sunk: p.sunk,
      hitCells: Array.from(p.hitCells),
    }));

    const myFlushMarkers: Record<string, FlushMarker> = Object.fromEntries(
      mySide.flushMarkers
    );

    const opponentFlushMarkers: Record<string, FlushMarker> = Object.fromEntries(
      mySide.outgoingMarkers
    );

    const remainingPoopTypes: PoopType[] = ALL_POOP_TYPES.filter(
      (t) => !mySide.poops.has(t)
    );

    const teamMates = mySide.playerIds.filter((id) => id !== socketId);

    return {
      phase: this.phase,
      mode: this.mode,
      mySideId: mySide.sideId,
      myPoops,
      myFlushMarkers,
      opponentFlushMarkers,
      remainingPoopTypes,
      activeShooter: this.activeShooter,
      turnTimeRemaining: this.turnTimeRemaining,
      teamMates,
      winner: this.winner,
      winnerPlayerIds: this.winnerPlayerIds,
      // NOTE: opponentSide.poops is intentionally NOT included here.
      // Only the outgoingMarkers (shots fired) are exposed for the opponent grid.
    };
  }

  /**
   * Handle player disconnect — timer keeps running during battle phase.
   * Requirements 9.1, 9.2
   */
  handleDisconnect(_socketId: string): void {
    // During placement: no special action needed (readyForBattle won't fire for disconnected players).
    // During battle: turn timer runs normally; auto-skip fires on expiry (Requirement 9.2).
  }

  /**
   * Handle permanent player removal.
   * Requirements 9.4, 9.5
   */
  handlePlayerRemoval(socketId: string): void {
    if (!this.context) return;

    // If this player is the active shooter in battle phase, skip their turn immediately.
    if (this.phase === "battle" && socketId === this.activeShooter) {
      this.clearTurnTimers();
      this.advanceTurn();
    }

    // Remove from the side's player rotation.
    for (const side of this.sides) {
      const idx = side.playerIds.indexOf(socketId);
      if (idx !== -1) {
        side.playerIds.splice(idx, 1);
        // Adjust shooterIndex to stay in bounds.
        if (side.playerIds.length > 0) {
          side.shooterIndex = side.shooterIndex % side.playerIds.length;
        }
      }
    }
  }

  /**
   * Clear all timers on game end.
   */
  end(): void {
    this.clearTurnTimers();
    this.context = null;
    this.sides = [];
  }

  // ─── Private Event Handlers ─────────────────────────────────────────

  /**
   * Handle placePoop event.
   * Requirements 3.2, 3.3
   *
   * Payload: { type: PoopType, startCell: Cell, orientation: Orientation }
   */
  private handlePlacePoop(
    socketId: string,
    payload: { type: PoopType; startCell: Cell; orientation: Orientation }
  ): void {
    if (!this.context) return;

    const side = this.findSideForPlayer(socketId);

    // 1. Player's side exists and phase is "placement"
    if (!side || this.phase !== "placement") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Cannot place poop: not in placement phase or side not found.",
      });
      return;
    }

    const { type, startCell, orientation } = payload;

    // Validate payload shape
    if (!type || !startCell || !orientation) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Invalid placePoop payload.",
      });
      return;
    }

    // Validate PoopType is a known type
    if (!ALL_POOP_TYPES.includes(type)) {
      this.context.emitToPlayer(socketId, "error", {
        message: `Unknown poop type: ${type}.`,
      });
      return;
    }

    // 2. Poop type not already placed for this side
    if (side.poops.has(type)) {
      this.context.emitToPlayer(socketId, "error", {
        message: `Poop type "${type}" has already been placed.`,
      });
      return;
    }

    const size = POOP_SIZES[type];

    // 3. Compute occupied cells
    const cells = computeOccupiedCells(startCell, orientation, size);

    // 4. All cells within bounds
    if (!cells.every(isInBounds)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Poop placement is out of bounds.",
      });
      return;
    }

    // Collect all cells already placed on this side
    const allExistingCells = this.getAllPlacedCells(side);

    // 5. No overlap with already-placed poops
    if (hasOverlap(cells, allExistingCells)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Poop placement overlaps an existing poop.",
      });
      return;
    }

    // 6. No adjacency (including diagonal) with already-placed poops
    if (hasAdjacency(cells, allExistingCells)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "Poop placement is adjacent to an existing poop.",
      });
      return;
    }

    // Valid — store poop
    const placedPoop: PlacedPoop = {
      type,
      cells,
      orientation,
      hitCells: new Set<string>(),
      sunk: false,
    };

    side.poops.set(type, placedPoop);

    // Emit poopPlaced to that player only
    this.context.emitToPlayer(socketId, "poopPlaced", {
      type,
      cells,
    });
  }

  /**
   * Handle readyForBattle event.
   * Requirements 3.4, 3.5
   */
  private handleReadyForBattle(socketId: string): void {
    if (!this.context) return;

    const side = this.findSideForPlayer(socketId);

    if (!side || this.phase !== "placement") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Cannot mark ready: not in placement phase or side not found.",
      });
      return;
    }

    // Mark side as ready
    side.ready = true;

    // Emit bsReadyStatus to room with current ready state
    this.context.emitToRoom("bsReadyStatus", {
      sides: this.sides.map((s) => ({ sideId: s.sideId, ready: s.ready })),
    });

    // Check if ALL sides ready
    const allReady = this.sides.every((s) => s.ready);
    if (allReady) {
      this.transitionToBattle();
    }
  }

  /**
   * Handle flush event (battle phase attack).
   * Requirements 5.1–5.5
   */
  private handleFlush(socketId: string, payload: { cell: Cell }): void {
    if (!this.context) return;

    // 1. Phase must be "battle"
    if (this.phase !== "battle") {
      this.context.emitToPlayer(socketId, "error", {
        message: "Cannot flush: not in battle phase.",
      });
      return;
    }

    // 2. socketId must equal activeShooter
    if (socketId !== this.activeShooter) {
      this.context.emitToPlayer(socketId, "error", {
        message: "It is not your turn to flush.",
      });
      return;
    }

    const attackerSide = this.sides[this.activeSideIndex];
    const defenderSide = this.sides[1 - this.activeSideIndex];

    const { cell } = payload;
    const key = cellKey(cell);

    // 3. Cell must not already appear in outgoingMarkers for the attacking side
    if (attackerSide.outgoingMarkers.has(key)) {
      this.context.emitToPlayer(socketId, "error", {
        message: "You have already flushed that cell.",
      });
      return;
    }

    // 5. Cancel turn timer before processing shot
    this.clearTurnTimers();

    // Check if cell hits any poop on the defender's grid
    let hitPoop: PlacedPoop | null = null;
    for (const poop of defenderSide.poops.values()) {
      if (poop.cells.some((c) => cellKey(c) === key)) {
        hitPoop = poop;
        break;
      }
    }

    const result: FlushMarker = hitPoop ? "hit" : "miss";

    // Record markers
    attackerSide.outgoingMarkers.set(key, result);
    defenderSide.flushMarkers.set(key, result);

    let sunkPoopType: PoopType | null = null;

    if (hitPoop) {
      // Add hit cell
      hitPoop.hitCells.add(key);

      // Check if poop is sunk
      if (hitPoop.hitCells.size === hitPoop.cells.length) {
        hitPoop.sunk = true;
        sunkPoopType = hitPoop.type;
      }
    }

    // Emit flushResult to room
    this.context.emitToRoom("flushResult", {
      cell,
      result,
      sunk: sunkPoopType,
    });

    // If sunk, emit poopSunk to room
    if (sunkPoopType !== null) {
      this.context.emitToRoom("poopSunk", {
        poopType: sunkPoopType,
        sideId: defenderSide.sideId,
      });

      // Check win condition: all 4 defender poops sunk
      const allSunk =
        defenderSide.poops.size === ALL_POOP_TYPES.length &&
        Array.from(defenderSide.poops.values()).every((p) => p.sunk);

      if (allSunk) {
        this.endGame(attackerSide);
        return;
      }
    }

    // Advance turn
    this.advanceTurn();
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private findSideForPlayer(socketId: string): SideGrid | undefined {
    return this.sides.find((s) => s.playerIds.includes(socketId));
  }

  private getAllPlacedCells(side: SideGrid): Cell[] {
    const cells: Cell[] = [];
    for (const poop of side.poops.values()) {
      cells.push(...poop.cells);
    }
    return cells;
  }

  /**
   * Transition from placement phase to battle phase.
   * Called once all sides have marked ready.
   * Requirements 4.1, 4.2
   */
  private transitionToBattle(): void {
    if (!this.context) return;
    this.phase = "battle";
    // Randomly pick starting side
    this.activeSideIndex = Math.floor(Math.random() * 2);
    const activeSide = this.sides[this.activeSideIndex];
    activeSide.shooterIndex = 0;
    this.activeShooter = activeSide.playerIds[0] ?? "";
    this.startTurnTimer();
    this.context.emitToRoom("bsPhaseChanged", {
      phase: "battle",
      activeShooter: this.activeShooter,
    });
    this.context.emitToRoom("bsTurnStarted", {
      activeShooter: this.activeShooter,
      timeRemaining: 30,
    });
  }

  /**
   * Advance to the next turn during battle phase.
   * Requirements 4.2, 4.3
   */
  private advanceTurn(): void {
    if (!this.context) return;

    // Flip to the other side
    this.activeSideIndex = 1 - this.activeSideIndex;

    const activeSide = this.sides[this.activeSideIndex];

    // Advance shooter within the newly active side (round-robin)
    activeSide.shooterIndex =
      (activeSide.shooterIndex + 1) % Math.max(1, activeSide.playerIds.length);

    this.activeShooter =
      activeSide.playerIds[activeSide.shooterIndex] ?? activeSide.playerIds[0] ?? "";

    this.startTurnTimer();

    this.context.emitToRoom("bsTurnStarted", {
      activeShooter: this.activeShooter,
      timeRemaining: 30,
    });
  }

  /**
   * Start a 30-second turn timer with per-second countdown updates.
   * Requirements 6.1, 6.2, 6.4
   */
  private startTurnTimer(): void {
    this.clearTurnTimers();
    this.turnTimeRemaining = 30;

    this.turnTimerInterval = setInterval(() => {
      this.turnTimeRemaining--;
      this.context?.emitToRoom("bsTurnTimerUpdate", {
        timeRemaining: this.turnTimeRemaining,
      });
    }, 1000);

    this.turnTimer = setTimeout(() => {
      this.clearTurnTimers();
      const skippedShooter = this.activeShooter;
      this.context?.emitToRoom("turnSkipped", {
        playerId: skippedShooter,
        reason: "timeout",
      });
      this.advanceTurn();
    }, 30_000);
  }

  private clearTurnTimers(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
  }

  /**
   * End the game — called when all 4 opponent poops are sunk.
   * Requirements 7.1, 7.2, 7.3
   */
  private endGame(winningSide: SideGrid): void {
    if (!this.context) return;

    this.clearTurnTimers();
    this.phase = "gameOver";
    this.winner = winningSide.sideId;
    this.winnerPlayerIds = [...winningSide.playerIds];

    this.context.emitToRoom("bsPhaseChanged", {
      phase: "gameOver",
      winner: this.winner,
      winnerPlayerIds: this.winnerPlayerIds,
    });

    this.context.signalGameOver({
      game: "battle-shits",
      winner: this.winner,
      winnerPlayerIds: this.winnerPlayerIds,
    });
  }
}
