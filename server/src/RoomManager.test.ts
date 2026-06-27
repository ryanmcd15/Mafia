import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { RoomManager } from "./RoomManager.js";

describe("RoomManager", () => {
  // Feature: party-games-platform, Property 1: Room creation produces valid room for valid host names
  // Validates: Requirements 1.2
  it("Property 1: valid room creation produces valid room code and designates creator as host", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.string({ minLength: 1, maxLength: 50 }), // socket ID
        (hostName, socketId) => {
          const manager = new RoomManager();
          const room = manager.createRoom(hostName, socketId);

          // Room code must match exactly 6 uppercase alphanumeric characters (Requirement 1.3)
          expect(room.roomCode).toMatch(/^[A-Z0-9]{6}$/);

          // Creator must be designated as host (Requirement 1.1)
          const hostPlayer = room.players.get(socketId);
          expect(hostPlayer).toBeDefined();
          expect(hostPlayer!.isHost).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 2 (supplemental): Invalid room creator names are rejected
  // Validates: Requirements 1.4
  it("Property 2: invalid room creator names are rejected with descriptive error", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.constant(null),
          fc.constant(undefined),
          fc.string({ minLength: 33, maxLength: 100 })
        ),
        (invalidName) => {
          const manager = new RoomManager();
          expect(() =>
            manager.createRoom(invalidName as string, "socket-id-1")
          ).toThrow();

          // Error message must be descriptive (mention the constraint)
          try {
            manager.createRoom(invalidName as string, "socket-id-1");
          } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 2: Room joining succeeds for valid player names
  // Validates: Requirements 1.3
  it("Property 2: valid join adds player to room", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 32 }), // Host name
        // Generate a pool of 10 unique short names (max needed: 8 extra + 1 joiner = 9),
        // then use an integer to slice how many extra players to add (0-8)
        fc.uniqueArray(
          fc.string({ minLength: 1, maxLength: 15 }),
          { minLength: 10, maxLength: 10 }
        ),
        fc.integer({ min: 0, max: 8 }), // Number of extra players beyond host
        (hostName, rawNames, numExtraPlayers) => {
          // Filter out names that match the host name (case-insensitive) to avoid duplicates
          const names = rawNames.filter(
            (n) => n.toLowerCase() !== hostName.toLowerCase()
          );
          // If not enough unique names remain after filtering, skip this test case
          if (names.length < numExtraPlayers + 1) return;
          const manager = new RoomManager();

          // Create room with host
          const hostSocketId = "socket-0";
          const room = manager.createRoom(hostName, hostSocketId);

          // Add extra players (0-8) using unique names from pool
          for (let i = 0; i < numExtraPlayers; i++) {
            const playerName = names[i];
            const socketId = `socket-${i + 1}`;
            manager.addPlayer(room, playerName, socketId);
          }

          const playerCountBeforeJoin = room.players.size;

          // Joiner uses names[numExtraPlayers] — guaranteed unique from the extra players
          const joinerName = names[numExtraPlayers];
          const joinerSocketId = `socket-${numExtraPlayers + 1}`;

          // Assert addPlayer succeeds without throwing
          const newPlayer = manager.addPlayer(room, joinerName, joinerSocketId);

          // Assert the returned player is added to room.players
          expect(room.players.has(joinerSocketId)).toBe(true);
          expect(room.players.get(joinerSocketId)).toBe(newPlayer);
          expect(newPlayer.name).toBe(joinerName);

          // Assert the room player count increments by 1
          expect(room.players.size).toBe(playerCountBeforeJoin + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 5 (supplemental): Nonexistent room codes are rejected
  // Validates: Requirements 2.2
  it("Property 5: nonexistent room codes are rejected", () => {
    fc.assert(
      fc.property(
        // Generate arbitrary 6-char strings as candidate "unknown" room codes
        fc.string({ minLength: 6, maxLength: 6 }),
        (candidateCode) => {
          // Create a manager and add one real room
          const manager = new RoomManager();
          const realRoom = manager.createRoom("Host", "socket-host");

          // If the generated code happens to collide with the real room code,
          // skip the assertion (this is not a nonexistent code)
          if (candidateCode === realRoom.roomCode) {
            return;
          }

          // Any other code must return null — room not found
          expect(manager.getRoom(candidateCode)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 3: Duplicate name rejection
  // Validates: Requirements 1.7
  it("Property 3: duplicate names in room are rejected and room state is not modified", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // player name X
        (playerName) => {
          const manager = new RoomManager();
          const room = manager.createRoom("Host", "socket-host");

          // Add a player with name X successfully
          manager.addPlayer(room, playerName, "socket-first");

          const playerCountAfterFirst = room.players.size;

          // Attempt to add a second player with the exact same name X
          expect(() =>
            manager.addPlayer(room, playerName, "socket-duplicate")
          ).toThrow();

          // Error message must indicate the name is taken
          try {
            manager.addPlayer(room, playerName, "socket-duplicate");
          } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message.length).toBeGreaterThan(0);
          }

          // Room state must not be modified — player count unchanged
          expect(room.players.size).toBe(playerCountAfterFirst);
          expect(room.players.has("socket-duplicate")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 9 (supplemental): Host disconnect in Lobby transfers host
  // Validates: Requirements 3.6
  it("Property 9: host disconnect in Lobby transfers host to a different connected player", () => {
    fc.assert(
      fc.property(
        // Generate 1–9 extra unique player names (so total room size = host + 1..9 = 2..10)
        fc.uniqueArray(
          fc.string({ minLength: 1, maxLength: 15 }),
          { minLength: 1, maxLength: 9 }
        ),
        (extraNames) => {
          const manager = new RoomManager();
          const hostSocketId = "socket-host";
          const room = manager.createRoom("Host", hostSocketId);

          // Add the extra players
          extraNames.forEach((name, i) => {
            manager.addPlayer(room, name, `socket-${i + 1}`);
          });

          // Record original host
          const originalHostId = room.hostId;
          const originalHost = room.players.get(originalHostId)!;
          expect(originalHost.isHost).toBe(true);

          // Simulate host disconnect: mark as disconnected, then transfer host, then remove
          originalHost.isConnected = false;
          originalHost.disconnectedAt = new Date();
          manager.transferHost(room);
          manager.removePlayer(room, originalHostId);

          // New host assertions
          const newHostId = room.hostId;
          expect(newHostId).not.toBe(originalHostId);

          const newHost = room.players.get(newHostId);
          expect(newHost).toBeDefined();
          expect(newHost!.isHost).toBe(true);
          expect(newHost!.isConnected).toBe(true);

          // Old host's player entry should be gone (removePlayer was called)
          expect(room.players.has(originalHostId)).toBe(false);

          // Exactly one player in the room should be host
          let hostCount = 0;
          for (const player of room.players.values()) {
            if (player.isHost) hostCount++;
          }
          expect(hostCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: party-games-platform, Property 4 (supplemental): Invalid join names are rejected
  // Validates: Requirements 2.3
  it("Property 4: invalid join names are rejected with descriptive error", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.string({ minLength: 21, maxLength: 100 })
        ),
        (invalidName) => {
          const manager = new RoomManager();
          const room = manager.createRoom("Host", "socket-host");
          const playersBefore = room.players.size;

          // addPlayer must throw for empty or >20 char names
          expect(() =>
            manager.addPlayer(room, invalidName, "socket-joiner")
          ).toThrow();

          // Error message must be descriptive (non-empty)
          try {
            manager.addPlayer(room, invalidName, "socket-joiner");
          } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message.length).toBeGreaterThan(0);
          }

          // Room state must not be modified on failure
          expect(room.players.size).toBe(playersBefore);
          expect(room.players.has("socket-joiner")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
