import React, { useCallback, useEffect, useState } from "react";
import type { GameUIProps } from "../registry";
import socket from "../../socket";

/* ─── Types ─────────────────────────────────────────────────────── */

interface TwoTruthsOneLieState {
  phase: "submission" | "play" | "reveal" | "scores";
  currentPresenter: string | null;
  currentStatements: string[] | null;
  votes: Record<string, number>;
  scores: Record<string, number>;
  roundNumber: number;
  totalRounds: number;
  voteTimeRemaining: number;
}

interface LieRevealedPayload {
  lieIndex: number;
  correctVoters: string[];
  scores: Record<string, number>;
}

interface GameOverPayload {
  scores: Record<string, number>;
  winner: string;
}

/* ─── Shared Styles ─────────────────────────────────────────────── */

const containerStyle: React.CSSProperties = {
  padding: "24px 16px",
  maxWidth: "480px",
  margin: "0 auto",
  fontFamily: "inherit",
};

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "var(--text-primary)",
  textAlign: "center",
  marginBottom: "16px",
};

const buttonBase: React.CSSProperties = {
  minHeight: "44px",
  minWidth: "44px",
  padding: "12px 16px",
  fontSize: "16px",
  fontWeight: "bold",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background 0.15s, opacity 0.15s",
};

const cardStyle: React.CSSProperties = {
  padding: "16px",
  background: "var(--bg-secondary)",
  borderRadius: "12px",
  marginBottom: "12px",
};

/* ─── Main Component ────────────────────────────────────────────── */

export const TwoTruthsOneLieGame: React.FC<GameUIProps> = ({
  players,
  myPlayerId,
  isHost,
}) => {
  const [gameState, setGameState] = useState<TwoTruthsOneLieState>({
    phase: "submission",
    currentPresenter: null,
    currentStatements: null,
    votes: {},
    scores: {},
    roundNumber: 1,
    totalRounds: 0,
    voteTimeRemaining: 0,
  });

  const [revealData, setRevealData] = useState<LieRevealedPayload | null>(null);
  const [gameOverData, setGameOverData] = useState<GameOverPayload | null>(null);

  useEffect(() => {
    const handlePhaseChanged = (data: { phase: string; totalRounds?: number; state?: TwoTruthsOneLieState }) => {
      if (data.state) {
        setGameState(data.state);
      } else {
        // Minimal phase update when full state not provided
        setGameState((prev) => ({
          ...prev,
          phase: data.phase as TwoTruthsOneLieState["phase"],
          totalRounds: data.totalRounds ?? prev.totalRounds,
        }));
      }
      if (data.phase !== "reveal") {
        setRevealData(null);
      }
    };

    const handleLieRevealed = (data: LieRevealedPayload) => {
      setRevealData(data);
      setGameState((prev) => ({ ...prev, scores: data.scores, phase: "reveal" }));
    };

    const handleGameOver = (data: GameOverPayload) => {
      setGameOverData(data);
      setGameState((prev) => ({ ...prev, scores: data.scores, phase: "scores" }));
    };

    const handleTimerUpdate = (data: { timeRemaining: number }) => {
      setGameState((prev) => ({ ...prev, voteTimeRemaining: data.timeRemaining }));
    };

    const handleRoundStarted = (data: {
      roundNumber: number;
      totalRounds: number;
      presenterId: string;
      presenterName: string;
      statements: string[];
      voteTimeRemaining: number;
    }) => {
      setGameState((prev) => ({
        ...prev,
        phase: "play",
        currentPresenter: data.presenterId,
        currentStatements: data.statements,
        roundNumber: data.roundNumber,
        totalRounds: data.totalRounds,
        voteTimeRemaining: data.voteTimeRemaining,
        votes: {},
      }));
      setRevealData(null);
    };

    socket.on("ttolPhaseChanged", handlePhaseChanged);
    socket.on("roundStarted", handleRoundStarted);
    socket.on("lieRevealed", handleLieRevealed);
    socket.on("gameOver", handleGameOver);
    socket.on("voteTimerUpdate", handleTimerUpdate);

    return () => {
      socket.off("ttolPhaseChanged", handlePhaseChanged);
      socket.off("roundStarted", handleRoundStarted);
      socket.off("lieRevealed", handleLieRevealed);
      socket.off("gameOver", handleGameOver);
      socket.off("voteTimerUpdate", handleTimerUpdate);
    };
  }, []);

  switch (gameState.phase) {
    case "submission":
      return <SubmissionPhase players={players} myPlayerId={myPlayerId} />;
    case "play":
      return (
        <PlayPhase
          gameState={gameState}
          players={players}
          myPlayerId={myPlayerId}
        />
      );
    case "reveal":
      return (
        <RevealPhase
          gameState={gameState}
          revealData={revealData}
          players={players}
          isHost={isHost}
        />
      );
    case "scores":
      return (
        <FinalScoreboard
          scores={gameOverData?.scores ?? gameState.scores}
          winner={gameOverData?.winner ?? null}
          players={players}
        />
      );
    default:
      return (
        <div style={{ ...containerStyle, textAlign: "center", color: "var(--text-secondary)" }}>
          Waiting for game to start...
        </div>
      );
  }
};

/* ─── Submission Phase ──────────────────────────────────────────── */

interface SubmissionPhaseProps {
  players: GameUIProps["players"];
  myPlayerId: string;
}

const SubmissionPhase: React.FC<SubmissionPhaseProps> = ({ players, myPlayerId }) => {
  const [statements, setStatements] = useState<string[]>(["", "", ""]);
  const [lieIndex, setLieIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedPlayers, setSubmittedPlayers] = useState<string[]>([]);

  useEffect(() => {
    const handlePlayerSubmitted = (data: { playerId: string }) => {
      setSubmittedPlayers((prev) =>
        prev.includes(data.playerId) ? prev : [...prev, data.playerId]
      );
    };
    socket.on("playerSubmitted", handlePlayerSubmitted);
    return () => { socket.off("playerSubmitted", handlePlayerSubmitted); };
  }, []);

  const handleStatementChange = (index: number, value: string) => {
    if (value.length > 200) return;
    setStatements((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const allFilled = statements.every((s) => s.trim().length > 0);
  const canSubmit = allFilled && lieIndex !== null && !submitted;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = statements.map((text, i) => ({
      text: text.trim(),
      isLie: i === lieIndex,
    }));
    socket.emit("gameEvent", { type: "submitStatements", payload: { statements: payload } });
    setSubmitted(true);
    setSubmittedPlayers((prev) =>
      prev.includes(myPlayerId) ? prev : [...prev, myPlayerId]
    );
  };

  if (submitted) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)", marginBottom: "8px" }}>
            Statements submitted!
          </p>
          <p style={{ color: "var(--text-secondary)" }}>Waiting for others...</p>
        </div>
        <ReadyIndicator players={players} submittedPlayers={submittedPlayers} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>Enter Your Statements</h2>
      <p style={{ color: "var(--text-secondary)", textAlign: "center", marginBottom: "20px", fontSize: "14px" }}>
        Write 2 truths and 1 lie. Mark which one is the lie.
      </p>

      {statements.map((text, i) => (
        <div key={i} style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: "6px" }}>
            <label
              htmlFor={`statement-${i}`}
              style={{ flex: 1, fontSize: "14px", color: "var(--text-secondary)" }}
            >
              Statement {i + 1}
            </label>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {text.length}/200
            </span>
          </div>
          <textarea
            id={`statement-${i}`}
            value={text}
            onChange={(e) => handleStatementChange(i, e.target.value)}
            placeholder={`Enter statement ${i + 1}...`}
            maxLength={200}
            rows={2}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "2px solid var(--bg-tertiary)",
              borderRadius: "8px",
              resize: "none",
              boxSizing: "border-box",
            }}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "6px",
              cursor: "pointer",
              minHeight: "44px",
              padding: "4px 0",
            }}
          >
            <input
              type="radio"
              name="lie-marker"
              checked={lieIndex === i}
              onChange={() => setLieIndex(i)}
              style={{ width: "20px", height: "20px", accentColor: "var(--danger)" }}
            />
            <span style={{ fontSize: "14px", color: lieIndex === i ? "var(--danger)" : "var(--text-secondary)" }}>
              This is the lie
            </span>
          </label>
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          ...buttonBase,
          width: "100%",
          background: canSubmit ? "var(--accent)" : "var(--bg-tertiary)",
          color: canSubmit ? "#ffffff" : "var(--text-secondary)",
          opacity: canSubmit ? 1 : 0.6,
          cursor: canSubmit ? "pointer" : "not-allowed",
          marginTop: "8px",
        }}
      >
        Submit Statements
      </button>

      <ReadyIndicator players={players} submittedPlayers={submittedPlayers} />
    </div>
  );
};

/* ─── Ready Indicator ───────────────────────────────────────────── */

interface ReadyIndicatorProps {
  players: GameUIProps["players"];
  submittedPlayers: string[];
}

const ReadyIndicator: React.FC<ReadyIndicatorProps> = ({ players, submittedPlayers }) => (
  <div style={{ marginTop: "20px" }}>
    <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>
      Players ready: {submittedPlayers.length}/{players.length}
    </p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {players.map((p) => {
        const ready = submittedPlayers.includes(p.id);
        return (
          <span
            key={p.id}
            style={{
              padding: "4px 10px",
              borderRadius: "12px",
              fontSize: "13px",
              background: ready ? "var(--success)" : "var(--bg-tertiary)",
              color: ready ? "#ffffff" : "var(--text-secondary)",
            }}
          >
            {p.name} {ready ? "✓" : "…"}
          </span>
        );
      })}
    </div>
  </div>
);

/* ─── Play Phase ────────────────────────────────────────────────── */

interface PlayPhaseProps {
  gameState: TwoTruthsOneLieState;
  players: GameUIProps["players"];
  myPlayerId: string;
}

const PlayPhase: React.FC<PlayPhaseProps> = ({ gameState, players, myPlayerId }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [voted, setVoted] = useState(false);

  const isPresenter = gameState.currentPresenter === myPlayerId;
  const presenterPlayer = players.find((p) => p.id === gameState.currentPresenter);
  const presenterName = presenterPlayer?.name ?? "Unknown";

  // Loading state while waiting for roundStarted event
  if (!gameState.currentStatements || gameState.currentStatements.length === 0) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "var(--text-secondary)", textAlign: "center", fontSize: "1.1rem" }}>
          Starting round...
        </p>
      </div>
    );
  }

  // Reset vote state when presenter changes
  useEffect(() => {
    setSelectedIndex(null);
    setVoted(false);
  }, [gameState.currentPresenter]);

  const handleVote = useCallback((index: number) => {
    if (voted || isPresenter) return;
    setSelectedIndex(index);
    setVoted(true);
    socket.emit("gameEvent", { type: "submitLieVote", payload: { statementIndex: index } });
  }, [voted, isPresenter]);

  const timeLeft = gameState.voteTimeRemaining;
  const timerColor = timeLeft <= 10 ? "var(--danger)" : "var(--text-primary)";

  return (
    <div style={containerStyle}>
      {/* Round info */}
      <p style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
        Round {gameState.roundNumber}/{gameState.totalRounds}
      </p>

      {/* Presenter */}
      <h2 style={{ ...headingStyle, marginBottom: "4px" }}>{presenterName}'s Turn</h2>
      <p style={{ textAlign: "center", fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
        {isPresenter ? "Others are guessing your lie!" : "Which statement is the lie?"}
      </p>

      {/* Timer */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <span
          aria-live="polite"
          style={{
            fontSize: "28px",
            fontWeight: "bold",
            fontVariantNumeric: "tabular-nums",
            color: timerColor,
          }}
        >
          {timeLeft}s
        </span>
      </div>

      {/* Statements */}
      {gameState.currentStatements?.map((statement, i) => {
        const isSelected = selectedIndex === i;
        const canClick = !isPresenter && !voted;

        return (
          <button
            key={i}
            onClick={() => canClick && handleVote(i)}
            disabled={isPresenter || voted}
            aria-label={`Statement ${i + 1}: ${statement}`}
            style={{
              ...buttonBase,
              width: "100%",
              textAlign: "left",
              marginBottom: "12px",
              padding: "16px",
              background: isSelected ? "var(--accent)" : "var(--bg-secondary)",
              color: isSelected ? "#ffffff" : "var(--text-primary)",
              border: isSelected ? "2px solid var(--accent)" : "2px solid var(--bg-tertiary)",
              borderRadius: "12px",
              fontWeight: "normal",
              fontSize: "15px",
              lineHeight: "1.4",
              cursor: canClick ? "pointer" : "default",
              opacity: isPresenter ? 0.7 : 1,
            }}
          >
            <span style={{ fontWeight: "bold", marginRight: "8px", color: isSelected ? "#ffffff" : "var(--text-secondary)" }}>
              {i + 1}.
            </span>
            {statement}
          </button>
        );
      })}

      {voted && (
        <p style={{ textAlign: "center", color: "var(--success)", fontSize: "14px", marginTop: "8px" }}>
          Vote submitted! Waiting for reveal...
        </p>
      )}

      {isPresenter && (
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "14px", marginTop: "8px" }}>
          Sit back — players are guessing your lie!
        </p>
      )}

      {/* Mini scoreboard */}
      <MiniScoreboard scores={gameState.scores} players={players} />
    </div>
  );
};

/* ─── Reveal Phase ──────────────────────────────────────────────── */

interface RevealPhaseProps {
  gameState: TwoTruthsOneLieState;
  revealData: LieRevealedPayload | null;
  players: GameUIProps["players"];
  isHost: boolean;
}

const RevealPhase: React.FC<RevealPhaseProps> = ({ gameState, revealData, players, isHost }) => {
  const presenterPlayer = players.find((p) => p.id === gameState.currentPresenter);
  const presenterName = presenterPlayer?.name ?? "Unknown";

  const handleNext = () => {
    socket.emit("gameEvent", { type: "nextRound", payload: {} });
  };

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>The Lie Is Revealed!</h2>
      <p style={{ textAlign: "center", fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
        {presenterName}'s statements
      </p>

      {/* Statements with reveal highlighting */}
      {gameState.currentStatements?.map((statement, i) => {
        const isLie = revealData?.lieIndex === i;
        let borderColor = "var(--bg-tertiary)";
        let bgColor = "var(--bg-secondary)";
        let labelText = "";

        if (isLie) {
          borderColor = "var(--danger)";
          bgColor = "rgba(239, 68, 68, 0.1)";
          labelText = "🤥 THE LIE";
        } else if (revealData) {
          borderColor = "var(--success)";
          bgColor = "rgba(34, 197, 94, 0.1)";
          labelText = "✓ Truth";
        }

        return (
          <div
            key={i}
            style={{
              padding: "16px",
              marginBottom: "12px",
              background: bgColor,
              border: `2px solid ${borderColor}`,
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-primary)", fontSize: "15px", lineHeight: "1.4", flex: 1 }}>
                <span style={{ fontWeight: "bold", marginRight: "8px", color: "var(--text-secondary)" }}>
                  {i + 1}.
                </span>
                {statement}
              </p>
              {labelText && (
                <span style={{ fontSize: "12px", fontWeight: "bold", color: isLie ? "var(--danger)" : "var(--success)", whiteSpace: "nowrap", marginLeft: "8px" }}>
                  {labelText}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Correct voters */}
      {revealData && revealData.correctVoters.length > 0 && (
        <div style={{ ...cardStyle, marginTop: "16px" }}>
          <p style={{ fontSize: "14px", fontWeight: "bold", color: "var(--success)", marginBottom: "8px" }}>
            ✓ Guessed correctly:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {revealData.correctVoters.map((id) => {
              const player = players.find((p) => p.id === id);
              return (
                <span key={id} style={{ padding: "4px 10px", borderRadius: "12px", fontSize: "13px", background: "var(--success)", color: "#ffffff" }}>
                  {player?.name ?? id}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {revealData && revealData.correctVoters.length === 0 && (
        <div style={{ ...cardStyle, marginTop: "16px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            Nobody guessed correctly!
          </p>
        </div>
      )}

      {/* Updated scores */}
      <MiniScoreboard scores={revealData?.scores ?? gameState.scores} players={players} />

      {/* Host next button */}
      {isHost && (
        <button
          onClick={handleNext}
          style={{
            ...buttonBase,
            width: "100%",
            marginTop: "16px",
            background: "var(--accent)",
            color: "#ffffff",
          }}
        >
          Next Round →
        </button>
      )}
    </div>
  );
};

/* ─── Final Scoreboard ──────────────────────────────────────────── */

interface FinalScoreboardProps {
  scores: Record<string, number>;
  winner: string | null;
  players: GameUIProps["players"];
}

const FinalScoreboard: React.FC<FinalScoreboardProps> = ({ scores, winner, players }) => {
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

  return (
    <div style={containerStyle}>
      <h2 style={{ ...headingStyle, fontSize: "24px", marginBottom: "24px" }}>🏆 Final Scores</h2>

      <div style={{ background: "var(--bg-secondary)", borderRadius: "12px", overflow: "hidden" }}>
        {sorted.map(([playerId, score], rank) => {
          const player = players.find((p) => p.id === playerId);
          const name = player?.name ?? playerId;
          const isWinner = playerId === winner;

          return (
            <div
              key={playerId}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "14px 16px",
                borderBottom: rank < sorted.length - 1 ? "1px solid var(--bg-tertiary)" : "none",
                background: isWinner ? "rgba(234, 179, 8, 0.15)" : "transparent",
              }}
            >
              {/* Rank */}
              <span style={{
                width: "32px",
                fontSize: rank === 0 ? "20px" : "16px",
                fontWeight: "bold",
                color: rank === 0 ? "#eab308" : "var(--text-secondary)",
              }}>
                {rank === 0 ? "👑" : `#${rank + 1}`}
              </span>

              {/* Name */}
              <span style={{
                flex: 1,
                fontSize: "16px",
                fontWeight: isWinner ? "bold" : "normal",
                color: isWinner ? "#eab308" : "var(--text-primary)",
              }}>
                {name}
              </span>

              {/* Score */}
              <span style={{
                fontSize: "18px",
                fontWeight: "bold",
                fontVariantNumeric: "tabular-nums",
                color: isWinner ? "#eab308" : "var(--accent)",
              }}>
                {score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ─── Mini Scoreboard ───────────────────────────────────────────── */

interface MiniScoreboardProps {
  scores: Record<string, number>;
  players: GameUIProps["players"];
}

const MiniScoreboard: React.FC<MiniScoreboardProps> = ({ scores, players }) => {
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) return null;

  return (
    <div style={{ marginTop: "24px" }}>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: "bold" }}>
        Scoreboard
      </p>
      <div style={{ background: "var(--bg-secondary)", borderRadius: "8px", padding: "8px 12px" }}>
        {sorted.map(([playerId, score]) => {
          const player = players.find((p) => p.id === playerId);
          return (
            <div
              key={playerId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                fontSize: "14px",
              }}
            >
              <span style={{ color: "var(--text-primary)" }}>{player?.name ?? playerId}</span>
              <span style={{ fontWeight: "bold", color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                {score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TwoTruthsOneLieGame;
