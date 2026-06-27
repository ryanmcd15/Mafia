import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { SpyfallModule } from "./SpyfallModule.js";
import { GameModuleContext } from "../../types.js";
import { SPYFALL_LOCATIONS } from "./types.js";

// ─── Mock Helpers ────────────────────────────────────────────────────

function createMockContext(playerCount: number) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i}`,
    isConnected: true,
  }));

  const emittedEvents: Array<{
    event: string;
    payload: unknown;
    target?: string;
  }> = [];

  const context: GameModuleContext = {
    emitToRoom: (event, payload) => emittedEvents.push({ event, payload }),
    emitToPlayer: (socketId, event, payload) =>
      emittedEvents.push({ event, payload, target: socketId }),
    signalGameOver: (results) =>
      emittedEvents.push({ event: "signalGameOver", payload: results }),
    getPlayers: () => [...players],
  };

  return { players, context, emittedEvents };
}

function createMockContextWithDisconnected(
  playerCount: number,
  disconnectedIndices: number[]
) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i}`,
    isConnected: !disconnectedIndices.includes(i),
  }));

  const emittedEvents: Array<{
    event: string;
    payload: unknown;
    target?: string;
  }> = [];

  const context: GameModuleContext = {
    emitToRoom: (event, payload) => emittedEvents.push({ event, payload }),
    emitToPlayer: (socketId, event, payload) =>
      emittedEvents.push({ event, payload, target: socketId }),
    signalGameOver: (results) =>
      emittedEvents.push({ event: "signalGameOver", payload: results }),
    getPlayers: () => [...players],
  };

  return { players, context, emittedEvents };
}

// ─── Property Tests ──────────────────────────────────────────────────

describe("SpyfallModule - Property-Based Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Feature: party-games-platform, Property 21: Spyfall role assignment and information hiding
  // **Validates: Requirements 11.1, 11.2, 11.3, 11.6**
  describe("Property 21: Spyfall role assignment and information hiding", () => {
    it("assigns exactly 1 spy, non-spy players receive location, spy receives all locations but not the location", () => {
      fc.assert(
        fc.property(fc.integer({ min: 4, max: 10 }), (playerCount) => {
          const { players, context, emittedEvents } =
            createMockContext(playerCount);
          const module = new SpyfallModule();
          module.start(context);

          // Filter roleAssigned events
          const roleEvents = emittedEvents.filter(
            (e) => e.event === "roleAssigned"
          );

          // Should have one roleAssigned per player
          expect(roleEvents).toHaveLength(playerCount);

          // Exactly 1 spy
          const spyEvents = roleEvents.filter(
            (e) => (e.payload as any).isSpy === true
          );
          expect(spyEvents).toHaveLength(1);

          // Non-spy players
          const nonSpyEvents = roleEvents.filter(
            (e) => (e.payload as any).isSpy === false
          );
          expect(nonSpyEvents).toHaveLength(playerCount - 1);

          // All non-spy players receive the selected location
          const locations = nonSpyEvents.map(
            (e) => (e.payload as any).location
          );
          const uniqueLocations = new Set(locations);
          expect(uniqueLocations.size).toBe(1);
          const assignedLocation = locations[0];
          expect(assignedLocation).not.toBeNull();
          expect(SPYFALL_LOCATIONS).toContain(assignedLocation);

          // Spy does NOT receive the location
          const spyPayload = spyEvents[0].payload as any;
          expect(spyPayload.location).toBeNull();

          // Spy receives the full list of all possible locations
          expect(spyPayload.allLocations).toEqual(
            expect.arrayContaining(SPYFALL_LOCATIONS)
          );
          expect(spyPayload.allLocations).toHaveLength(
            SPYFALL_LOCATIONS.length
          );

          module.end();
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 22: Spyfall turn order fairness
  // **Validates: Requirements 12.4, 12.5**
  describe("Property 22: Spyfall turn order fairness", () => {
    it("each player serves as questioner either floor(K/N) or ceil(K/N) times over K turns", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          fc.integer({ min: 4, max: 30 }),
          (playerCount, totalTurns) => {
            const { players, context, emittedEvents } =
              createMockContext(playerCount);
            const module = new SpyfallModule();
            module.start(context);

            // Track who was questioner each turn
            const questionerCounts = new Map<string, number>();
            for (const p of players) {
              questionerCounts.set(p.id, 0);
            }

            // The first turn is emitted in start()
            const firstTurnEvent = emittedEvents.find(
              (e) => e.event === "turnStarted"
            );
            let currentQuestioner = (firstTurnEvent?.payload as any)
              ?.currentQuestioner;
            questionerCounts.set(
              currentQuestioner,
              (questionerCounts.get(currentQuestioner) ?? 0) + 1
            );

            // Simulate totalTurns - 1 additional turn completions
            for (let turn = 1; turn < totalTurns; turn++) {
              // Select a target (anyone other than current questioner)
              const target = players.find(
                (p) => p.id !== currentQuestioner
              )!;
              module.handleEvent(currentQuestioner, "selectTarget", {
                targetId: target.id,
              });
              // Target signals answer complete to advance turn
              module.handleEvent(target.id, "answerComplete", {});

              // Find the latest turnStarted event
              const turnEvents = emittedEvents.filter(
                (e) => e.event === "turnStarted"
              );
              const latestTurnEvent = turnEvents[turnEvents.length - 1];
              currentQuestioner = (latestTurnEvent.payload as any)
                .currentQuestioner;
              questionerCounts.set(
                currentQuestioner,
                (questionerCounts.get(currentQuestioner) ?? 0) + 1
              );
            }

            // Verify fairness: each player should have floor(K/N) or ceil(K/N) turns
            const expectedMin = Math.floor(totalTurns / playerCount);
            const expectedMax = Math.ceil(totalTurns / playerCount);

            for (const [playerId, count] of questionerCounts.entries()) {
              expect(count).toBeGreaterThanOrEqual(expectedMin);
              expect(count).toBeLessThanOrEqual(expectedMax);
            }

            module.end();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 23: Spyfall vote tally outcome
  // **Validates: Requirements 13.6, 13.7, 13.8, 13.9**
  describe("Property 23: Spyfall vote tally outcome", () => {
    it("strict majority accusing spy = Players Win; accusing non-spy = Spy Wins; tie = Spy Wins", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          fc.nat(),
          (playerCount, seed) => {
            const { players, context, emittedEvents } =
              createMockContext(playerCount);
            const module = new SpyfallModule();
            module.start(context);

            // Find out who the spy is from roleAssigned events
            const spyEvent = emittedEvents.find(
              (e) =>
                e.event === "roleAssigned" &&
                (e.payload as any).isSpy === true
            );
            const spyId = spyEvent!.target!;

            // Transition to voting phase
            module.handleEvent(players[0].id, "callVote", {});

            // Determine vote distribution based on seed
            const connectedPlayers = players.filter((p) => p.isConnected);
            const majorityThreshold =
              Math.floor(connectedPlayers.length / 2) + 1;

            // Use seed to decide scenario: 0 = vote for spy (majority), 1 = vote for non-spy (majority), 2 = tie
            const scenario = seed % 3;

            emittedEvents.length = 0; // Clear to capture gameOver

            if (scenario === 0) {
              // Majority votes for the spy
              for (let i = 0; i < connectedPlayers.length; i++) {
                module.handleEvent(connectedPlayers[i].id, "submitVote", {
                  accusedId: spyId,
                });
              }

              const gameOverEvent = emittedEvents.find(
                (e) => e.event === "gameOver"
              );
              expect(gameOverEvent).toBeDefined();
              expect((gameOverEvent!.payload as any).outcome).toBe(
                "Players Win"
              );
            } else if (scenario === 1) {
              // Majority votes for a non-spy player
              const nonSpyPlayer = players.find((p) => p.id !== spyId)!;
              for (let i = 0; i < connectedPlayers.length; i++) {
                module.handleEvent(connectedPlayers[i].id, "submitVote", {
                  accusedId: nonSpyPlayer.id,
                });
              }

              const gameOverEvent = emittedEvents.find(
                (e) => e.event === "gameOver"
              );
              expect(gameOverEvent).toBeDefined();
              expect((gameOverEvent!.payload as any).outcome).toBe(
                "Spy Wins"
              );
            } else {
              // Create a tie: split votes evenly among two players
              const target1 = players[0].id;
              const target2 = players[1].id;
              for (let i = 0; i < connectedPlayers.length; i++) {
                const accusedId = i % 2 === 0 ? target1 : target2;
                module.handleEvent(connectedPlayers[i].id, "submitVote", {
                  accusedId,
                });
              }

              const gameOverEvent = emittedEvents.find(
                (e) => e.event === "gameOver"
              );
              expect(gameOverEvent).toBeDefined();
              // Tie OR no strict majority → Spy Wins
              const outcome = (gameOverEvent!.payload as any).outcome;
              // With even split, either it's a tie (Spy Wins) or one side has majority
              // If playerCount is odd and perfectly split, one side has majority
              const halfFloor = Math.floor(connectedPlayers.length / 2);
              const halfCeil = Math.ceil(connectedPlayers.length / 2);
              if (halfFloor === halfCeil) {
                // Even number of players: perfect tie
                expect(outcome).toBe("Spy Wins");
              } else {
                // Odd: one side gets more votes
                const votesForTarget1 = Math.ceil(
                  connectedPlayers.length / 2
                );
                if (votesForTarget1 >= majorityThreshold) {
                  // target1 has majority
                  if (target1 === spyId) {
                    expect(outcome).toBe("Players Win");
                  } else {
                    expect(outcome).toBe("Spy Wins");
                  }
                } else {
                  expect(outcome).toBe("Spy Wins");
                }
              }
            }

            module.end();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 24: Spy guess outcome
  // **Validates: Requirements 14.4, 14.5**
  describe("Property 24: Spy guess outcome", () => {
    it("correct spy guess = Spy Wins; incorrect guess = Players Win", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          fc.boolean(),
          (playerCount, guessCorrectly) => {
            const { players, context, emittedEvents } =
              createMockContext(playerCount);
            const module = new SpyfallModule();
            module.start(context);

            // Find out who the spy is and what the actual location is
            const spyEvent = emittedEvents.find(
              (e) =>
                e.event === "roleAssigned" &&
                (e.payload as any).isSpy === true
            );
            const spyId = spyEvent!.target!;

            // Get the actual location from a non-spy player's event
            const nonSpyEvent = emittedEvents.find(
              (e) =>
                e.event === "roleAssigned" &&
                (e.payload as any).isSpy === false
            );
            const actualLocation = (nonSpyEvent!.payload as any).location;

            emittedEvents.length = 0; // Clear to capture gameOver

            if (guessCorrectly) {
              // Spy guesses the correct location
              module.handleEvent(spyId, "spyGuess", {
                location: actualLocation,
              });

              const gameOverEvent = emittedEvents.find(
                (e) => e.event === "gameOver"
              );
              expect(gameOverEvent).toBeDefined();
              expect((gameOverEvent!.payload as any).outcome).toBe(
                "Spy Wins"
              );
            } else {
              // Spy guesses an incorrect location
              const wrongLocation = SPYFALL_LOCATIONS.find(
                (loc) => loc !== actualLocation
              )!;
              module.handleEvent(spyId, "spyGuess", {
                location: wrongLocation,
              });

              const gameOverEvent = emittedEvents.find(
                (e) => e.event === "gameOver"
              );
              expect(gameOverEvent).toBeDefined();
              expect((gameOverEvent!.payload as any).outcome).toBe(
                "Players Win"
              );
            }

            module.end();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: party-games-platform, Property 26: Disconnected player abstains from voting
  // **Validates: Requirements 19.3**
  describe("Property 26: Disconnected player abstains from voting", () => {
    it("disconnected player does not vote and their absence does not affect tally outcome", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 10 }),
          fc.integer({ min: 1, max: 2 }),
          (playerCount, disconnectedCount) => {
            // Ensure we have enough connected players to still have a game
            const disconnectedIndices = Array.from(
              { length: disconnectedCount },
              (_, i) => playerCount - 1 - i
            );

            const { players, context, emittedEvents } =
              createMockContextWithDisconnected(
                playerCount,
                disconnectedIndices
              );
            const module = new SpyfallModule();
            module.start(context);

            // Find spy
            const spyEvent = emittedEvents.find(
              (e) =>
                e.event === "roleAssigned" &&
                (e.payload as any).isSpy === true
            );
            const spyId = spyEvent!.target!;

            // Transition to voting
            module.handleEvent(players[0].id, "callVote", {});

            emittedEvents.length = 0;

            // Only connected players submit votes - all vote for the spy
            const connectedPlayers = players.filter((p) => p.isConnected);
            for (const p of connectedPlayers) {
              module.handleEvent(p.id, "submitVote", { accusedId: spyId });
            }

            // Verify game over happened (all connected players voted)
            const gameOverEvent = emittedEvents.find(
              (e) => e.event === "gameOver"
            );
            expect(gameOverEvent).toBeDefined();

            // The outcome should be based only on connected players' votes
            const payload = gameOverEvent!.payload as any;
            // Votes from disconnected players should NOT be in the tally
            const votes = payload.votes as Record<string, string>;
            for (const disconnectedIdx of disconnectedIndices) {
              const disconnectedId = `player-${disconnectedIdx}`;
              expect(votes[disconnectedId]).toBeUndefined();
            }

            // Since all connected players voted for spy and that's a majority, Players Win
            const majorityThreshold =
              Math.floor(connectedPlayers.length / 2) + 1;
            if (connectedPlayers.length >= majorityThreshold) {
              expect(payload.outcome).toBe("Players Win");
            }

            module.end();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
