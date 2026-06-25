import {
  GamePhase,
  GameState,
  NarrationResult,
  Player,
  Role,
  Room,
  WinCondition,
} from "./types.js";

// Phase timer defaults (in milliseconds)
const PHASE_TIMER_DEFAULTS: Partial<Record<GamePhase, number>> = {
  [GamePhase.Night]: 90_000,
  [GamePhase.Discussion]: 120_000,
  [GamePhase.Voting]: 60_000,
  [GamePhase.RoleReveal]: 60_000,
  [GamePhase.Morning]: 30_000,
};

// Valid range for Discussion timer (in milliseconds)
const DISCUSSION_TIMER_MIN_MS = 10_000;
const DISCUSSION_TIMER_MAX_MS = 600_000;

export class PhaseController {
  /**
   * Randomly assigns roles to all players in the room.
   * Assigns exactly 1 Killer, 1 Medic, and Civilian to all remaining players.
   * Mutates each Player's `role` field in place.
   * Requirements: 5.1, 5.2
   */
  assignRoles(room: Room): void {
    const players = Array.from(room.players.values());

    if (players.length < 2) {
      throw new Error(
        "Cannot assign roles: need at least 2 players (1 Killer + 1 Medic)."
      );
    }

    // Fisher-Yates shuffle for an unbiased random ordering
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Assign roles: index 0 → Killer, index 1 → Medic, rest → Civilian
    shuffled[0].role = Role.Killer;
    shuffled[1].role = Role.Medic;
    for (let i = 2; i < shuffled.length; i++) {
      shuffled[i].role = Role.Civilian;
    }
  }

  /**
   * Resolves night actions by comparing the kill target and save target.
   * Returns a NarrationResult with narrative segments and the eliminated player ID.
   *
   * Three cases:
   *  - K == S  → player is saved; quiet heroic narration
   *  - K != S, K != null → player K is eliminated; elimination narration
   *  - K == null → quiet night; peaceful narration
   *
   * Narration segments MUST NOT contain the Killer's or Medic's name or role label.
   * Requirements: 9.1, 9.3, 9.4, 9.5, 9.7
   */
  resolveNightActions(room: Room): NarrationResult {
    if (!room.gameState) {
      throw new Error("Cannot resolve night actions: game has not started.");
    }

    const { killTarget, saveTarget } = room.gameState.nightActions;

    // Case 1: No kill target — quiet night
    if (killTarget === null) {
      return {
        segments: [
          "The night passed quietly.",
          "No one was harmed.",
        ],
        eliminatedPlayerId: null,
        wasSaved: false,
      };
    }

    // Case 2: Kill target was saved by Medic
    if (killTarget === saveTarget) {
      return {
        segments: [
          "The night was tense.",
          "Shadows moved through the town… but when morning came, everyone survived.",
        ],
        eliminatedPlayerId: null,
        wasSaved: true,
      };
    }

    // Case 3: Kill target is different from save target — player is eliminated
    const eliminatedPlayer = room.players.get(killTarget);
    if (!eliminatedPlayer) {
      throw new Error(
        `Cannot resolve night actions: kill target "${killTarget}" not found in room.`
      );
    }

    // Mark the player as eliminated
    eliminatedPlayer.isAlive = false;
    if (room.gameState.eliminatedPlayers) {
      room.gameState.eliminatedPlayers.push(killTarget);
    }

    return {
      segments: [
        "As dawn broke, the town gathered in the square.",
        `${eliminatedPlayer.name} was found… eliminated.`,
      ],
      eliminatedPlayerId: killTarget,
      wasSaved: false,
    };
  }

  /**
   * Checks if a win condition has been met after an elimination.
   *
   * Rules:
   *  1. If the eliminated player holds the Killer role → Civilians win.
   *  2. Else if living Killers >= living non-Killers → Killer wins.
   *  3. Otherwise → no winner yet, return null.
   *
   * Requirements: 13.1, 14.1
   */
  checkWinCondition(room: Room): WinCondition | null {
    const players = Array.from(room.players.values());
    const livingPlayers = players.filter((p) => p.isAlive);

    // Count living Killers and living non-Killers
    const livingKillers = livingPlayers.filter(
      (p) => p.role === Role.Killer
    );
    const livingNonKillers = livingPlayers.filter(
      (p) => p.role !== Role.Killer
    );

    // Rule 1: No living Killers → Civilians have won (Killer was eliminated)
    if (livingKillers.length === 0) {
      return {
        winner: "Civilians",
        reason: "The Killer has been eliminated.",
      };
    }

    // Rule 2: Killer dominance — living Killers >= living non-Killers
    if (livingKillers.length >= livingNonKillers.length) {
      return {
        winner: "Killer",
        reason: "The Killer now controls the town.",
      };
    }

    return null;
  }

  /**
   * Transitions the room to a new phase.
   * Cancels any existing phase timer, updates room.phase, then starts
   * a new phase timer if the phase has a default duration.
   *
   * The optional `onExpire` callback is forwarded to `startPhaseTimer`
   * and fires when the timer elapses.
   *
   * The optional `emit` callback is called after updating room.phase and
   * receives the event name and a payload describing the new phase state.
   * This enables callers (and tests) to observe phase-change events without
   * coupling PhaseController to a specific event-emitter library.
   *
   * Requirements: 5.6, 8.2, 8.3, 9.9, 10.1, 10.3, 11.6, 11.7, 16.2
   */
  transitionTo(
    room: Room,
    phase: GamePhase,
    onExpire?: () => void,
    duration?: number,
    emit?: (event: string, payload: unknown) => void
  ): void {
    // Cancel any running timer before transitioning
    this.cancelPhaseTimer(room);

    // Update the room phase
    room.phase = phase;

    // Notify observers of the phase change
    if (emit) {
      emit("phaseChanged", {
        phase: room.phase,
        roomCode: room.roomCode,
        players: Array.from(room.players.values()),
      });
    }

    // Determine timer duration for this phase
    const defaultDuration = PHASE_TIMER_DEFAULTS[phase];
    const timerDuration = duration ?? defaultDuration;

    // Start a timer only if there is a duration for this phase and a callback
    if (timerDuration !== undefined && onExpire) {
      this.startPhaseTimer(room, phase, timerDuration, onExpire);
    }
  }

  /**
   * Starts a phase timer for the given room and phase.
   * Stores the NodeJS.Timeout handle on room.gameState.phaseTimer.
   * Clamps Discussion phase duration to the valid range [10s, 600s].
   * Fires `onExpire` callback after `duration` milliseconds.
   *
   * Requirements: 5.6, 8.3, 9.9, 10.1, 11.7
   */
  startPhaseTimer(
    room: Room,
    phase: GamePhase,
    duration: number,
    onExpire: () => void
  ): void {
    if (!room.gameState) {
      throw new Error("Cannot start phase timer: game has not started.");
    }

    // Cancel any existing timer first
    this.cancelPhaseTimer(room);

    // Clamp Discussion timer to valid range
    let clampedDuration = duration;
    if (phase === GamePhase.Discussion) {
      clampedDuration = Math.max(
        DISCUSSION_TIMER_MIN_MS,
        Math.min(DISCUSSION_TIMER_MAX_MS, duration)
      );
    }

    room.gameState.phaseTimer = setTimeout(() => {
      // Clear the timer reference before firing the callback
      if (room.gameState) {
        room.gameState.phaseTimer = null;
      }
      onExpire();
    }, clampedDuration);
  }

  /**
   * Cancels the active phase timer for the given room.
   * Clears the timeout and sets room.gameState.phaseTimer to null.
   *
   * Requirements: 5.6, 8.3, 10.3
   */
  cancelPhaseTimer(room: Room): void {
    if (!room.gameState) {
      return;
    }

    if (room.gameState.phaseTimer !== null) {
      clearTimeout(room.gameState.phaseTimer);
      room.gameState.phaseTimer = null;
    }
  }
}
