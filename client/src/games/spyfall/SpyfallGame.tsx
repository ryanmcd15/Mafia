import React, { useState, useEffect, useCallback } from "react";
import socket from "../../socket";
import type { GameUIProps } from "../registry";

// ---------- Types ----------

type SpyfallPhase = "role" | "question" | "voting" | "gameOver";

interface RoleData {
  isSpy: boolean;
  location: string | null;
  allLocations: string[];
}

interface GameOverData {
  outcome: "Players Win" | "Spy Wins";
  spyId: string;
  spyName: string;
  location: string;
  reason: string;
}

// ---------- Helpers ----------

/**
 * Formats seconds as MM:SS with zero-padding.
 * Clamps negative values to 00:00.
 */
export function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------- Styles ----------

const containerStyle: React.CSSProperties = {
  padding: "24px 16px",
  maxWidth: "480px",
  margin: "0 auto",
  color: "var(--text-primary)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "16px",
};

const timerStyle: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: "bold",
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
  marginBottom: "16px",
};

const buttonBase: React.CSSProperties = {
  width: "100%",
  minHeight: "44px",
  padding: "12px 16px",
  fontSize: "16px",
  fontWeight: "bold",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "8px",
};

const locationGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: "8px",
  marginTop: "16px",
};

const locationChipStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "var(--bg-tertiary)",
  borderRadius: "6px",
  fontSize: "13px",
  textAlign: "center",
  color: "var(--text-secondary)",
};

// ---------- Component ----------

export const SpyfallGame: React.FC<GameUIProps> = ({ players, myPlayerId }) => {
  const [phase, setPhase] = useState<SpyfallPhase>("role");
  const [roleData, setRoleData] = useState<RoleData | null>(null);
  const [currentQuestioner, setCurrentQuestioner] = useState<string>("");
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [showGuessGrid, setShowGuessGrid] = useState(false);

  const isSpy = roleData?.isSpy ?? false;

  // Helper to get player name by id
  const getPlayerName = useCallback(
    (id: string): string => {
      const p = players.find((pl) => pl.id === id);
      return p?.name ?? "Unknown";
    },
    [players]
  );

  // ---------- Socket listeners ----------

  useEffect(() => {
    // Request current game state on mount (handles race with gameSelected)
    socket.emit("gameEvent", { type: "getState" }, (response: { success: boolean; state?: any }) => {
      if (response?.success && response.state) {
        const s = response.state;
        if (s.isSpy !== undefined) {
          setRoleData({
            isSpy: s.isSpy,
            location: s.location,
            allLocations: s.allLocations,
          });
        }
        if (s.phase === "question") {
          setPhase("question");
          setCurrentQuestioner(s.currentQuestioner ?? "");
          setCurrentTarget(s.currentTarget ?? null);
          setTimeRemaining(s.timeRemaining ?? 0);
        } else if (s.phase === "voting") {
          setPhase("voting");
          setTimeRemaining(s.timeRemaining ?? 0);
        }
      }
    });

    function handleRoleAssigned(data: {
      isSpy: boolean;
      location: string | null;
      allLocations: string[];
    }) {
      setRoleData(data);
      setPhase("role");
    }

    function handleGamePhaseChanged(data: { phase: string; state: any }) {
      if (data.phase === "question") {
        setPhase("question");
        setVotedFor(null);
        setShowGuessGrid(false);
        if (data.state) {
          setCurrentQuestioner(data.state.currentQuestioner);
          setCurrentTarget(data.state.currentTarget);
          setTimeRemaining(data.state.timeRemaining);
          if (data.state.isSpy !== undefined) {
            setRoleData((prev) => prev ? { ...prev, isSpy: data.state.isSpy } : prev);
          }
        }
      } else if (data.phase === "voting") {
        setPhase("voting");
        setVotedFor(null);
        setShowGuessGrid(false);
      }
    }

    function handleTurnStarted(data: { questioner: string; questionerName: string }) {
      setCurrentQuestioner(data.questioner);
      setCurrentTarget(null);
    }

    function handleQuestionTarget(data: { target: string; targetName: string }) {
      setCurrentTarget(data.target);
    }

    function handleTimerUpdate(data: { timeRemaining: number }) {
      setTimeRemaining(data.timeRemaining);
    }

    function handleVotingOpened(data: { timeRemaining: number }) {
      setPhase("voting");
      setTimeRemaining(data.timeRemaining);
      setVotedFor(null);
    }

    function handleGameOver(data: GameOverData) {
      setGameOverData(data);
      setPhase("gameOver");
    }

    socket.on("roleAssigned", handleRoleAssigned);
    socket.on("spyfallPhaseChanged", handleGamePhaseChanged);
    socket.on("turnStarted", handleTurnStarted);
    socket.on("questionTarget", handleQuestionTarget);
    socket.on("timerUpdate", handleTimerUpdate);
    socket.on("votingOpened", handleVotingOpened);
    socket.on("gameOver", handleGameOver);

    return () => {
      socket.off("roleAssigned", handleRoleAssigned);
      socket.off("spyfallPhaseChanged", handleGamePhaseChanged);
      socket.off("turnStarted", handleTurnStarted);
      socket.off("questionTarget", handleQuestionTarget);
      socket.off("timerUpdate", handleTimerUpdate);
      socket.off("votingOpened", handleVotingOpened);
      socket.off("gameOver", handleGameOver);
    };
  }, []);

  // ---------- Actions ----------

  function selectTarget(targetId: string) {
    socket.emit("gameEvent", { type: "selectTarget", payload: { targetId } });
  }

  function answerComplete() {
    socket.emit("gameEvent", { type: "answerComplete", payload: {} });
  }

  function callVote() {
    socket.emit("gameEvent", { type: "callVote", payload: {} });
  }

  function submitVote(accusedId: string) {
    socket.emit("gameEvent", { type: "submitVote", payload: { accusedId } });
    setVotedFor(accusedId);
  }

  function spyGuess(location: string) {
    socket.emit("gameEvent", { type: "spyGuess", payload: { location } });
    setShowGuessGrid(false);
  }

  // ---------- Render phases ----------

  // Role Assignment Phase
  if (phase === "role" && roleData) {
    return (
      <div style={containerStyle}>
        {roleData.isSpy ? (
          <>
            <h2 style={{ ...headingStyle, color: "var(--danger)", fontSize: "24px" }}>
              🕵️ You are the Spy!
            </h2>
            <p
              style={{
                textAlign: "center",
                color: "var(--text-secondary)",
                marginBottom: "16px",
              }}
            >
              Figure out the location by asking questions. Here are all possible locations:
            </p>
          </>
        ) : (
          <>
            <h2 style={headingStyle}>Your Location:</h2>
            <p
              style={{
                textAlign: "center",
                fontSize: "28px",
                fontWeight: "bold",
                color: "var(--accent)",
                marginBottom: "16px",
              }}
            >
              {roleData.location}
            </p>
            <p
              style={{
                textAlign: "center",
                color: "var(--text-secondary)",
                marginBottom: "16px",
              }}
            >
              All possible locations (for reference):
            </p>
          </>
        )}
        <div style={locationGridStyle}>
          {roleData.allLocations.map((loc) => (
            <div key={loc} style={locationChipStyle}>
              {loc}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Question Phase
  if (phase === "question") {
    const isQuestioner = currentQuestioner === myPlayerId;
    const isTarget = currentTarget === myPlayerId;
    const timerColor = timeRemaining <= 30 ? "var(--danger)" : "var(--text-primary)";

    return (
      <div style={containerStyle}>
        {/* Location display for non-spy players */}
        {!isSpy && roleData?.location && (
          <div
            style={{
              background: "rgba(108, 99, 255, 0.15)",
              border: "2px solid var(--accent)",
              borderRadius: "12px",
              padding: "12px 16px",
              marginBottom: "16px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Your Location
            </p>
            <p style={{ fontSize: "20px", fontWeight: "bold", color: "var(--accent)" }}>
              {roleData.location}
            </p>
          </div>
        )}

        {/* Timer */}
        <div style={{ ...timerStyle, color: timerColor }} aria-live="polite">
          {formatTime(timeRemaining)}
        </div>

        {/* Current turn info */}
        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "4px" }}>
            Questioner
          </p>
          <p style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "8px" }}>
            {getPlayerName(currentQuestioner)}
          </p>
          {currentTarget && (
            <>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Answering
              </p>
              <p style={{ fontSize: "18px", fontWeight: "bold" }}>
                {getPlayerName(currentTarget)}
              </p>
            </>
          )}
        </div>

        {/* Questioner: select a target */}
        {isQuestioner && !currentTarget && (
          <div style={{ marginBottom: "16px" }}>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              Select someone to question:
            </p>
            {players
              .filter((p) => p.id !== myPlayerId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectTarget(p.id)}
                  style={{
                    ...buttonBase,
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "2px solid var(--bg-tertiary)",
                  }}
                >
                  {p.name}
                </button>
              ))}
          </div>
        )}

        {/* Target: answer complete button */}
        {isTarget && (
          <button
            onClick={answerComplete}
            style={{
              ...buttonBase,
              background: "var(--success)",
              color: "#ffffff",
              marginBottom: "16px",
            }}
          >
            Done (Answer Complete)
          </button>
        )}

        {/* Accuse button (all players) */}
        <button
          onClick={callVote}
          style={{
            ...buttonBase,
            background: "var(--danger)",
            color: "#ffffff",
          }}
        >
          Accuse
        </button>

        {/* Guess Location button (spy only) */}
        {isSpy && (
          <button
            onClick={() => setShowGuessGrid(!showGuessGrid)}
            style={{
              ...buttonBase,
              background: "var(--accent)",
              color: "#ffffff",
            }}
          >
            Guess Location
          </button>
        )}

        {/* Spy guess grid */}
        {isSpy && showGuessGrid && roleData && (
          <div style={{ marginTop: "12px" }}>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              Select a location:
            </p>
            <div style={locationGridStyle}>
              {roleData.allLocations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => spyGuess(loc)}
                  style={{
                    ...locationChipStyle,
                    cursor: "pointer",
                    border: "none",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    minHeight: "44px",
                    fontWeight: "500",
                  }}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Locations reference */}
        {!showGuessGrid && roleData && (
          <div style={{ marginTop: "24px" }}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              All Locations:
            </p>
            <div style={locationGridStyle}>
              {roleData.allLocations.map((loc) => (
                <div key={loc} style={locationChipStyle}>
                  {loc}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Voting Phase
  if (phase === "voting") {
    const timerColor = timeRemaining <= 10 ? "var(--danger)" : "var(--text-primary)";

    return (
      <div style={containerStyle}>
        <h2 style={headingStyle}>Vote: Who is the Spy?</h2>

        {/* Voting Timer */}
        <div style={{ ...timerStyle, color: timerColor }} aria-live="polite">
          {formatTime(timeRemaining)}
        </div>

        {votedFor ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
              background: "var(--bg-secondary)",
              borderRadius: "12px",
            }}
          >
            <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>
              Vote submitted!
            </p>
            <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
              Waiting for others...
            </p>
          </div>
        ) : (
          <div>
            {players
              .filter((p) => p.id !== myPlayerId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => submitVote(p.id)}
                  style={{
                    ...buttonBase,
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "2px solid var(--bg-tertiary)",
                  }}
                >
                  {p.name}
                </button>
              ))}
          </div>
        )}
      </div>
    );
  }

  // Game Over Phase
  if (phase === "gameOver" && gameOverData) {
    const isPlayersWin = gameOverData.outcome === "Players Win";
    return (
      <div style={containerStyle}>
        <h2
          style={{
            ...headingStyle,
            fontSize: "28px",
            color: isPlayersWin ? "var(--success)" : "var(--danger)",
          }}
        >
          {isPlayersWin ? "🎉 Players Win!" : "🕵️ Spy Wins!"}
        </h2>

        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>The Spy was</p>
            <p style={{ fontSize: "20px", fontWeight: "bold", color: "var(--danger)" }}>
              {gameOverData.spyName}
            </p>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>The Location was</p>
            <p style={{ fontSize: "20px", fontWeight: "bold", color: "var(--accent)" }}>
              {gameOverData.location}
            </p>
          </div>
          <div>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Reason</p>
            <p style={{ fontSize: "16px", color: "var(--text-primary)" }}>
              {gameOverData.reason}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback / waiting
  return (
    <div style={{ ...containerStyle, textAlign: "center" }}>
      <p style={{ color: "var(--text-secondary)" }}>Waiting for game to start...</p>
    </div>
  );
};

export default SpyfallGame;
