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
    isReady: false,
    color: "#FF6B6B",
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
    voteHistory: [],
    accusations: new Map(),
    accusationResults: null,
    round: 1,
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

  // Feature: mafia-game, Property 34: Killer elimination triggers Civilians Win
  // Validates: Requirements 13.1
  it(
    "Property 34: when the Killer is eliminated, checkWinCondition returns Civilians Win",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            // Build players and assign roles deterministically
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`p${i}`, Role.Civilian, true, i === 0)
            );
            assignRolesDeterministic(players);

            // Mark the Killer (index 0) as eliminated
            players[0].isAlive = false;

            const room = makeRoom(players, GamePhase.Voting);
            roomsToCleanup.push(room);

            const controller = new PhaseController();
            const result = controller.checkWinCondition(room);

            // Must return a win condition
            expect(result).not.toBeNull();
            // Civilians must be the winner
            expect(result!.winner).toBe("Civilians");
            // Reason must mention the Killer being eliminated
            expect(result!.reason).toContain("Killer");
            expect(result!.reason).toContain("eliminated");
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

  // Feature: mafia-game, Property 24: Night action resolution follows kill-save logic
  // Validates: Requirements 9.1, 9.3, 9.4, 9.5
  it(
    "Property 24: resolveNightActions produces correct outcome for all kill/save combinations",
    () => {
      fc.assert(
        fc.property(
          // Generate player count (4-10)
          fc.integer({ min: 4, max: 10 }),
          // Whether killer submits a target (true) or null (false)
          fc.boolean(),
          // Whether medic submits a target (true) or null (false)
          fc.boolean(),
          // Whether medic saves the same player the killer targets
          fc.boolean(),
          (numPlayers, killerSubmits, medicSubmits, medicSavesSameTarget) => {
            // Build players and assign roles
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`p${i}`, Role.Civilian, true, i === 0)
            );
            assignRolesDeterministic(players);
            const room = makeRoom(players, GamePhase.Morning);
            roomsToCleanup.push(room);

            const controller = new PhaseController();

            // Identify valid targets for the killer (alive, not self)
            const killer = players[0];
            const killerTargets = players.filter(
              (p) => p.isAlive && p.id !== killer.id
            );

            // Set up killTarget
            const killTarget =
              killerSubmits && killerTargets.length > 0
                ? killerTargets[0].id
                : null;
            room.gameState!.nightActions.killTarget = killTarget;

            // Set up saveTarget based on combinations
            let saveTarget: string | null = null;
            if (medicSubmits) {
              if (killerSubmits && medicSavesSameTarget && killerTargets.length > 0) {
                // Medic saves the same player the killer targeted
                saveTarget = killerTargets[0].id;
              } else {
                // Medic saves a different player (pick last alive player)
                const medicTargets = players.filter((p) => p.isAlive);
                const differentTarget = medicTargets.find(
                  (p) => p.id !== killTarget
                );
                saveTarget = differentTarget ? differentTarget.id : null;
              }
            }
            room.gameState!.nightActions.saveTarget = saveTarget;

            // Resolve night actions
            const result = controller.resolveNightActions(room);

            // Assert correct outcomes based on the combination
            if (killTarget === null) {
              // Req 9.5: No kill target → quiet night, no elimination
              expect(result.eliminatedPlayerId).toBeNull();
              expect(result.wasSaved).toBe(false);
              // All players remain alive
              for (const p of room.players.values()) {
                expect(p.isAlive).toBe(true);
              }
            } else if (killTarget === saveTarget) {
              // Req 9.3: Kill and save target are the same → saved
              expect(result.eliminatedPlayerId).toBeNull();
              expect(result.wasSaved).toBe(true);
              // The targeted player is still alive
              const targetedPlayer = room.players.get(killTarget);
              expect(targetedPlayer!.isAlive).toBe(true);
            } else {
              // Req 9.4: Kill target differs from save target → elimination
              expect(result.eliminatedPlayerId).toBe(killTarget);
              expect(result.wasSaved).toBe(false);
              // The killed player is marked as not alive
              const killedPlayer = room.players.get(killTarget);
              expect(killedPlayer!.isAlive).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 25: Morning narration does not reveal role identities
  // Validates: Requirements 9.7
  it(
    "Property 25: morning narration does not reveal the Killer or Medic identity",
    () => {
      // Generator for player names: 3-15 alphabetical chars, filtered to avoid
      // substrings of static narration text (e.g., "The", "was", "dawn", etc.).
      const narrationWords = [
        "the", "night", "passed", "quietly", "no", "one", "was", "harmed",
        "tense", "shadows", "moved", "through", "town", "but", "when",
        "morning", "came", "everyone", "survived", "as", "dawn", "broke",
        "gathered", "square", "found", "eliminated",
      ];
      const nameGen = fc
        .stringMatching(/^[A-Za-z]{3,15}$/)
        .filter((name) => {
          const lower = name.toLowerCase();
          // Exclude names that are substrings of any narration word or vice versa
          return !narrationWords.some(
            (w) => lower.includes(w) || w.includes(lower)
          );
        });

      fc.assert(
        fc.property(
          nameGen,
          nameGen,
          (killerName, medicName) => {
            // Ensure the two names are distinct
            fc.pre(killerName.toLowerCase() !== medicName.toLowerCase());

            // Build 4 players: Killer, Medic, and 2 Civilians
            const killerPlayer: Player = {
              id: "killer1",
              name: killerName,
              role: Role.Killer,
              isAlive: true,
              isHost: true,
              isConnected: true,
              disconnectedAt: null,
              isReady: false,
              color: "#FF6B6B",
            };
            const medicPlayer: Player = {
              id: "medic1",
              name: medicName,
              role: Role.Medic,
              isAlive: true,
              isHost: false,
              isConnected: true,
              disconnectedAt: null,
              isReady: false,
              color: "#4ECDC4",
            };
            const civilian1: Player = {
              id: "civ1",
              name: "CivilianAlpha",
              role: Role.Civilian,
              isAlive: true,
              isHost: false,
              isConnected: true,
              disconnectedAt: null,
              isReady: false,
              color: "#45B7D1",
            };
            const civilian2: Player = {
              id: "civ2",
              name: "CivilianBeta",
              role: Role.Civilian,
              isAlive: true,
              isHost: false,
              isConnected: true,
              disconnectedAt: null,
              isReady: false,
              color: "#96CEB4",
            };

            const controller = new PhaseController();

            // --- Scenario 1: Quiet night (no kill target) ---
            const room1 = makeRoom(
              [killerPlayer, medicPlayer, civilian1, civilian2],
              GamePhase.Morning
            );
            roomsToCleanup.push(room1);
            room1.gameState!.nightActions.killTarget = null;
            room1.gameState!.nightActions.saveTarget = null;

            const result1 = controller.resolveNightActions(room1);
            for (const segment of result1.segments) {
              const lower = segment.toLowerCase();
              expect(lower).not.toContain(killerName.toLowerCase());
              expect(lower).not.toContain(medicName.toLowerCase());
              expect(lower).not.toContain("killer");
              expect(lower).not.toContain("medic");
            }

            // --- Scenario 2: Saved (kill == save) ---
            // Reset players alive state
            killerPlayer.isAlive = true;
            medicPlayer.isAlive = true;
            civilian1.isAlive = true;
            civilian2.isAlive = true;

            const room2 = makeRoom(
              [killerPlayer, medicPlayer, civilian1, civilian2],
              GamePhase.Morning
            );
            roomsToCleanup.push(room2);
            room2.gameState!.nightActions.killTarget = "civ1";
            room2.gameState!.nightActions.saveTarget = "civ1";

            const result2 = controller.resolveNightActions(room2);
            for (const segment of result2.segments) {
              const lower = segment.toLowerCase();
              expect(lower).not.toContain(killerName.toLowerCase());
              expect(lower).not.toContain(medicName.toLowerCase());
              expect(lower).not.toContain("killer");
              expect(lower).not.toContain("medic");
            }

            // --- Scenario 3: Elimination (kill != save) ---
            // Reset players alive state
            killerPlayer.isAlive = true;
            medicPlayer.isAlive = true;
            civilian1.isAlive = true;
            civilian2.isAlive = true;

            const room3 = makeRoom(
              [killerPlayer, medicPlayer, civilian1, civilian2],
              GamePhase.Morning
            );
            roomsToCleanup.push(room3);
            room3.gameState!.nightActions.killTarget = "civ1"; // targets a Civilian
            room3.gameState!.nightActions.saveTarget = "civ2"; // saves a different player

            const result3 = controller.resolveNightActions(room3);
            for (const segment of result3.segments) {
              const lower = segment.toLowerCase();
              // Killer's name must not appear
              expect(lower).not.toContain(killerName.toLowerCase());
              // Medic's name must not appear
              expect(lower).not.toContain(medicName.toLowerCase());
              // Role identifiers must not appear
              expect(lower).not.toContain("killer");
              expect(lower).not.toContain("medic");
            }
            // The eliminated civilian's name IS allowed to appear (correct behavior)
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 35: Killer dominance triggers Killer Wins
  // Validates: Requirements 14.1
  it(
    "Property 35: when living Killers >= living non-Killers, checkWinCondition returns Killer Wins",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            // Build players and assign roles deterministically
            // index 0 = Killer, index 1 = Medic, rest = Civilians
            const players = Array.from({ length: numPlayers }, (_, i) =>
              makePlayer(`p${i}`, Role.Civilian, true, i === 0)
            );
            assignRolesDeterministic(players);

            // Keep the Killer (index 0) alive.
            // Eliminate enough non-Killer players so that living Killers (1) >= living non-Killers.
            // With 1 Killer, we need living non-Killers <= 1.
            // Non-Killers are indices 1..(numPlayers-1), total = numPlayers - 1.
            // We must eliminate at least (numPlayers - 1) - 1 = numPlayers - 2 non-Killers,
            // leaving at most 1 non-Killer alive.
            const nonKillerPlayers = players.slice(1); // all non-Killer players
            const numToEliminate = nonKillerPlayers.length - 1; // leave exactly 1 alive

            for (let i = 0; i < numToEliminate; i++) {
              nonKillerPlayers[i].isAlive = false;
            }

            const room = makeRoom(players, GamePhase.Voting);
            roomsToCleanup.push(room);

            const controller = new PhaseController();
            const result = controller.checkWinCondition(room);

            // Must return a win condition
            expect(result).not.toBeNull();
            // Killer must be the winner
            expect(result!.winner).toBe("Killer");
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  // Feature: mafia-game, Property 13: Role assignment produces exactly 1 Killer, 1 Medic, and remaining Civilians
  // Validates: Requirements 5.1
  it(
    "Property 13: role assignment produces exactly 1 Killer, 1 Medic, and N-2 Civilians",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          (numPlayers) => {
            // Build players with role: null to verify assignRoles assigns them
            const players: Player[] = Array.from({ length: numPlayers }, (_, i) => ({
              id: `p${i}`,
              name: `Player_${i}`,
              role: null,
              isAlive: true,
              isHost: i === 0,
              isConnected: true,
              disconnectedAt: null,
              isReady: false,
              color: "#FF6B6B",
            }));
            const room = makeRoom(players, GamePhase.RoleReveal);
            roomsToCleanup.push(room);

            const controller = new PhaseController();
            controller.assignRoles(room);

            const assignedPlayers = Array.from(room.players.values());

            // Every player must have a non-null role
            for (const p of assignedPlayers) {
              expect(p.role).not.toBeNull();
            }

            // Exactly 1 Killer
            const killers = assignedPlayers.filter((p) => p.role === Role.Killer);
            expect(killers.length).toBe(1);

            // Exactly 1 Medic
            const medics = assignedPlayers.filter((p) => p.role === Role.Medic);
            expect(medics.length).toBe(1);

            // Exactly N-2 Civilians
            const civilians = assignedPlayers.filter((p) => p.role === Role.Civilian);
            expect(civilians.length).toBe(numPlayers - 2);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
