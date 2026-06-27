import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { TwoTruthsOneLieModule } from "./TwoTruthsOneLieModule.js";
import { GameModuleContext } from "../../types.js";

// ─── Mock Helpers ────────────────────────────────────────────────────

function createMockContext(
  players: Array<{ id: string; name: string; isConnected: boolean }>
): GameModuleContext {
  return {
    emitToRoom: vi.fn(),
    emitToPlayer: vi.fn(),
    signalGameOver: vi.fn(),
    getPlayers: vi.fn().mockReturnValue(players),
  };
}

function createPlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    name: `Player${i}`,
    isConnected: true,
  }));
}

function makeStatements(lieIndex: number) {
  return [
    { text: "Statement A", isLie: lieIndex === 0 },
    { text: "Statement B", isLie: lieIndex === 1 },
    { text: "Statement C", isLie: lieIndex === 2 },
  ];
}

/**
 * Helper: submit statements for all players and transition to play phase.
 * Returns the module, context, and players.
 */
function setupPlayPhase(playerCount: number, lieIndex = 2) {
  const players = createPlayers(playerCount);
  const context = createMockContext(players);
  const module = new TwoTruthsOneLieModule();
  module.start(context);

  for (const player of players) {
    module.handleEvent(player.id, "submitStatements", {
      statements: makeStatements(lieIndex),
    });
  }

  return { module, context, players };
}

// ─── Property Tests ──────────────────────────────────────────────────

describe("TwoTruthsOneLieModule - Property Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Feature: party-games-platform, Property 15: Statement set validation (3 statements, 1-200 chars, exactly 1 lie)
  // Validates: Requirements 8.2, 8.3, 8.4
  it("Property 15: valid statement sets (3 statements, 1-200 chars, exactly 1 lie) are accepted", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 200 })
        ),
        fc.integer({ min: 0, max: 2 }),
        ([text1, text2, text3], lieIndex) => {
          const players = createPlayers(3);
          const context = createMockContext(players);
          const module = new TwoTruthsOneLieModule();
          module.start(context);

          const statements = [
            { text: text1, isLie: lieIndex === 0 },
            { text: text2, isLie: lieIndex === 1 },
            { text: text3, isLie: lieIndex === 2 },
          ];

          module.handleEvent(players[0].id, "submitStatements", { statements });

          // Should NOT have emitted an error
          const errorCalls = (context.emitToPlayer as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[1] === "error"
          );
          expect(errorCalls.length).toBe(0);

          // Should have emitted playerSubmitted to room
          expect(context.emitToRoom).toHaveBeenCalledWith(
            "playerSubmitted",
            expect.objectContaining({ playerId: players[0].id })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 15: Statement set validation (3 statements, 1-200 chars, exactly 1 lie)
  // Validates: Requirements 8.2, 8.3, 8.4
  it("Property 15: invalid statement sets (wrong count, wrong length, wrong lie count) are rejected", () => {
    // Sub-case: invalid text lengths
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.oneof(fc.constant(""), fc.string({ minLength: 201, maxLength: 400 })),
        (invalidIndex, invalidText) => {
          const players = createPlayers(3);
          const context = createMockContext(players);
          const module = new TwoTruthsOneLieModule();
          module.start(context);

          const texts = ["Valid text A", "Valid text B", "Valid text C"];
          texts[invalidIndex] = invalidText;

          const statements = texts.map((text, i) => ({
            text,
            isLie: i === 2,
          }));

          module.handleEvent(players[0].id, "submitStatements", { statements });

          // Should have emitted an error
          const errorCalls = (context.emitToPlayer as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[1] === "error"
          );
          expect(errorCalls.length).toBeGreaterThan(0);

          // Should NOT have emitted playerSubmitted
          expect(context.emitToRoom).not.toHaveBeenCalledWith(
            "playerSubmitted",
            expect.anything()
          );
        }
      ),
      { numRuns: 100 }
    );

    // Sub-case: wrong statement count (not exactly 3)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }).filter((n) => n !== 3),
        (count) => {
          const players = createPlayers(3);
          const context = createMockContext(players);
          const module = new TwoTruthsOneLieModule();
          module.start(context);

          const statements = Array.from({ length: count }, (_, i) => ({
            text: `Statement ${i}`,
            isLie: i === 0,
          }));

          module.handleEvent(players[0].id, "submitStatements", { statements });

          const errorCalls = (context.emitToPlayer as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[1] === "error"
          );
          expect(errorCalls.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );

    // Sub-case: wrong lie count (0 or 2+ lies)
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }).filter((n) => n !== 1),
        (lieCount) => {
          const players = createPlayers(3);
          const context = createMockContext(players);
          const module = new TwoTruthsOneLieModule();
          module.start(context);

          const statements = [
            { text: "Statement A", isLie: lieCount >= 1 },
            { text: "Statement B", isLie: lieCount >= 2 },
            { text: "Statement C", isLie: lieCount >= 3 },
          ];

          module.handleEvent(players[0].id, "submitStatements", { statements });

          const errorCalls = (context.emitToPlayer as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[1] === "error"
          );
          expect(errorCalls.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 16: Lie concealment until reveal
  // Validates: Requirements 8.7
  it("Property 16: lie is concealed from non-presenter players during play phase", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        (playerCount) => {
          const { module, context, players } = setupPlayPhase(playerCount);

          // Now in play phase. Get state for a non-presenter player.
          // The presenter is players[0] (first in submission order).
          const nonPresenter = players[1];
          const state = module.getState(nonPresenter.id) as {
            phase: string;
            votes: Record<string, number>;
            currentStatements: string[] | null;
          };

          expect(state.phase).toBe("play");
          // Votes should be empty (concealed during play)
          expect(state.votes).toEqual({});
          // currentStatements should only be text strings, NOT objects with isLie
          if (state.currentStatements) {
            for (const stmt of state.currentStatements) {
              expect(typeof stmt).toBe("string");
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 17: Statement presentation order differs from submission
  // Validates: Requirements 9.1
  it("Property 17: statement presentation order differs from submission order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        (playerCount) => {
          const players = createPlayers(playerCount);
          const context = createMockContext(players);
          const module = new TwoTruthsOneLieModule();
          module.start(context);

          // Submit distinct statements so we can check ordering
          const submissionTexts = ["Alpha first", "Beta second", "Gamma third"];
          for (const player of players) {
            module.handleEvent(player.id, "submitStatements", {
              statements: [
                { text: submissionTexts[0], isLie: false },
                { text: submissionTexts[1], isLie: false },
                { text: submissionTexts[2], isLie: true },
              ],
            });
          }

          // Find the roundStarted event emission
          const roundStartedCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === "roundStarted"
          );
          expect(roundStartedCalls.length).toBe(1);

          const payload = roundStartedCalls[0][1] as { statements: string[] };
          const presentedTexts = payload.statements;

          // The presented order should differ from submission order
          const isSameOrder =
            presentedTexts[0] === submissionTexts[0] &&
            presentedTexts[1] === submissionTexts[1] &&
            presentedTexts[2] === submissionTexts[2];
          expect(isSameOrder).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 18: Single vote per player per round
  // Validates: Requirements 9.4
  it("Property 18: duplicate votes are rejected with error", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
        (firstVote, secondVote) => {
          const { module, context, players } = setupPlayPhase(3);

          // players[0] is presenter (first in submission order), players[1] is voter
          const voter = players[1];

          // First vote should succeed
          module.handleEvent(voter.id, "submitLieVote", { statementIndex: firstVote });

          // Clear mock to isolate the second call
          (context.emitToPlayer as ReturnType<typeof vi.fn>).mockClear();

          // Second vote should be rejected
          module.handleEvent(voter.id, "submitLieVote", { statementIndex: secondVote });

          expect(context.emitToPlayer).toHaveBeenCalledWith(
            voter.id,
            "error",
            expect.objectContaining({
              message: "You have already voted this round.",
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 19: Correct lie identification scores +1 point
  // Validates: Requirements 9.6, 10.2
  it("Property 19: correct lie identification scores +1, incorrect scores 0", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        (lieIndex) => {
          const players = createPlayers(4);
          const context = createMockContext(players);
          const module = new TwoTruthsOneLieModule();

          // Mock Math.random to produce a known shuffle that rotates by 1 position
          // This makes the lie end up at (lieIndex + 2) % 3 after rotation [1,2,0]
          // Actually, let's just deterministically find where the lie ends up
          module.start(context);

          // Submit statements with known lie position for player 0
          const statementsP0 = [
            { text: "Truth A", isLie: lieIndex === 0 },
            { text: "Truth B", isLie: lieIndex === 1 },
            { text: "The Lie", isLie: lieIndex === 2 },
          ];

          module.handleEvent(players[0].id, "submitStatements", {
            statements: statementsP0,
          });

          // Other players submit generic statements
          for (let i = 1; i < players.length; i++) {
            module.handleEvent(players[i].id, "submitStatements", {
              statements: makeStatements(2),
            });
          }

          // Game is now in play phase. Find the shuffled lie position from the roundStarted event.
          const roundStartedCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[0] === "roundStarted"
          );
          expect(roundStartedCalls.length).toBe(1);

          const roundPayload = roundStartedCalls[0][1] as { statements: string[] };
          // The lie has the text associated with lieIndex
          const lieText = statementsP0[lieIndex].text;
          // Actually: we know statementsP0[lieIndex].isLie is true, so lieText is the lie's text
          const actualLieText = statementsP0.find((s) => s.isLie)!.text;
          const shuffledLieIndex = roundPayload.statements.indexOf(actualLieText);

          // Get initial scores
          const stateBefore = module.getState(players[1].id) as { scores: Record<string, number> };
          const scoreBefore1 = stateBefore.scores[players[1].id] ?? 0;
          const scoreBefore2 = stateBefore.scores[players[2].id] ?? 0;

          // Player 1 votes correctly
          module.handleEvent(players[1].id, "submitLieVote", {
            statementIndex: shuffledLieIndex,
          });

          // Player 2 votes incorrectly
          const wrongIndex = (shuffledLieIndex + 1) % 3;
          module.handleEvent(players[2].id, "submitLieVote", {
            statementIndex: wrongIndex,
          });

          // Player 3 votes incorrectly
          const wrongIndex2 = (shuffledLieIndex + 2) % 3;
          module.handleEvent(players[3].id, "submitLieVote", {
            statementIndex: wrongIndex2,
          });

          // All eligible voters have voted → reveal happens automatically
          // Advance timers in case of any async behavior
          vi.advanceTimersByTime(100);

          // Check scores after reveal
          const stateAfter = module.getState(players[1].id) as { scores: Record<string, number> };
          expect(stateAfter.scores[players[1].id]).toBe(scoreBefore1 + 1);
          expect(stateAfter.scores[players[2].id]).toBe(scoreBefore2);
          expect(stateAfter.scores[players[3].id]).toBe(scoreBefore2);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 20: Final scoreboard sorted descending
  // Validates: Requirements 9.8, 10.4
  it("Property 20: final scoreboard is sorted by score descending", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 5 }),
        (playerCount) => {
          const players = createPlayers(playerCount);
          const context = createMockContext(players);
          const module = new TwoTruthsOneLieModule();
          module.start(context);

          // Each player submits statements with lie at position 2
          for (const player of players) {
            module.handleEvent(player.id, "submitStatements", {
              statements: [
                { text: `${player.name} truth 1`, isLie: false },
                { text: `${player.name} truth 2`, isLie: false },
                { text: `${player.name} lie`, isLie: true },
              ],
            });
          }

          // Play through all rounds
          for (let round = 0; round < playerCount; round++) {
            // Find the lie text for current presenter in shuffled order
            const roundStartedCalls = (context.emitToRoom as ReturnType<typeof vi.fn>).mock.calls.filter(
              (call) => call[0] === "roundStarted"
            );
            const currentRoundPayload = roundStartedCalls[round][1] as {
              presenterId: string;
              statements: string[];
            };
            const presenterId = currentRoundPayload.presenterId;
            const presenter = players.find((p) => p.id === presenterId)!;

            // The lie text is "{name} lie"
            const lieText = `${presenter.name} lie`;
            const lieIdx = currentRoundPayload.statements.indexOf(lieText);

            // Each non-presenter votes. Some vote correctly, some don't for variety.
            const voters = players.filter((p) => p.id !== presenterId);
            for (let v = 0; v < voters.length; v++) {
              // First voter votes correctly, others vote wrong
              const voteIdx = v === 0 ? lieIdx : (lieIdx + 1) % 3;
              module.handleEvent(voters[v].id, "submitLieVote", {
                statementIndex: voteIdx,
              });
            }

            // Advance timers to process reveal
            vi.advanceTimersByTime(100);

            // If not the last round, host advances
            if (round < playerCount - 1) {
              module.handleEvent(players[0].id, "nextRound", {});
            }
          }

          // After the last round, host advances → triggers game over
          module.handleEvent(players[0].id, "nextRound", {});
          vi.advanceTimersByTime(100);

          // Check signalGameOver was called with sorted scoreboard
          expect(context.signalGameOver).toHaveBeenCalled();
          const gameOverPayload = (context.signalGameOver as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
            game: string;
            scoreboard: Array<{ playerId: string; playerName: string; score: number }>;
          };

          expect(gameOverPayload.game).toBe("two-truths-one-lie");
          const scoreboard = gameOverPayload.scoreboard;

          // Verify sorted descending
          for (let i = 1; i < scoreboard.length; i++) {
            expect(scoreboard[i - 1].score).toBeGreaterThanOrEqual(scoreboard[i].score);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
