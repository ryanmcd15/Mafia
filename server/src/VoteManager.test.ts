import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { VoteManager } from "./VoteManager.js";
import { Room, GamePhase, Role, GameState, Player } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal Player object for testing */
function makePlayer(id: string, isAlive = true, isHost = false): Player {
  return {
    id,
    name: `Player_${id}`,
    role: Role.Civilian,
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

/** Creates a Room with the given players and a fresh game state */
function makeRoom(players: Player[]): Room {
  const room: Room = {
    roomCode: "ABCD12",
    hostId: players[0].id,
    players: new Map(players.map((p) => [p.id, p])),
    phase: GamePhase.Voting,
    gameState: makeGameState(),
    createdAt: new Date(),
  };
  return room;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VoteManager", () => {
  let manager: VoteManager;

  beforeEach(() => {
    manager = new VoteManager();
  });

  // -------------------------------------------------------------------------
  // hasVoted
  // -------------------------------------------------------------------------

  describe("hasVoted", () => {
    it("returns false before a vote is cast", () => {
      const p1 = makePlayer("p1");
      const p2 = makePlayer("p2");
      const room = makeRoom([p1, p2]);

      expect(manager.hasVoted(room, "p1")).toBe(false);
    });

    it("returns true after a vote is recorded", () => {
      const p1 = makePlayer("p1");
      const p2 = makePlayer("p2");
      const room = makeRoom([p1, p2]);

      manager.recordVote(room, "p1", "p2");
      expect(manager.hasVoted(room, "p1")).toBe(true);
    });

    it("returns false when gameState is null", () => {
      const p1 = makePlayer("p1");
      const room = makeRoom([p1]);
      room.gameState = null;

      expect(manager.hasVoted(room, "p1")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // recordVote – success path
  // -------------------------------------------------------------------------

  describe("recordVote – success", () => {
    it("records a vote from a living player targeting a living player", () => {
      const p1 = makePlayer("p1");
      const p2 = makePlayer("p2");
      const room = makeRoom([p1, p2]);

      manager.recordVote(room, "p1", "p2");

      expect(room.gameState!.votes.get("p1")).toBe("p2");
    });

    it("stores the correct voterId -> targetId mapping", () => {
      const players = ["p1", "p2", "p3"].map((id) => makePlayer(id));
      const room = makeRoom(players);

      manager.recordVote(room, "p1", "p3");
      manager.recordVote(room, "p2", "p3");

      expect(room.gameState!.votes.get("p1")).toBe("p3");
      expect(room.gameState!.votes.get("p2")).toBe("p3");
    });
  });

  // -------------------------------------------------------------------------
  // recordVote – validation: dead voter (Req 11.4 / Property 30)
  // -------------------------------------------------------------------------

  // Feature: mafia-game, Property 30: Dead players cannot vote
  // Validates: Requirements 11.4
  it("Property 30: dead voters are rejected", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }).chain((numPlayers) => {
          const ids = Array.from({ length: numPlayers }, (_, i) => `player${i}`);
          // voterIndex: always dead; targetIndex: alive, different from voter
          return fc.record({
            numPlayers: fc.constant(numPlayers),
            voterIndex: fc.integer({ min: 0, max: numPlayers - 1 }),
            targetIndex: fc.integer({ min: 0, max: numPlayers - 1 }),
          });
        }),
        ({ numPlayers, voterIndex, targetIndex }) => {
          // Build players – all alive initially
          const players = Array.from({ length: numPlayers }, (_, i) =>
            makePlayer(`player${i}`)
          );
          // Kill the voter
          players[voterIndex].isAlive = false;

          const room = makeRoom(players);
          const voterId = `player${voterIndex}`;
          const targetId = `player${targetIndex}`;

          // Dead player cannot vote — even targeting themselves or another dead player
          expect(() => manager.recordVote(room, voterId, targetId)).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // recordVote – validation: dead target (Req 11.3 / Property 29)
  // -------------------------------------------------------------------------

  // Feature: mafia-game, Property 29: Vote submission validates target is alive
  // Validates: Requirements 11.3
  it("Property 29: votes targeting dead players are rejected", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }).chain((numPlayers) => {
          const ids = Array.from({ length: numPlayers }, (_, i) => `player${i}`);
          return fc.record({
            numPlayers: fc.constant(numPlayers),
            voterIndex: fc.integer({ min: 0, max: numPlayers - 1 }),
            targetIndex: fc.integer({ min: 0, max: numPlayers - 1 }),
          });
        }),
        ({ numPlayers, voterIndex, targetIndex }) => {
          const players = Array.from({ length: numPlayers }, (_, i) =>
            makePlayer(`player${i}`)
          );

          // Voter is alive, target is dead
          const actualTargetIndex =
            voterIndex === targetIndex
              ? (targetIndex + 1) % numPlayers
              : targetIndex;

          players[actualTargetIndex].isAlive = false;

          const room = makeRoom(players);
          const voterId = `player${voterIndex}`;
          const targetId = `player${actualTargetIndex}`;

          expect(() => manager.recordVote(room, voterId, targetId)).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // recordVote – validation: duplicate votes (Req 11.5 / Property 31)
  // -------------------------------------------------------------------------

  // Feature: mafia-game, Property 31: Duplicate votes are rejected
  // Validates: Requirements 11.5
  it("Property 31: duplicate votes from the same player are rejected", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        (numPlayers) => {
          const players = Array.from({ length: numPlayers }, (_, i) =>
            makePlayer(`player${i}`)
          );
          const room = makeRoom(players);

          // First vote from player0 targeting player1 should succeed
          manager.recordVote(room, "player0", "player1");

          // Second vote from same player must be rejected
          expect(() =>
            manager.recordVote(room, "player0", `player${numPlayers - 1}`)
          ).toThrow();

          // Original vote must remain unchanged
          expect(room.gameState!.votes.get("player0")).toBe("player1");
          expect(room.gameState!.votes.size).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // tallyVotes – clear winner (Req 12.1 / Property 32)
  // -------------------------------------------------------------------------

  // Feature: mafia-game, Property 32: Vote tallying produces correct winner
  // Validates: Requirements 12.1
  it("Property 32: player with strictly most votes is eliminated", () => {
    fc.assert(
      fc.property(
        // Generate player count 4-8
        fc.integer({ min: 4, max: 8 }),
        (numPlayers) => {
          const players = Array.from({ length: numPlayers }, (_, i) =>
            makePlayer(`player${i}`)
          );
          const room = makeRoom(players);

          // Give player0 the majority of votes (ceil(n/2) + 0 more ensures majority)
          const majorityCount = Math.ceil(numPlayers / 2) + 1;
          // Use the remaining players to vote for player0
          let voterIdx = 1;
          for (let i = 0; i < majorityCount && voterIdx < numPlayers; i++, voterIdx++) {
            manager.recordVote(room, `player${voterIdx}`, "player0");
          }

          const result = manager.tallyVotes(room);

          expect(result.eliminatedPlayerId).toBe("player0");
          expect(result.isTie).toBe(false);
          expect(result.tiedPlayers).toHaveLength(0);
          expect(result.voteCounts.get("player0")).toBe(majorityCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // tallyVotes – tie (Req 12.2 / Property 33)
  // -------------------------------------------------------------------------

  // Feature: mafia-game, Property 33: Vote tie produces no elimination
  // Validates: Requirements 12.2
  it("Property 33: tied vote produces no elimination and reports tied players", () => {
    fc.assert(
      fc.property(
        // numCandidates: 2-4 players tied
        fc.integer({ min: 2, max: 4 }),
        // votesEach: 1-3 votes each
        fc.integer({ min: 1, max: 3 }),
        (numCandidates, votesEach) => {
          const totalPlayers = numCandidates + numCandidates * votesEach;
          const players = Array.from({ length: totalPlayers }, (_, i) =>
            makePlayer(`player${i}`)
          );
          const room = makeRoom(players);

          // Assign exactly votesEach votes to each of the first numCandidates players
          let voterIdx = numCandidates; // voters start after candidates
          for (let candidate = 0; candidate < numCandidates; candidate++) {
            for (let v = 0; v < votesEach; v++) {
              manager.recordVote(
                room,
                `player${voterIdx}`,
                `player${candidate}`
              );
              voterIdx++;
            }
          }

          const result = manager.tallyVotes(room);

          expect(result.eliminatedPlayerId).toBeNull();
          expect(result.isTie).toBe(true);
          expect(result.tiedPlayers).toHaveLength(numCandidates);

          // All tied candidates must appear in tiedPlayers
          for (let c = 0; c < numCandidates; c++) {
            expect(result.tiedPlayers).toContain(`player${c}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // tallyVotes – no votes cast
  // -------------------------------------------------------------------------

  it("tallyVotes with no votes returns null eliminatedPlayerId", () => {
    const players = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3")];
    const room = makeRoom(players);

    const result = manager.tallyVotes(room);

    expect(result.eliminatedPlayerId).toBeNull();
    expect(result.isTie).toBe(false);
    expect(result.tiedPlayers).toHaveLength(0);
    expect(result.voteCounts.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // clearVotes
  // -------------------------------------------------------------------------

  describe("clearVotes", () => {
    it("clears all recorded votes", () => {
      const p1 = makePlayer("p1");
      const p2 = makePlayer("p2");
      const p3 = makePlayer("p3");
      const room = makeRoom([p1, p2, p3]);

      manager.recordVote(room, "p1", "p3");
      manager.recordVote(room, "p2", "p3");
      expect(room.gameState!.votes.size).toBe(2);

      manager.clearVotes(room);

      expect(room.gameState!.votes.size).toBe(0);
    });

    it("allows votes to be recorded again after clearing", () => {
      const p1 = makePlayer("p1");
      const p2 = makePlayer("p2");
      const room = makeRoom([p1, p2]);

      manager.recordVote(room, "p1", "p2");
      manager.clearVotes(room);

      // After clearing, p1 should be able to vote again
      expect(() => manager.recordVote(room, "p1", "p2")).not.toThrow();
      expect(room.gameState!.votes.get("p1")).toBe("p2");
    });
  });
});
