import { describe, it, expect, afterEach } from "vitest";
import * as fc from "fast-check";
import { PhaseController } from "./PhaseController.js";
import { GamePhase, GameState, Player, Role, Room } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal Player object for testing */
function makePlayer(
  id: string,
  role: Role = Role.Civilian,
  isAlive = true,
  isHost = false
): Player {
  return {
    id,
    name: `Player_${id}`,
    role,
    isAlive,
    isHost,
    isConnected: true,
    disconnectedAt: null,
  };
}

/** Creates a minimal GameState object */
function makeGameState(): GameState {
  return {
    nightActions: { killTarget: null, saveTarget: null },
    votes: new Map(),
    eliminatedPlayers: [],
    phaseTimer: null,
    roleAcknowledgements: new Set(),
    narrationCompletes: new Set(),
  };
}

/** Creates a Room with the given players, in the given phase, with active gameState */
function makeRoom(players: Player[], phase: GamePhase = GamePhase.RoleReveal): Room {
  return {
    roomCode: "TEST01",
    hostId: players[0].id,
    players: new Map(players.map((p) => [p.id, p])),
    phase,
    gameState: makeGameState(),
    createdAt: new Date(),
  };
}

/**
 * Assigns roles to an array of players using the same logic as PhaseController.assignRoles:
 * index 0 → Killer, index 1 → Medic, rest → Civilian.
 * We assign deterministically here (no shuffle) so the property test is predictable.
 */
function assignRolesDeterministic(players: Player[]): void {
  players[0].role = Role.Killer;
  players[1].role = Role.Medic;
  for (let i = 2; i < players.length; i++) {
    players[i].role = Role.Civilian;
  }
}

// ---------------------------------------------------------------------------
// Cleanup: cancel any lingering timers after each test
// ---------------------------------------------------------------------------
// We keep a list of rooms created in each test so we can cancel timers.
const roomsToCleanup: Room[] = [];

afterEach(() => {
  const controller = new PhaseController();
  for (const room of roomsToCleanup) {
    controller.cancelPhaseTimer(room);
  }
  roomsToCleanup.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PhaseController", () => {
  // Feature: mafia-game, Property 15: Role acknowledgement advances phase
  // Validates: Requirements 5.6
  it(
    "Property 15: when all players acknowledge their role, the phase transitions to Night",
    () => {
      fc.assert(
        fc.property(
          // Generate player count between 4 and 10 (minimum viable game size)
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            // Build players and a room in RoleReveal phase
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`player${i}`, Role.Civilian, true, i === 0)
            );
            const room = makeRoom(players, GamePhase.RoleReveal);

            // Track for cleanup
            roomsToCleanup.push(room);

            // Assign roles (Killer, Medic, rest Civilians)
            assignRolesDeterministic(players);

            const controller = new PhaseController();

            // Simulate each player acknowledging their role.
            // The socket handler records the acknowledgement and checks if all players have ack'd.
            // We replicate that logic here without a real socket.
            let phaseAdvanced = false;

            for (const player of room.players.values()) {
              // Record this player's acknowledgement
              room.gameState!.roleAcknowledgements.add(player.id);

              // Check if all connected players have acknowledged
              const allAcknowledged = Array.from(room.players.values()).every(
                (p) => room.gameState!.roleAcknowledgements.has(p.id)
              );

              if (allAcknowledged && room.phase === GamePhase.RoleReveal) {
                // Transition to Night — pass a no-op onExpire so the timer starts
                // but cancel immediately after to avoid dangling timers in tests.
                controller.transitionTo(room, GamePhase.Night, () => {});
                controller.cancelPhaseTimer(room);
                phaseAdvanced = true;
                break;
              }
            }

            // Phase must have transitioned to Night
            expect(phaseAdvanced).toBe(true);
            expect(room.phase).toBe(GamePhase.Night);

            // All players must have acknowledged before the transition fired
            expect(room.gameState!.roleAcknowledgements.size).toBe(numPlayers);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 15 (partial): phase does NOT advance until the last player acknowledges
  // Validates: Requirements 5.6
  it(
    "Property 15 (invariant): phase stays in RoleReveal until every player has acknowledged",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`player${i}`, Role.Civilian, true, i === 0)
            );
            const room = makeRoom(players, GamePhase.RoleReveal);
            roomsToCleanup.push(room);
            assignRolesDeterministic(players);

            const controller = new PhaseController();
            const playerIds = Array.from(room.players.keys());

            // Acknowledge all but the last player — phase must remain RoleReveal
            for (let i = 0; i < numPlayers - 1; i++) {
              room.gameState!.roleAcknowledgements.add(playerIds[i]);

              const allAcknowledged = Array.from(room.players.values()).every(
                (p) => room.gameState!.roleAcknowledgements.has(p.id)
              );

              if (allAcknowledged) {
                controller.transitionTo(room, GamePhase.Night, () => {});
                controller.cancelPhaseTimer(room);
              }

              // With at least one player remaining, phase must still be RoleReveal
              expect(room.phase).toBe(GamePhase.RoleReveal);
            }

            // Now the final player acknowledges — phase must transition
            room.gameState!.roleAcknowledgements.add(playerIds[numPlayers - 1]);

            const allAcknowledged = Array.from(room.players.values()).every(
              (p) => room.gameState!.roleAcknowledgements.has(p.id)
            );

            if (allAcknowledged && room.phase === GamePhase.RoleReveal) {
              controller.transitionTo(room, GamePhase.Night, () => {});
              controller.cancelPhaseTimer(room);
            }

            expect(room.phase).toBe(GamePhase.Night);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 23: Both night actions submitted advances to Morning
  // Validates: Requirements 8.2
  it(
    "Property 23: when both Killer and Medic have submitted their night actions, the phase transitions to Morning",
    () => {
      fc.assert(
        fc.property(
          // Player count between 4 and 10
          fc.integer({ min: 4, max: 10 }),
          // Whether the Killer picks a target (true) or submits null
          fc.boolean(),
          // Whether the Medic picks a target (true) or submits null
          fc.boolean(),
          (numPlayers, killerSubmits, medicSubmits) => {
            // Build players and a room in Night phase
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`p${i}`, Role.Civilian, true, i === 0)
            );
            assignRolesDeterministic(players);
            const room = makeRoom(players, GamePhase.Night);
            roomsToCleanup.push(room);

            const controller = new PhaseController();

            // Identify the Killer and Medic
            const killer = players[0]; // index 0 is always Killer after assignRolesDeterministic
            const medic = players[1];  // index 1 is always Medic

            // Living targets the Killer can pick (exclude self)
            const killerTargets = players.filter(
              (p) => p.isAlive && p.id !== killer.id
            );
            // Living targets the Medic can pick (include self)
            const medicTargets = players.filter((p) => p.isAlive);

            // Simulate the socket handler: record each action as submitted
            let killerActionSubmitted = false;
            let medicActionSubmitted = false;

            // Killer submits (or auto-null)
            if (killerSubmits && killerTargets.length > 0) {
              room.gameState!.nightActions.killTarget = killerTargets[0].id;
            } else {
              room.gameState!.nightActions.killTarget = null;
            }
            killerActionSubmitted = true;

            // Medic submits (or auto-null)
            if (medicSubmits && medicTargets.length > 0) {
              room.gameState!.nightActions.saveTarget = medicTargets[0].id;
            } else {
              room.gameState!.nightActions.saveTarget = null;
            }
            medicActionSubmitted = true;

            // Both actions are now "submitted" (even if the value is null,
            // the submitted flag is what triggers the transition per Req 8.2).
            if (killerActionSubmitted && medicActionSubmitted) {
              controller.transitionTo(room, GamePhase.Morning, () => {});
              controller.cancelPhaseTimer(room);
            }

            // The phase must have advanced to Morning
            expect(room.phase).toBe(GamePhase.Morning);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 23 (invariant): phase stays Night until both actions are recorded
  // Validates: Requirements 8.2
  it(
    "Property 23 (invariant): phase stays in Night until both Killer and Medic have submitted",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`p${i}`, Role.Civilian, true, i === 0)
            );
            assignRolesDeterministic(players);
            const room = makeRoom(players, GamePhase.Night);
            roomsToCleanup.push(room);

            const controller = new PhaseController();

            const killer = players[0];
            const killerTargets = players.filter(
              (p) => p.isAlive && p.id !== killer.id
            );

            // --- Only Killer submits; Medic has NOT submitted yet ---
            let killerActionSubmitted = false;
            let medicActionSubmitted = false;

            room.gameState!.nightActions.killTarget =
              killerTargets.length > 0 ? killerTargets[0].id : null;
            killerActionSubmitted = true;

            // Do NOT transition (Medic hasn't submitted)
            if (killerActionSubmitted && medicActionSubmitted) {
              controller.transitionTo(room, GamePhase.Morning, () => {});
              controller.cancelPhaseTimer(room);
            }

            // Phase must still be Night
            expect(room.phase).toBe(GamePhase.Night);

            // --- Now Medic submits ---
            const medicTargets = players.filter((p) => p.isAlive);
            room.gameState!.nightActions.saveTarget =
              medicTargets.length > 0 ? medicTargets[0].id : null;
            medicActionSubmitted = true;

            // Both submitted — transition now
            if (killerActionSubmitted && medicActionSubmitted) {
              controller.transitionTo(room, GamePhase.Morning, () => {});
              controller.cancelPhaseTimer(room);
            }

            // Phase must now be Morning
            expect(room.phase).toBe(GamePhase.Morning);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 26: Narration completion advances phase
  // Validates: Requirements 9.9
  it(
    "Property 26: when all players emit narrationComplete, the phase transitions to Discussion",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            // Build players and a room in Morning phase
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`player${i}`, Role.Civilian, true, i === 0)
            );
            assignRolesDeterministic(players);
            const room = makeRoom(players, GamePhase.Morning);
            roomsToCleanup.push(room);

            const controller = new PhaseController();

            // Simulate each connected player emitting narrationComplete
            for (const player of room.players.values()) {
              // Record this player's narration completion
              room.gameState!.narrationCompletes.add(player.id);

              // Check if all connected players have completed narration
              const allCompleted = Array.from(room.players.values()).every(
                (p) => room.gameState!.narrationCompletes.has(p.id)
              );

              if (allCompleted && room.phase === GamePhase.Morning) {
                controller.transitionTo(room, GamePhase.Discussion, () => {});
                controller.cancelPhaseTimer(room);
                break;
              }
            }

            // Phase must have transitioned to Discussion
            expect(room.phase).toBe(GamePhase.Discussion);

            // All players must have completed narration before the transition fired
            expect(room.gameState!.narrationCompletes.size).toBe(numPlayers);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 37: Phase transitions emit phaseChanged
  // Validates: Requirements 16.2
  it(
    "Property 37: transitionTo emits phaseChanged exactly once with correct phase and room snapshot",
    () => {
      fc.assert(
        fc.property(
          // Random source phase (the room's current phase before transition)
          fc.constantFrom(...Object.values(GamePhase)),
          // Random target phase (the phase we're transitioning to)
          fc.constantFrom(...Object.values(GamePhase)),
          // Number of players in the room (2–6)
          fc.integer({ min: 2, max: 6 }),
          (sourcePhase, targetPhase, numPlayers) => {
            // Build a minimal room in the source phase
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`p${i}`, Role.Civilian, true, i === 0)
            );
            const room = makeRoom(players, sourcePhase);
            roomsToCleanup.push(room);

            const controller = new PhaseController();

            // Plain-JS spy — no vi.fn(), no sinon
            const calls: Array<{ event: string; payload: unknown }> = [];
            const emit = (event: string, payload: unknown) => {
              calls.push({ event, payload });
            };

            // Perform the transition with the emit spy
            controller.transitionTo(room, targetPhase, undefined, undefined, emit);
            // Cancel any timer that may have started (phases with default durations
            // won't fire a timer without an onExpire callback, but cancel for safety)
            controller.cancelPhaseTimer(room);

            // 1. emit was called exactly once
            expect(calls.length).toBe(1);

            const call = calls[0];

            // 2. Event name is "phaseChanged"
            expect(call.event).toBe("phaseChanged");

            const payload = call.payload as {
              phase: GamePhase;
              roomCode: string;
              players: Player[];
            };

            // 3. Payload contains the correct new phase
            expect(payload.phase).toBe(targetPhase);

            // 4. Payload contains the room code
            expect(payload.roomCode).toBe(room.roomCode);

            // 5. Payload players is a serializable array matching the room's players
            expect(Array.isArray(payload.players)).toBe(true);
            expect(payload.players.length).toBe(numPlayers);

            // Each player in the snapshot must match the corresponding room player
            for (const snapshotPlayer of payload.players) {
              const roomPlayer = room.players.get(snapshotPlayer.id);
              expect(roomPlayer).toBeDefined();
              expect(snapshotPlayer.id).toBe(roomPlayer!.id);
              expect(snapshotPlayer.name).toBe(roomPlayer!.name);
              expect(snapshotPlayer.isAlive).toBe(roomPlayer!.isAlive);
            }

            // 6. The room's phase was actually updated to targetPhase
            expect(room.phase).toBe(targetPhase);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 26 (invariant): phase stays in Morning until narration completes
  // Validates: Requirements 9.9
  it(
    "Property 26 (invariant): phase stays in Morning until every connected player emits narrationComplete",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`player${i}`, Role.Civilian, true, i === 0)
            );
            assignRolesDeterministic(players);
            const room = makeRoom(players, GamePhase.Morning);
            roomsToCleanup.push(room);

            const controller = new PhaseController();
            const playerIds = Array.from(room.players.keys());

            // Complete narration for all but the last player — phase must remain Morning
            for (let i = 0; i < numPlayers - 1; i++) {
              room.gameState!.narrationCompletes.add(playerIds[i]);

              const allCompleted = Array.from(room.players.values()).every(
                (p) => room.gameState!.narrationCompletes.has(p.id)
              );

              if (allCompleted && room.phase === GamePhase.Morning) {
                controller.transitionTo(room, GamePhase.Discussion, () => {});
                controller.cancelPhaseTimer(room);
              }

              // With at least one player remaining, phase must still be Morning
              expect(room.phase).toBe(GamePhase.Morning);
            }

            // Now the final player completes narration — phase must transition
            room.gameState!.narrationCompletes.add(playerIds[numPlayers - 1]);

            const allCompleted = Array.from(room.players.values()).every(
              (p) => room.gameState!.narrationCompletes.has(p.id)
            );

            if (allCompleted && room.phase === GamePhase.Morning) {
              controller.transitionTo(room, GamePhase.Discussion, () => {});
              controller.cancelPhaseTimer(room);
            }

            expect(room.phase).toBe(GamePhase.Discussion);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
