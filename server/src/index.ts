import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { GameManager } from "./GameManager.js";
import { VoteManager } from "./VoteManager.js";
import { PhaseController } from "./PhaseController.js";
import { GamePhase, Role, Room } from "./types.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const gameManager = new GameManager();
const voteManager = new VoteManager();
const phaseController = new PhaseController();

const PORT = process.env.PORT ?? 3000;

/** Local index: socketId -> roomCode, for disconnect lookups */
const socketRoomIndex = new Map<string, string>();

// --- Helper: serialize room state for clients ---
function serializeRoom(room: Room) {
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      isAlive: p.isAlive,
      isHost: p.isHost,
      isConnected: p.isConnected,
    })),
    phase: room.phase,
  };
}

// --- Helper: transfer host to a living player if current host is dead ---
function transferHostIfDead(room: Room, roomCode: string): void {
  const currentHost = room.players.get(room.hostId);
  // If host is still alive, nothing to do
  if (currentHost && currentHost.isAlive) return;

  // Find the first living, connected player to become host
  const newHost = Array.from(room.players.values()).find(
    (p) => p.isAlive && p.isConnected
  );

  if (!newHost) return; // No eligible host (shouldn't happen if game is still running)

  // Remove host flag from old host
  if (currentHost) {
    currentHost.isHost = false;
  }

  // Set new host
  newHost.isHost = true;
  room.hostId = newHost.id;

  // Emit roomUpdated so clients see the new host
  io.to(roomCode).emit("roomUpdated", serializeRoom(room));
}

// --- Helper: advance to Morning phase after night actions resolve ---
function advanceToMorning(room: Room, roomCode: string): void {
  const narrationResult = phaseController.resolveNightActions(room);

  // Transition to Morning
  phaseController.transitionTo(room, GamePhase.Morning);

  // Emit morningNarration to room
  io.to(roomCode).emit("morningNarration", {
    segments: narrationResult.segments,
    eliminatedPlayerId: narrationResult.eliminatedPlayerId,
    wasSaved: narrationResult.wasSaved,
  });

  // Emit phaseChanged
  io.to(roomCode).emit("phaseChanged", {
    phase: room.phase,
    roomCode: room.roomCode,
    players: Array.from(room.players.values()),
  });

  // Check win condition after night elimination
  if (narrationResult.eliminatedPlayerId) {
    transferHostIfDead(room, roomCode);
    const winCondition = phaseController.checkWinCondition(room);
    if (winCondition) {
      phaseController.transitionTo(room, GamePhase.GameOver);
      io.to(roomCode).emit("gameOver", {
        winner: winCondition.winner,
        reason: winCondition.reason,
        players: Array.from(room.players.values()).map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          isAlive: p.isAlive,
        })),
      });
      io.to(roomCode).emit("phaseChanged", {
        phase: room.phase,
        roomCode: room.roomCode,
        players: Array.from(room.players.values()),
      });
      return;
    }
  }

  // Start narration timer (30s) — auto-advance to Discussion on expiry
  if (room.gameState) {
    room.gameState.narrationCompletes = new Set();
  }
  phaseController.startPhaseTimer(room, GamePhase.Morning, 30_000, () => {
    advanceToDiscussion(room, roomCode);
  });
}

// --- Helper: advance to Discussion phase ---
function advanceToDiscussion(room: Room, roomCode: string): void {
  phaseController.transitionTo(room, GamePhase.Discussion);

  // Clear accusations for the new discussion round
  if (room.gameState) {
    room.gameState.accusations = new Map();
    room.gameState.accusationResults = null;
  }

  io.to(roomCode).emit("phaseChanged", {
    phase: room.phase,
    roomCode: room.roomCode,
    players: Array.from(room.players.values()),
    voteHistory: room.gameState?.voteHistory ?? [],
  });

  // Start Discussion timer (120s) — auto-advance to Voting on expiry
  phaseController.startPhaseTimer(room, GamePhase.Discussion, 120_000, () => {
    advanceToVoting(room, roomCode);
  });
}

// --- Helper: advance to Voting phase ---
function advanceToVoting(room: Room, roomCode: string): void {
  phaseController.transitionTo(room, GamePhase.Voting);

  // Clear votes for the new voting phase
  if (room.gameState) {
    voteManager.clearVotes(room);
  }

  io.to(roomCode).emit("votingOpened", { roomCode });
  io.to(roomCode).emit("phaseChanged", {
    phase: room.phase,
    roomCode: room.roomCode,
    players: Array.from(room.players.values()),
  });

  // Start Voting timer (60s) — auto-complete votes on expiry
  phaseController.startPhaseTimer(room, GamePhase.Voting, 60_000, () => {
    handleVoteComplete(room, roomCode);
  });
}

// --- Helper: handle vote completion (tally and resolve) ---
function handleVoteComplete(room: Room, roomCode: string): void {
  // Save vote history before tallying
  if (room.gameState) {
    const voteRecord: Record<string, string> = {};
    for (const [voterId, targetId] of room.gameState.votes.entries()) {
      const voterName = room.players.get(voterId)?.name ?? "Unknown";
      if (targetId === "__SKIP__") {
        voteRecord[voterName] = "Skip";
      } else {
        const targetName = room.players.get(targetId)?.name ?? "Unknown";
        voteRecord[voterName] = targetName;
      }
    }
    room.gameState.voteHistory.push({
      round: room.gameState.round,
      votes: voteRecord,
    });
    room.gameState.round++;
  }

  const voteResult = voteManager.tallyVotes(room);

  // Emit vote results
  io.to(roomCode).emit("voteResults", {
    eliminatedPlayerId: voteResult.eliminatedPlayerId,
    voteCounts: Object.fromEntries(voteResult.voteCounts),
    isTie: voteResult.isTie,
    tiedPlayers: voteResult.tiedPlayers,
  });

  if (voteResult.eliminatedPlayerId) {
    // Eliminate the player
    const eliminated = room.players.get(voteResult.eliminatedPlayerId);
    if (eliminated) {
      eliminated.isAlive = false;
      if (room.gameState) {
        room.gameState.eliminatedPlayers.push(voteResult.eliminatedPlayerId);
      }
    }

    io.to(roomCode).emit("playerEliminated", {
      playerId: voteResult.eliminatedPlayerId,
      playerName: eliminated?.name ?? "Unknown",
      role: eliminated?.role ?? null,
    });

    // Transfer host if the eliminated player was the host
    transferHostIfDead(room, roomCode);

    // Check win condition
    const winCondition = phaseController.checkWinCondition(room);
    if (winCondition) {
      phaseController.transitionTo(room, GamePhase.GameOver);
      io.to(roomCode).emit("gameOver", {
        winner: winCondition.winner,
        reason: winCondition.reason,
        players: Array.from(room.players.values()).map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          isAlive: p.isAlive,
        })),
      });
      io.to(roomCode).emit("phaseChanged", {
        phase: room.phase,
        roomCode: room.roomCode,
        players: Array.from(room.players.values()),
      });
      return;
    }
  }

  // No win — start a new Night cycle
  advanceToNight(room, roomCode);
}

// --- Helper: advance to Night phase ---
function advanceToNight(room: Room, roomCode: string): void {
  // Reset night actions for the new cycle
  if (room.gameState) {
    room.gameState.nightActions = { killTarget: null, saveTarget: null };
    room.gameState.votes = new Map();
  }

  phaseController.transitionTo(room, GamePhase.Night);

  io.to(roomCode).emit("phaseChanged", {
    phase: room.phase,
    roomCode: room.roomCode,
    players: Array.from(room.players.values()),
  });

  // Start Night timer (90s) — auto-submit null for missing actions
  phaseController.startPhaseTimer(room, GamePhase.Night, 90_000, () => {
    advanceToMorning(room, roomCode);
  });
}

// --- Socket.io connection handler ---
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // --- createRoom ---
  socket.on("createRoom", (payload, callback) => {
    try {
      const { playerName } = payload;
      const result = gameManager.createRoom(playerName, socket.id);
      const room = gameManager.getRoom(result.roomCode);
      socket.join(result.roomCode);
      socketRoomIndex.set(socket.id, result.roomCode);

      if (room) {
        io.to(result.roomCode).emit("roomUpdated", serializeRoom(room));
      }

      if (typeof callback === "function") {
        callback({ success: true, roomCode: result.roomCode });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to create room.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- joinRoom ---
  socket.on("joinRoom", (payload, callback) => {
    try {
      const { roomCode, playerName } = payload;

      // Check if this is a reconnection (player with same name exists and is disconnected)
      const existingRoom = gameManager.getRoom(roomCode);
      if (existingRoom) {
        let isReconnect = false;
        for (const player of existingRoom.players.values()) {
          if (player.name === playerName && !player.isConnected) {
            isReconnect = true;
            break;
          }
        }

        if (isReconnect) {
          const room = gameManager.handleReconnect(roomCode, playerName, socket.id);
          socket.join(roomCode);
          socketRoomIndex.set(socket.id, roomCode);
          io.to(roomCode).emit("roomUpdated", serializeRoom(room));
          io.to(roomCode).emit("phaseChanged", {
            phase: room.phase,
            roomCode: room.roomCode,
            players: Array.from(room.players.values()),
          });

          // Re-emit roleAssigned to the reconnecting player so they know their role
          const reconnectedPlayer = room.players.get(socket.id);
          if (reconnectedPlayer && reconnectedPlayer.role) {
            socket.emit("roleAssigned", {
              role: reconnectedPlayer.role,
              playerName: reconnectedPlayer.name,
            });
          }

          if (typeof callback === "function") {
            callback({ success: true, reconnected: true });
          }
          return;
        }
      }

      const room = gameManager.joinRoom(roomCode, playerName, socket.id);
      socket.join(roomCode);
      socketRoomIndex.set(socket.id, roomCode);
      io.to(roomCode).emit("roomUpdated", serializeRoom(room));

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to join room.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- startGame ---
  socket.on("startGame", (payload, callback) => {
    try {
      const { roomCode } = payload;
      const room = gameManager.startGame(roomCode, socket.id);

      // Emit gameStarted to room
      io.to(roomCode).emit("gameStarted", { roomCode });

      // Emit roleAssigned privately to each player
      for (const [playerId, player] of room.players.entries()) {
        io.to(playerId).emit("roleAssigned", {
          role: player.role,
          playerName: player.name,
        });
      }

      // Emit phaseChanged (RoleReveal)
      io.to(roomCode).emit("phaseChanged", {
        phase: room.phase,
        roomCode: room.roomCode,
        players: Array.from(room.players.values()),
      });

      // Start RoleReveal timer (60s) — transitions to Night on expiry
      phaseController.startPhaseTimer(room, GamePhase.RoleReveal, 60_000, () => {
        advanceToNight(room, roomCode);
      });

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to start game.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- roleAcknowledged ---
  socket.on("roleAcknowledged", (payload) => {
    try {
      const { roomCode } = payload;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return;
      if (room.phase !== GamePhase.RoleReveal) return;

      room.gameState.roleAcknowledgements.add(socket.id);

      // Check if all players have acknowledged
      if (room.gameState.roleAcknowledgements.size >= room.players.size) {
        phaseController.cancelPhaseTimer(room);
        advanceToNight(room, roomCode);
      }
    } catch {
      // Silent — non-critical event
    }
  });

  // --- submitKill ---
  socket.on("submitKill", (payload, callback) => {
    try {
      const { roomCode, targetId } = payload;
      const room = gameManager.getRoom(roomCode);

      if (!room) throw new Error("Room not found.");
      if (!room.gameState) throw new Error("Game has not started.");
      if (room.phase !== GamePhase.Night) throw new Error("Action only allowed during Night phase.");

      const player = room.players.get(socket.id);
      if (!player) throw new Error("Player not found in room.");
      if (!player.isAlive) throw new Error("Dead players cannot perform actions.");
      if (player.role !== Role.Killer) throw new Error("Only the Killer can submit a kill.");
      if (room.gameState.nightActions.killTarget !== null) throw new Error("Kill action already submitted.");

      // Record kill target
      room.gameState.nightActions.killTarget = targetId;

      // Check if both actions are in
      if (room.gameState.nightActions.saveTarget !== null) {
        phaseController.cancelPhaseTimer(room);
        advanceToMorning(room, roomCode);
      }

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to submit kill.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- submitSave ---
  socket.on("submitSave", (payload, callback) => {
    try {
      const { roomCode, targetId } = payload;
      const room = gameManager.getRoom(roomCode);

      if (!room) throw new Error("Room not found.");
      if (!room.gameState) throw new Error("Game has not started.");
      if (room.phase !== GamePhase.Night) throw new Error("Action only allowed during Night phase.");

      const player = room.players.get(socket.id);
      if (!player) throw new Error("Player not found in room.");
      if (!player.isAlive) throw new Error("Dead players cannot perform actions.");
      if (player.role !== Role.Medic) throw new Error("Only the Medic can submit a save.");
      if (room.gameState.nightActions.saveTarget !== null) throw new Error("Save action already submitted.");

      // Validate target is alive
      const target = room.players.get(targetId);
      if (!target) throw new Error("Target not found in room.");
      if (!target.isAlive) throw new Error("Cannot save a player who is not alive.");

      // Record save target
      room.gameState.nightActions.saveTarget = targetId;

      // Check if both actions are in
      if (room.gameState.nightActions.killTarget !== null) {
        phaseController.cancelPhaseTimer(room);
        advanceToMorning(room, roomCode);
      }

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to submit save.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- narrationComplete ---
  socket.on("narrationComplete", (payload) => {
    try {
      const { roomCode } = payload;
      const room = gameManager.getRoom(roomCode);
      if (!room || !room.gameState) return;
      if (room.phase !== GamePhase.Morning) return;

      room.gameState.narrationCompletes.add(socket.id);

      // Check if all connected alive players have completed
      const connectedAlivePlayers = Array.from(room.players.values()).filter(
        (p) => p.isAlive && p.isConnected
      );
      if (room.gameState.narrationCompletes.size >= connectedAlivePlayers.length) {
        phaseController.cancelPhaseTimer(room);
        advanceToDiscussion(room, roomCode);
      }
    } catch {
      // Silent — non-critical event
    }
  });

  // --- skipDiscussion ---
  socket.on("skipDiscussion", (payload, callback) => {
    try {
      const { roomCode } = payload;
      const room = gameManager.getRoom(roomCode);

      if (!room) throw new Error("Room not found.");
      if (room.phase !== GamePhase.Discussion) throw new Error("Can only skip during Discussion phase.");
      if (room.hostId !== socket.id) throw new Error("Only the host can skip discussion.");

      phaseController.cancelPhaseTimer(room);
      advanceToVoting(room, roomCode);

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to skip discussion.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- submitAccusation ---
  socket.on("submitAccusation", (payload, callback) => {
    try {
      const { roomCode, targetId } = payload;
      const room = gameManager.getRoom(roomCode);

      if (!room) throw new Error("Room not found.");
      if (!room.gameState) throw new Error("Game has not started.");
      if (room.phase !== GamePhase.Discussion) throw new Error("Accusations only during Discussion phase.");

      const player = room.players.get(socket.id);
      if (!player) throw new Error("Player not found in room.");
      if (!player.isAlive) throw new Error("Dead players cannot accuse.");

      if (room.gameState.accusations.has(socket.id)) {
        throw new Error("You have already submitted an accusation this round.");
      }

      // Validate target exists and is alive
      const target = room.players.get(targetId);
      if (!target) throw new Error("Target not found in room.");
      if (!target.isAlive) throw new Error("Cannot accuse a player who is not alive.");

      room.gameState.accusations.set(socket.id, targetId);

      // Check if all living players have accused
      const livingPlayers = Array.from(room.players.values()).filter((p) => p.isAlive);
      if (room.gameState.accusations.size >= livingPlayers.length) {
        // Tally accusation results (anonymous — only show counts)
        const results: Record<string, number> = {};
        for (const accusedId of room.gameState.accusations.values()) {
          const accusedName = room.players.get(accusedId)?.name ?? "Unknown";
          results[accusedName] = (results[accusedName] || 0) + 1;
        }
        room.gameState.accusationResults = results;
        io.to(roomCode).emit("accusationResults", { results });
      }

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to submit accusation.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- submitVote ---
  socket.on("submitVote", (payload, callback) => {
    try {
      const { roomCode, targetId } = payload;
      const room = gameManager.getRoom(roomCode);

      if (!room) throw new Error("Room not found.");
      if (!room.gameState) throw new Error("Game has not started.");
      if (room.phase !== GamePhase.Voting) throw new Error("Voting is not active.");

      // VoteManager handles alive/duplicate validation
      voteManager.recordVote(room, socket.id, targetId);

      // Check if all living players have voted
      const livingPlayers = Array.from(room.players.values()).filter((p) => p.isAlive);
      if (room.gameState.votes.size >= livingPlayers.length) {
        phaseController.cancelPhaseTimer(room);
        handleVoteComplete(room, roomCode);
      }

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to submit vote.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- submitSkipVote ---
  socket.on("submitSkipVote", (payload, callback) => {
    try {
      const { roomCode } = payload;
      const room = gameManager.getRoom(roomCode);

      if (!room) throw new Error("Room not found.");
      if (!room.gameState) throw new Error("Game has not started.");
      if (room.phase !== GamePhase.Voting) throw new Error("Voting is not active.");

      // VoteManager handles alive/duplicate validation
      voteManager.recordSkipVote(room, socket.id);

      // Check if all living players have voted
      const livingPlayers = Array.from(room.players.values()).filter((p) => p.isAlive);
      if (room.gameState.votes.size >= livingPlayers.length) {
        phaseController.cancelPhaseTimer(room);
        handleVoteComplete(room, roomCode);
      }

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to submit skip vote.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- replayGame ---
  socket.on("replayGame", (payload, callback) => {
    try {
      const { roomCode } = payload;
      const room = gameManager.getRoom(roomCode);

      if (!room) throw new Error("Room not found.");
      if (room.phase !== GamePhase.GameOver) throw new Error("Can only replay after game is over.");
      if (room.hostId !== socket.id) throw new Error("Only the host can replay the game.");

      // Cancel any lingering timers
      phaseController.cancelPhaseTimer(room);

      // Reset all game state
      room.gameState = null;
      room.phase = GamePhase.Lobby;

      // Reset all players
      for (const player of room.players.values()) {
        player.role = null;
        player.isAlive = true;
      }

      io.to(roomCode).emit("roomUpdated", serializeRoom(room));
      io.to(roomCode).emit("phaseChanged", {
        phase: room.phase,
        roomCode: room.roomCode,
        players: Array.from(room.players.values()),
      });

      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to replay game.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- disconnect ---
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);

    const roomCode = socketRoomIndex.get(socket.id);
    if (roomCode) {
      const room = gameManager.getRoom(roomCode);
      gameManager.handleDisconnect(socket.id);
      socketRoomIndex.delete(socket.id);

      if (room) {
        io.to(roomCode).emit("roomUpdated", serializeRoom(room));
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Mafia game server listening on port ${PORT}`);
});

export { app, httpServer, io, gameManager };
