import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import socket from "./socket";
import {
  GamePhase,
  GameStore,
  NarrationResult,
  Player,
  Role,
  VoteResult,
  WinCondition,
} from "./types";

// --- Reducer ---

type Action =
  | { type: "ROOM_UPDATED"; players: Player[]; roomCode: string; phase: GamePhase }
  | { type: "GAME_STARTED"; phase: GamePhase }
  | { type: "ROLE_ASSIGNED"; role: Role }
  | { type: "PHASE_CHANGED"; phase: GamePhase; players: Player[]; voteHistory?: Array<{ round: number; votes: Record<string, string> }>; round?: number }
  | { type: "MORNING_NARRATION"; narration: NarrationResult }
  | { type: "VOTING_OPENED"; phase: GamePhase }
  | { type: "VOTE_RESULTS"; voteResult: VoteResult }
  | { type: "PLAYER_ELIMINATED"; players: Player[] }
  | { type: "GAME_OVER"; phase: GamePhase; winCondition: WinCondition; players: Player[] }
  | { type: "ACCUSATION_RESULTS"; results: Record<string, number> }
  | { type: "MEDIC_FEEDBACK"; message: string }
  | { type: "ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "SESSION_EXPIRED" };

const initialState: GameStore = {
  roomCode: null,
  phase: null,
  myPlayer: null,
  players: [],
  role: null,
  error: null,
  narration: null,
  voteResult: null,
  winCondition: null,
  isConnected: true,
  disconnectedAt: null,
  voteHistory: [],
  accusationResults: null,
  round: 1,
  medicFeedback: null,
};

function gameReducer(state: GameStore, action: Action): GameStore {
  switch (action.type) {
    case "ROOM_UPDATED":
      return {
        ...state,
        players: action.players,
        roomCode: action.roomCode,
        phase: action.phase,
        myPlayer:
          action.players.find((p) => p.id === socket.id) ?? state.myPlayer,
      };
    case "GAME_STARTED":
      return { ...state, phase: action.phase };
    case "ROLE_ASSIGNED":
      return { ...state, role: action.role };
    case "PHASE_CHANGED":
      return {
        ...state,
        phase: action.phase,
        players: action.players,
        myPlayer:
          action.players.find((p) => p.id === socket.id) ?? state.myPlayer,
        voteHistory: action.voteHistory ?? state.voteHistory,
        accusationResults: null, // Clear accusations on phase change
        round: action.round ?? state.round,
        medicFeedback: null, // Clear medic feedback on phase change
      };
    case "MORNING_NARRATION":
      return { ...state, narration: action.narration };
    case "VOTING_OPENED":
      return { ...state, phase: action.phase };
    case "VOTE_RESULTS":
      return { ...state, voteResult: action.voteResult };
    case "PLAYER_ELIMINATED":
      return {
        ...state,
        players: action.players,
        myPlayer:
          action.players.find((p) => p.id === socket.id) ?? state.myPlayer,
      };
    case "GAME_OVER":
      return {
        ...state,
        phase: action.phase,
        winCondition: action.winCondition,
        players: action.players,
        myPlayer:
          action.players.find((p) => p.id === socket.id) ?? state.myPlayer,
      };
    case "ACCUSATION_RESULTS":
      return { ...state, accusationResults: action.results };
    case "MEDIC_FEEDBACK":
      return { ...state, medicFeedback: action.message };
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

const GameContext = createContext<GameStore>(initialState);

export function useGameStore(): GameStore {
  return useContext(GameContext);
}

// --- Provider ---

export function GameProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    function onRoomUpdated(data: {
      players: Player[];
      roomCode: string;
      phase: GamePhase;
    }) {
      dispatch({
        type: "ROOM_UPDATED",
        players: data.players,
        roomCode: data.roomCode,
        phase: data.phase,
      });
    }

    function onGameStarted(_data: { roomCode: string }) {
      dispatch({ type: "GAME_STARTED", phase: GamePhase.RoleReveal });
    }

    function onRoleAssigned(data: { role: Role }) {
      dispatch({ type: "ROLE_ASSIGNED", role: data.role });
    }

    function onPhaseChanged(data: { phase: GamePhase; players: Player[]; voteHistory?: Array<{ round: number; votes: Record<string, string> }>; round?: number }) {
      dispatch({
        type: "PHASE_CHANGED",
        phase: data.phase,
        players: data.players,
        voteHistory: data.voteHistory,
        round: data.round,
      });
    }

    function onMorningNarration(data: NarrationResult) {
      dispatch({ type: "MORNING_NARRATION", narration: data });
    }

    function onVotingOpened(_data: { roomCode: string }) {
      dispatch({ type: "VOTING_OPENED", phase: GamePhase.Voting });
    }

    function onVoteResults(data: VoteResult) {
      dispatch({ type: "VOTE_RESULTS", voteResult: data });
    }

    function onPlayerEliminated(data: {
      playerId: string;
      playerName: string;
      role: string | null;
    }) {
      // Mark the eliminated player in the current player list
      const updatedPlayers = stateRef.current.players.map((p) =>
        p.id === data.playerId ? { ...p, isAlive: false } : p
      );
      dispatch({ type: "PLAYER_ELIMINATED", players: updatedPlayers });
    }

    function onGameOver(data: {
      winner: string;
      reason: string;
      players: Player[];
    }) {
      dispatch({
        type: "GAME_OVER",
        phase: GamePhase.GameOver,
        winCondition: { winner: data.winner, reason: data.reason },
        players: data.players,
      });
    }

    function onError(data: { error?: string; message?: string }) {
      const msg = data.error ?? data.message ?? "An error occurred";
      dispatch({ type: "ERROR", error: msg });
      setTimeout(() => dispatch({ type: "CLEAR_ERROR" }), 3000);
    }

    function onAccusationResults(data: { results: Record<string, number> }) {
      dispatch({ type: "ACCUSATION_RESULTS", results: data.results });
    }

    function onMedicFeedback(data: { message: string }) {
      dispatch({ type: "MEDIC_FEEDBACK", message: data.message });
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
    socket.on("gameStarted", onGameStarted);
    socket.on("roleAssigned", onRoleAssigned);
    socket.on("phaseChanged", onPhaseChanged);
    socket.on("morningNarration", onMorningNarration);
    socket.on("votingOpened", onVotingOpened);
    socket.on("voteResults", onVoteResults);
    socket.on("playerEliminated", onPlayerEliminated);
    socket.on("gameOver", onGameOver);
    socket.on("accusationResults", onAccusationResults);
    socket.on("medicFeedback", onMedicFeedback);
    socket.on("error", onError);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("roomUpdated", onRoomUpdated);
      socket.off("gameStarted", onGameStarted);
      socket.off("roleAssigned", onRoleAssigned);
      socket.off("phaseChanged", onPhaseChanged);
      socket.off("morningNarration", onMorningNarration);
      socket.off("votingOpened", onVotingOpened);
      socket.off("voteResults", onVoteResults);
      socket.off("playerEliminated", onPlayerEliminated);
      socket.off("gameOver", onGameOver);
      socket.off("accusationResults", onAccusationResults);
      socket.off("medicFeedback", onMedicFeedback);
      socket.off("error", onError);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);

      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
      }
    };
  }, []);

  return (
    <GameContext.Provider value={state}>{children}</GameContext.Provider>
  );
}

// --- Connection Lost Modal ---

export function ConnectionLostModal(): React.JSX.Element | null {
  const { isConnected, disconnectedAt } = useGameStore();
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
