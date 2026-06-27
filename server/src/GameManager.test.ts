import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { GameManager } from "./GameManager.js";
import { GamePhase, Role } from "./games/mafia/types.js";

describe("GameManager", () => {
  // Feature: mafia-game, Property 8: Start button availability depends on player count
  // **Validates: Requirements 3.4, 3.5**
  it("Property 8: startGame succeeds iff player count is between 4 and 10", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (playerCount) => {
          const gm = new GameManager();

          // Create a room — host counts as 1 player
          const { roomCode, hostId } = gm.createRoom("Host", "socket-host");

          // Add (playerCount - 1) additional players via joinRoom
          for (let i = 1; i < playerCount; i++) {
            gm.joinRoom(roomCode, `Player${i}`, `socket-${i}`);
          }

          // Attempt to start the game as the host
          if (playerCount >= 4 && playerCount <= 10) {
            // Should succeed — no throw
            const room = gm.startGame(roomCode, hostId);
            expect(room).toBeDefined();
            expect(room.phase).not.toBe("Lobby");
          } else {
            // Should throw for insufficient players (1-3)
            expect(() => gm.startGame(roomCode, hostId)).toThrow(
              "Need between 4 and 10 players to start."
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mafia-game, Property 7: Join/leave events trigger roomUpdated
  // Validates: Requirements 3.2
  it("Property 7: join/leave operations produce observable state changes (triggering roomUpdated)", () => {
    fc.assert(
      fc.property(
        // Generate 1-8 unique player names for joining (host takes 1 slot, max 10 total)
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 15 }), {
          minLength: 1,
          maxLength: 8,
        }),
        // Generate a subset size for disconnect operations (how many to disconnect)
        fc.integer({ min: 0, max: 8 }),
        (playerNames, disconnectCount) => {
          const gm = new GameManager();

          // Create a room with a host
          const { roomCode } = gm.createRoom("Host", "socket-host");

          // Perform a sequence of join operations and verify state change after each
          const joinedSocketIds: string[] = [];
          for (let i = 0; i < playerNames.length; i++) {
            const socketId = `socket-${i}`;
            const playersBefore = gm.getRoom(roomCode)!.players.size;

            const room = gm.joinRoom(roomCode, playerNames[i], socketId);
            joinedSocketIds.push(socketId);

            // After join: room state has changed — player count increased
            expect(room.players.size).toBe(playersBefore + 1);
            // The new player exists in the room
            expect(room.players.has(socketId)).toBe(true);
            expect(room.players.get(socketId)!.name).toBe(playerNames[i]);
            expect(room.players.get(socketId)!.isConnected).toBe(true);
          }

          // Perform a sequence of disconnect (leave) operations on a subset of joined players
          const numDisconnects = Math.min(
            disconnectCount,
            joinedSocketIds.length
          );
          for (let i = 0; i < numDisconnects; i++) {
            const socketId = joinedSocketIds[i];
            const playerBefore = gm.getRoom(roomCode)!.players.get(socketId);
            expect(playerBefore).toBeDefined();
            expect(playerBefore!.isConnected).toBe(true);

            // Disconnect the player
            gm.handleDisconnect(socketId);

            // After disconnect: room state has changed — player marked as disconnected
            const playerAfter = gm.getRoom(roomCode)!.players.get(socketId);
            expect(playerAfter).toBeDefined();
            expect(playerAfter!.isConnected).toBe(false);
            expect(playerAfter!.disconnectedAt).not.toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mafia-game, Property 11: Non-host startGame is rejected
  // **Validates: Requirements 4.3**
  it("Property 11: non-host startGame is rejected with permissions error", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        fc.integer({ min: 1, max: 9 }),
        (playerCount, nonHostIndex) => {
          const gm = new GameManager();

          // Create a room — host counts as 1 player
          const { roomCode, hostId } = gm.createRoom("Host", "socket-host");

          // Add (playerCount - 1) additional players via joinRoom
          const playerSocketIds: string[] = [];
          for (let i = 1; i < playerCount; i++) {
            const socketId = `socket-${i}`;
            gm.joinRoom(roomCode, `Player${i}`, socketId);
            playerSocketIds.push(socketId);
          }

          // Pick a random non-host player as the requester
          const pickedIndex = (nonHostIndex - 1) % playerSocketIds.length;
          const nonHostRequesterId = playerSocketIds[pickedIndex];

          // Attempting to start the game as a non-host should throw
          expect(() => gm.startGame(roomCode, nonHostRequesterId)).toThrow(
            "Only the host can start the game."
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mafia-game, Property 12: StartGame outside Lobby is rejected
  // **Validates: Requirements 4.4**
  it("Property 12: startGame outside Lobby is rejected with 'already in progress' error", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        (playerCount) => {
          const gm = new GameManager();

          // Create a room — host counts as 1 player
          const { roomCode, hostId } = gm.createRoom("Host", "socket-host");

          // Add (playerCount - 1) additional players via joinRoom
          for (let i = 1; i < playerCount; i++) {
            gm.joinRoom(roomCode, `Player${i}`, `socket-${i}`);
          }

          // Start the game to transition out of Lobby into RoleReveal
          gm.startGame(roomCode, hostId);

          // Verify we're no longer in Lobby
          const room = gm.getRoom(roomCode)!;
          expect(room.phase).not.toBe(GamePhase.Lobby);

          // Attempting to start the game again should throw "already in progress"
          expect(() => gm.startGame(roomCode, hostId)).toThrow(
            "Game is already in progress."
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mafia-game, Property 10: Valid startGame transitions to RoleReveal
  // **Validates: Requirements 4.1**
  it("Property 10: valid startGame by host with 4-10 players transitions to RoleReveal", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        (playerCount) => {
          const gm = new GameManager();

          // Create a room — host counts as 1 player
          const { roomCode, hostId } = gm.createRoom("Host", "socket-host");

          // Add (playerCount - 1) additional players via joinRoom
          for (let i = 1; i < playerCount; i++) {
            gm.joinRoom(roomCode, `Player${i}`, `socket-${i}`);
          }

          // Start the game as the host
          const room = gm.startGame(roomCode, hostId);

          // Assert phase transitioned to RoleReveal
          expect(room.phase).toBe(GamePhase.RoleReveal);

          // Assert gameState is initialized (not null)
          expect(room.gameState).not.toBeNull();

          // Assert roles are assigned: exactly 1 Killer, 1 Medic, N-2 Civilians
          const roles = Array.from(room.players.values()).map((p) => p.role);
          const killerCount = roles.filter((r) => r === Role.Killer).length;
          const medicCount = roles.filter((r) => r === Role.Medic).length;
          const civilianCount = roles.filter((r) => r === Role.Civilian).length;

          expect(killerCount).toBe(1);
          expect(medicCount).toBe(1);
          expect(civilianCount).toBe(playerCount - 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: mafia-game, Property 39: Reconnect within window restores state
  // **Validates: Requirements 16.4**
  it("Property 39: reconnect within window restores state", () => {
    vi.useFakeTimers();

    try {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          fc.integer({ min: 0, max: 9 }),
          fc.integer({ min: 0, max: 59_000 }),
          (playerCount, disconnectIndex, reconnectDelay) => {
            const gm = new GameManager();

            // Create a room — host counts as 1 player
            const { roomCode, hostId } = gm.createRoom("Host", "socket-host");

            // Add (playerCount - 1) additional players via joinRoom
            const allSocketIds: string[] = [hostId];
            const allNames: string[] = ["Host"];
            for (let i = 1; i < playerCount; i++) {
              const socketId = `socket-${i}`;
              const name = `Player${i}`;
              gm.joinRoom(roomCode, name, socketId);
              allSocketIds.push(socketId);
              allNames.push(name);
            }

            // Start the game to assign roles and set alive status
            gm.startGame(roomCode, hostId);

            // Pick a player to disconnect (using modulo to stay in bounds)
            const targetIndex = disconnectIndex % allSocketIds.length;
            const targetSocketId = allSocketIds[targetIndex];
            const targetName = allNames[targetIndex];
            const room = gm.getRoom(roomCode)!;
            const playerBefore = room.players.get(targetSocketId)!;

            // Capture role, isAlive, and phase before disconnect
            const roleBefore = playerBefore.role;
            const isAliveBefore = playerBefore.isAlive;
            const phaseBefore = room.phase;

            // Simulate disconnect
            gm.handleDisconnect(targetSocketId);

            // Advance time by some amount less than 60s
            vi.advanceTimersByTime(reconnectDelay);

            // Reconnect with a new socket ID
            const newSocketId = `reconnected-socket-${targetIndex}`;
            const reconnectedRoom = gm.handleReconnect(roomCode, targetName, newSocketId);

            // Assert the player's role is restored (same as before disconnect)
            const reconnectedPlayer = reconnectedRoom.players.get(newSocketId)!;
            expect(reconnectedPlayer).toBeDefined();
            expect(reconnectedPlayer.role).toBe(roleBefore);

            // Assert the player's isAlive is restored (same as before disconnect)
            expect(reconnectedPlayer.isAlive).toBe(isAliveBefore);

            // Assert the room phase is the same as before (phase preserved)
            expect(reconnectedRoom.phase).toBe(phaseBefore);

            // Assert the player is now connected
            expect(reconnectedPlayer.isConnected).toBe(true);

            // Assert disconnectedAt is null after reconnect
            expect(reconnectedPlayer.disconnectedAt).toBeNull();

            // Clear all pending timers to avoid interference between iterations
            vi.clearAllTimers();
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // Feature: mafia-game, Property 38: Player disconnect preserves state for 60 seconds
  // **Validates: Requirements 16.3**
  it("Property 38: player disconnect preserves state for 60 seconds", () => {
    vi.useFakeTimers();

    try {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }),
          fc.integer({ min: 0, max: 9 }),
          (playerCount, disconnectIndex) => {
            const gm = new GameManager();

            // Create a room — host counts as 1 player
            const { roomCode, hostId } = gm.createRoom("Host", "socket-host");

            // Add (playerCount - 1) additional players via joinRoom
            const allSocketIds: string[] = [hostId];
            for (let i = 1; i < playerCount; i++) {
              const socketId = `socket-${i}`;
              gm.joinRoom(roomCode, `Player${i}`, socketId);
              allSocketIds.push(socketId);
            }

            // Start the game to assign roles and set alive status
            gm.startGame(roomCode, hostId);

            // Pick a player to disconnect (using modulo to stay in bounds)
            const targetSocketId =
              allSocketIds[disconnectIndex % allSocketIds.length];
            const room = gm.getRoom(roomCode)!;
            const playerBefore = room.players.get(targetSocketId)!;

            // Capture role and isAlive before disconnect
            const roleBefore = playerBefore.role;
            const isAliveBefore = playerBefore.isAlive;

            // Simulate disconnect
            gm.handleDisconnect(targetSocketId);

            // Assert state is preserved immediately after disconnect
            const playerAfterDisconnect = room.players.get(targetSocketId)!;
            expect(playerAfterDisconnect).toBeDefined();
            expect(playerAfterDisconnect.role).toBe(roleBefore);
            expect(playerAfterDisconnect.isAlive).toBe(isAliveBefore);
            expect(playerAfterDisconnect.isConnected).toBe(false);

            // Advance time by 59 seconds — player should still be preserved
            vi.advanceTimersByTime(59_000);

            const playerAfter59s = room.players.get(targetSocketId)!;
            expect(playerAfter59s).toBeDefined();
            expect(playerAfter59s.role).toBe(roleBefore);
            expect(playerAfter59s.isAlive).toBe(isAliveBefore);

            // Clear all pending timers to avoid interference between iterations
            vi.clearAllTimers();
          }
        ),
        { numRuns: 100 }
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
