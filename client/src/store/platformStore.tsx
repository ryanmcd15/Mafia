import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import socket from "../socket";
import {
  GameModuleConfig,
  PlatformPhase,
  PlatformPlayer,
  PlatformStore,
} from "./types";

// --- Actions ---

type PlatformAction =
  | { type: "ROOM_UPDATED"; roomCode: string; players: PlatformPlayer[]; platformPhase: PlatformPhase }
  | { type: "GAME_SELECTED"; gameId: string }
  | { type: "GAME_PHASE_CHANGED"; phase: PlatformPhase; payload?: unknown }
  | { type: "GAME_OVER"; results: unknown }
  | { type: "AVAILABLE_GAMES"; games: GameModuleConfig[] }
  | { type: "ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "SESSION_EXPIRED" };

// --- Initial State ---

const initialState: PlatformStore = {
  isConnected: true,
  disconnectedAt: null,
  roomCode: null,
  platformPhase: null,
  players: [],
  myPlayer: null,
  availableGames: [],
  activeGameId: null,
  gameResults: null,
  error: null,
};

// --- Reducer ---

function platformReducer(state: PlatformStore, action: PlatformAction): PlatformStore {
  switch (action.type) {
    case "ROOM_UPDATED":
      return {
        ...state,
        roomCode: action.roomCode,
        players: action.players,
        platformPhase: action.platformPhase,
        myPlayer:
          action.players.find((p) => p.id === socket.id) ?? state.myPlayer,
      };
    case "GAME_SELECTED":
      return {
        ...state,
        activeGameId: action.gameId,
        platformPhase: PlatformPhase.ActiveGame,
        gameResults: null,
      };
    case "GAME_PHASE_CHANGED":
      return {
        ...state,
        platformPhase: action.phase,
      };
    case "GAME_OVER":
      return {
        ...state,
        platformPhase: PlatformPhase.GameResults,
        gameResults: action.results,
        activeGameId: null,
      };
    case "AVAILABLE_GAMES":
      return {
        ...state,
        availableGames: action.games,
      };
    case "ERROR":
      return { ...state, error: action.error };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "CONNECTED":
      return { ...state, isConnected: true, disconnectedAt: null };
    case "DISCONNECTED":
      return { ...state, isConnected: false, disconnectedAt: Date.now() };
    case "SESSION_EXPIRED":
      return { ...initialState, isConnected: false };
    default:
      return state;
  }
}

// --- Context ---

const PlatformContext = createContext<PlatformStore>(initialState);

export function usePlatformStore(): PlatformStore {
  return useContext(PlatformContext);
}

// --- Actions (socket emitters) ---

export function createRoom(playerName: string): Promise<{ success: boolean; roomCode?: string; error?: string }> {
  return new Promise((resolve) => {
    socket.emit("createRoom", { playerName }, (response: { success: boolean; roomCode?: string; error?: string }) => {
      resolve(response);
    });
  });
}

export function joinRoom(roomCode: string, playerName: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit("joinRoom", { roomCode, playerName }, (response: { success: boolean; error?: string }) => {
      resolve(response);
    });
  });
}

export function selectGame(gameId: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit("selectGame", { gameId }, (response: { success: boolean; error?: string }) => {
      resolve(response);
    });
  });
}

export function returnToGameSelection(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit("returnToGameSelection", {}, (response: { success: boolean; error?: string }) => {
      resolve(response);
    });
  });
}

export function endSession(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit("endSession", {}, (response: { success: boolean; error?: string }) => {
      resolve(response);
    });
  });
}

// --- Provider ---

export function PlatformProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [state, dispatch] = useReducer(platformReducer, initialState);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    function onRoomUpdated(data: {
      roomCode: string;
      players: PlatformPlayer[];
      platformPhase: PlatformPhase;
      availableGames?: GameModuleConfig[];
    }) {
      dispatch({
        type: "ROOM_UPDATED",
        roomCode: data.roomCode,
        players: data.players,
        platformPhase: data.platformPhase,
      });
      if (data.availableGames) {
        dispatch({ type: "AVAILABLE_GAMES", games: data.availableGames });
      }
    }

    function onGameSelected(data: { gameId: string }) {
      dispatch({ type: "GAME_SELECTED", gameId: data.gameId });
    }

    function onGamePhaseChanged(data: { phase: PlatformPhase; payload?: unknown }) {
      dispatch({ type: "GAME_PHASE_CHANGED", phase: data.phase, payload: data.payload });
    }

    function onGameOver(data: { results: unknown }) {
      dispatch({ type: "GAME_OVER", results: data.results });
    }

    function onError(data: { error?: string; message?: string }) {
      const msg = data.error ?? data.message ?? "An error occurred";
      dispatch({ type: "ERROR", error: msg });
      setTimeout(() => dispatch({ type: "CLEAR_ERROR" }), 3000);
    }

    function onSessionEnded() {
      dispatch({ type: "SESSION_EXPIRED" });
    }

    function onConnect() {
      dispatch({ type: "CONNECTED" });
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }

      // Auto-rejoin room on reconnect if we were previously in one
      const { roomCode, myPlayer } = stateRef.current;
      if (roomCode && myPlayer?.name) {
        socket.emit("joinRoom", { roomCode, playerName: myPlayer.name });
      }
    }

    function onDisconnect() {
      dispatch({ type: "DISCONNECTED" });
      disconnectTimerRef.current = setTimeout(() => {
        dispatch({ type: "SESSION_EXPIRED" });
      }, 60_000);
    }

    socket.on("roomUpdated", onRoomUpdated);
    socket.on("gameSelected", onGameSelected);
    socket.on("gamePhaseChanged", onGamePhaseChanged);
    socket.on("gameOver", onGameOver);
    socket.on("error", onError);
    socket.on("sessionEnded", onSessionEnded);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("roomUpdated", onRoomUpdated);
      socket.off("gameSelected", onGameSelected);
      socket.off("gamePhaseChanged", onGamePhaseChanged);
      socket.off("gameOver", onGameOver);
      socket.off("error", onError);
      socket.off("sessionEnded", onSessionEnded);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);

      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
      }
    };
  }, []);

  return (
    <PlatformContext.Provider value={state}>{children}</PlatformContext.Provider>
  );
}

// --- Connection Lost Modal ---

export function PlatformConnectionLostModal(): React.JSX.Element | null {
  const { isConnected, disconnectedAt } = usePlatformStore();
  const [isExpired, setIsExpired] = React.useState(false);

  useEffect(() => {
    if (isConnected || !disconnectedAt) {
      setIsExpired(false);
      return;
    }

    const elapsed = Date.now() - disconnectedAt;
    const remaining = 60_000 - elapsed;

    if (remaining <= 0) {
      setIsExpired(true);
      return;
    }

    const timer = setTimeout(() => setIsExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [isConnected, disconnectedAt]);

  if (isConnected) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connection lost"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "var(--bg-secondary, #2d2d2d)",
          borderRadius: "12px",
          padding: "32px",
          textAlign: "center",
          maxWidth: "320px",
          width: "90%",
        }}
      >
        {isExpired ? (
          <>
            <h2 style={{ marginBottom: "12px", color: "var(--danger, #ff4757)" }}>
              Session Expired
            </h2>
            <p style={{ color: "var(--text-secondary, #b0b0b0)" }}>
              You have been disconnected for too long. Redirecting to home…
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                width: "32px",
                height: "32px",
                border: "3px solid var(--text-secondary, #b0b0b0)",
                borderTopColor: "var(--accent, #6c63ff)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <h2 style={{ marginBottom: "12px" }}>Connection Lost</h2>
            <p style={{ color: "var(--text-secondary, #b0b0b0)" }}>
              Attempting to reconnect…
            </p>
            <button
              onClick={() => socket.connect()}
              style={{
                marginTop: "16px",
                minWidth: "44px",
                minHeight: "44px",
                padding: "12px 24px",
                fontSize: "1rem",
                fontWeight: 600,
                borderRadius: "8px",
                border: "none",
                backgroundColor: "var(--accent, #6c63ff)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
