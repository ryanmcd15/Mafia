import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Platform } from "./Platform.js";
import { MafiaModule } from "./games/mafia/MafiaModule.js";
import { TruthOrDareModule } from "./games/truth-or-dare/TruthOrDareModule.js";
import { TwoTruthsOneLieModule } from "./games/two-truths-one-lie/TwoTruthsOneLieModule.js";
import { SpyfallModule } from "./games/spyfall/SpyfallModule.js";
import { BattleShitsModule } from "./games/battle-shits/BattleShitsModule.js";
import { GuessWhoModule } from "./games/guess-who/GuessWhoModule.js";
import { FakeArtistModule } from "./games/fake-artist/FakeArtistModule.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

// Serve the built client (after running `npm run build` in client/)
const clientDistPath = join(__dirname, "../../client/dist");
app.use(express.static(clientDistPath));
app.get("*", (_req, res) => {
  res.sendFile(join(clientDistPath, "index.html"));
});

const platform = new Platform(io);

// Register game modules
platform.registerGame("mafia", () => new MafiaModule(), new MafiaModule().config);
platform.registerGame("truth-or-dare", () => new TruthOrDareModule(), new TruthOrDareModule().config);
platform.registerGame("two-truths-one-lie", () => new TwoTruthsOneLieModule(), new TwoTruthsOneLieModule().config);
platform.registerGame("spyfall", () => new SpyfallModule(), new SpyfallModule().config);
platform.registerGame("battle-shits", () => new BattleShitsModule(), new BattleShitsModule().config);
platform.registerGame("guess-who", () => new GuessWhoModule(), new GuessWhoModule().config);
platform.registerGame("fake-artist", () => new FakeArtistModule(), new FakeArtistModule().config);

const PORT = process.env.PORT ?? 3000;

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // --- createRoom ---
  socket.on("createRoom", (payload, callback) => {
    try {
      const { playerName } = payload;
      const result = platform.createRoom(playerName, socket.id);
      socket.join(result.roomCode);
      // Emit room state now that the socket has joined the room
      platform.emitRoomUpdatedForRoom(result.roomCode);
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

      // Check for reconnection (player with same name that's disconnected)
      // Platform.handleReconnect throws if no matching disconnected player exists
      try {
        platform.handleReconnect(roomCode, playerName, socket.id);
        socket.join(roomCode);
        if (typeof callback === "function") {
          callback({ success: true, reconnected: true });
        }
        return;
      } catch {
        // Not a reconnect — proceed with normal join
      }

      platform.joinRoom(roomCode, playerName, socket.id);
      socket.join(roomCode);
      platform.emitRoomUpdatedForRoom(roomCode);
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

  // --- selectGame ---
  socket.on("selectGame", (payload, callback) => {
    try {
      const { gameId } = payload;
      const roomCode = platform.getRoomCodeForSocket(socket.id);
      if (!roomCode) throw new Error("Room not found");
      platform.selectGame(roomCode, gameId, socket.id);
      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to select game.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- gameEvent (routes to active game module) ---
  socket.on("gameEvent", (payload, callback) => {
    try {
      const { type, data, payload: eventPayload } = payload;
      const eventData = data ?? eventPayload;
      const roomCode = platform.getRoomCodeForSocket(socket.id);
      if (!roomCode) throw new Error("Room not found");

      // Special case: getState returns current game state to the requesting client
      if (type === "getState") {
        const state = platform.getGameState(roomCode, socket.id);
        if (typeof callback === "function") {
          callback({ success: true, state });
        }
        return;
      }

      platform.handleGameEvent(roomCode, socket.id, type, eventData);
      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to process game event.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- returnToGameSelection ---
  socket.on("returnToGameSelection", (payload, callback) => {
    try {
      const roomCode = platform.getRoomCodeForSocket(socket.id);
      if (!roomCode) throw new Error("Room not found");
      platform.returnToGameSelection(roomCode, socket.id);
      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to return to game selection.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- endSession ---
  socket.on("endSession", (payload, callback) => {
    try {
      const roomCode = platform.getRoomCodeForSocket(socket.id);
      if (!roomCode) throw new Error("Room not found");
      platform.endSession(roomCode, socket.id);
      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to end session.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- getAvailableGames ---
  socket.on("getAvailableGames", (payload, callback) => {
    try {
      const games = platform.getAvailableGames();
      if (typeof callback === "function") {
        callback({ success: true, games });
      }
    } catch (err: any) {
      const message = err?.message ?? "Failed to get available games.";
      socket.emit("error", { success: false, error: message });
      if (typeof callback === "function") {
        callback({ success: false, error: message });
      }
    }
  });

  // --- disconnect ---
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    platform.handleDisconnect(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Party Games Platform server listening on port ${PORT}`);
});

export { app, httpServer, io, platform };
