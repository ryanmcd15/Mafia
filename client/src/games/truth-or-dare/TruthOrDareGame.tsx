import { useEffect, useState, useCallback } from "react";
import socket from "../../socket";
import { GameUIProps } from "../registry";

interface Prompt {
  id: string;
  text: string;
  category: "truth" | "dare";
  submittedBy: string;
}

interface TruthOrDareState {
  phase: "submission" | "play";
  promptPool: Prompt[];
  readyPlayers: string[];
  currentSelectedPlayer: string | null;
  currentPrompt: Prompt | null;
  currentCategory: "truth" | "dare" | null;
  hostId: string;
}

type GamePhase = "submission" | "play";

/* ─── CSS Keyframes (injected once) ─────────────────────────────────────── */
const KEYFRAMES_ID = "tod-keyframes";
function injectKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes tod-pulse {
      0%, 100% { box-shadow: 0 0 12px rgba(99, 102, 241, 0.4); }
      50% { box-shadow: 0 0 28px rgba(99, 102, 241, 0.8), 0 0 56px rgba(139, 92, 246, 0.3); }
    }
    @keyframes tod-glow-green {
      0%, 100% { box-shadow: 0 0 8px rgba(34, 197, 94, 0.3); }
      50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.6); }
    }
    @keyframes tod-fadeInUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes tod-scaleIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes tod-spotlight {
      0%, 100% { box-shadow: 0 0 24px rgba(139, 92, 246, 0.3), 0 0 60px rgba(139, 92, 246, 0.1); }
      50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.5), 0 0 80px rgba(139, 92, 246, 0.2); }
    }
    @keyframes tod-spin-highlight {
      0%, 100% { box-shadow: 0 0 16px rgba(99, 102, 241, 0.6); }
      50% { box-shadow: 0 0 32px rgba(99, 102, 241, 0.9), 0 0 48px rgba(139, 92, 246, 0.4); }
    }
    @keyframes tod-bounceIn {
      0% { transform: scale(0.5); opacity: 0; }
      60% { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(1); }
    }
    @keyframes tod-shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
  `;
  document.head.appendChild(style);
}

export const TruthOrDareGame: React.FC<GameUIProps> = ({
  players,
  myPlayerId,
  isHost,
}) => {
  const [phase, setPhase] = useState<GamePhase>("submission");
  const [promptText, setPromptText] = useState("");
  const [promptCategory, setPromptCategory] = useState<"truth" | "dare">("truth");
  const [submittedCount, setSubmittedCount] = useState(0);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Play phase state
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<Prompt | null>(null);
  const [currentCategory, setCurrentCategory] = useState<"truth" | "dare" | null>(null);
  const [revealedPlayerName, setRevealedPlayerName] = useState<string | null>(null);
  const [spinHighlightIndex, setSpinHighlightIndex] = useState(0);
  const [noPromptsMessage, setNoPromptsMessage] = useState<string | null>(null);

  // Inject CSS animations on mount
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Listen to socket events
  useEffect(() => {
    function handlePhaseChanged(data: { phase: string; state: TruthOrDareState }) {
      setPhase(data.phase as GamePhase);
      setReadyPlayers(data.state.readyPlayers);
      if (data.phase === "play") {
        setSelectedPlayer(data.state.currentSelectedPlayer);
        setCurrentPrompt(data.state.currentPrompt);
        setCurrentCategory(data.state.currentCategory);
      }
    }

    function handleWheelResult(data: { selectedPlayer: string; selectedPlayerName: string }) {
      // Start spin animation then land on result
      setIsSpinning(true);
      setCurrentPrompt(null);
      setCurrentCategory(null);
      setRevealedPlayerName(null);
      setNoPromptsMessage(null);

      const totalDuration = 3000;
      const intervals = 20;
      const intervalTime = totalDuration / intervals;
      let count = 0;

      const spinInterval = setInterval(() => {
        count++;
        setSpinHighlightIndex((prev) => (prev + 1) % players.length);
        if (count >= intervals) {
          clearInterval(spinInterval);
          setIsSpinning(false);
          setSelectedPlayer(data.selectedPlayer);
          setSelectedPlayerName(data.selectedPlayerName);
        }
      }, intervalTime);
    }

    function handlePromptRevealed(data: {
      prompt: Prompt | null;
      category: string;
      selectedPlayerName: string;
      substituted?: boolean;
      message?: string;
    }) {
      if (data.prompt === null) {
        // Category empty — show message
        setNoPromptsMessage(data.message ?? "No prompts available for that category.");
        setCurrentPrompt(null);
        setCurrentCategory(null);
        return;
      }
      setNoPromptsMessage(null);
      setCurrentPrompt(data.prompt);
      setCurrentCategory(data.category as "truth" | "dare");
      setRevealedPlayerName(data.selectedPlayerName);
    }

    function handlePlayerReadyUpdate(data: { readyPlayers: string[] }) {
      setReadyPlayers(data.readyPlayers);
    }

    function handlePromptSubmitted(data: { playerId: string; count: number }) {
      if (data.playerId === myPlayerId) {
        setSubmittedCount(data.count);
      }
    }

    function handleNextTurnStarted() {
      setSelectedPlayer(null);
      setSelectedPlayerName(null);
      setCurrentPrompt(null);
      setCurrentCategory(null);
      setRevealedPlayerName(null);
    }

    socket.on("todPhaseChanged", handlePhaseChanged);
    socket.on("wheelResult", handleWheelResult);
    socket.on("promptRevealed", handlePromptRevealed);
    socket.on("playerReadyUpdate", handlePlayerReadyUpdate);
    socket.on("promptSubmitted", handlePromptSubmitted);
    socket.on("nextTurnStarted", handleNextTurnStarted);

    return () => {
      socket.off("todPhaseChanged", handlePhaseChanged);
      socket.off("wheelResult", handleWheelResult);
      socket.off("promptRevealed", handlePromptRevealed);
      socket.off("playerReadyUpdate", handlePlayerReadyUpdate);
      socket.off("promptSubmitted", handlePromptSubmitted);
      socket.off("nextTurnStarted", handleNextTurnStarted);
    };
  }, [myPlayerId, players.length]);

  const handleSubmitPrompt = useCallback(() => {
    if (!promptText.trim() || promptText.length > 280) return;
    socket.emit("gameEvent", {
      type: "submitPrompt",
      payload: { text: promptText.trim(), category: promptCategory },
    });
    setPromptText("");
  }, [promptText, promptCategory]);

  const handleReady = useCallback(() => {
    socket.emit("gameEvent", { type: "playerReady", payload: {} });
    setIsReady(true);
  }, []);

  const handleSpinWheel = useCallback(() => {
    socket.emit("gameEvent", { type: "spinWheel", payload: {} });
  }, []);

  const handleChoiceSelected = useCallback((category: "truth" | "dare") => {
    socket.emit("gameEvent", { type: "choiceSelected", payload: { category } });
  }, []);

  const handleNextTurn = useCallback(() => {
    setSelectedPlayer(null);
    setSelectedPlayerName(null);
    setCurrentPrompt(null);
    setCurrentCategory(null);
    setRevealedPlayerName(null);
    socket.emit("gameEvent", { type: "nextTurn", payload: {} });
  }, []);

  const handleEndGame = useCallback(() => {
    socket.emit("gameEvent", { type: "endGame", payload: {} });
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // SUBMISSION PHASE
  // ═══════════════════════════════════════════════════════════════════
  if (phase === "submission") {
    return (
      <div style={styles.submissionContainer}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>🎯 Truth or Dare</h1>
          <p style={styles.subtitle}>Submit prompts for the game</p>
        </div>

        {/* Prompt input card */}
        <div style={styles.card}>
          <div style={styles.inputWrapper}>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value.slice(0, 280))}
              placeholder="Type a spicy truth question or a wild dare challenge..."
              style={styles.textarea}
              maxLength={280}
              aria-label="Prompt text"
            />
            <span style={styles.charCount}>
              {promptText.length}/280
            </span>
          </div>

          {/* Truth/Dare toggle pills */}
          <div style={styles.toggleRow}>
            <button
              onClick={() => setPromptCategory("truth")}
              style={{
                ...styles.togglePill,
                ...(promptCategory === "truth" ? styles.truthPillActive : styles.pillInactive),
              }}
              aria-pressed={promptCategory === "truth"}
            >
              🔮 Truth
            </button>
            <button
              onClick={() => setPromptCategory("dare")}
              style={{
                ...styles.togglePill,
                ...(promptCategory === "dare" ? styles.darePillActive : styles.pillInactive),
              }}
              aria-pressed={promptCategory === "dare"}
            >
              🔥 Dare
            </button>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmitPrompt}
            disabled={!promptText.trim()}
            style={{
              ...styles.submitButton,
              opacity: promptText.trim() ? 1 : 0.5,
              cursor: promptText.trim() ? "pointer" : "not-allowed",
            }}
          >
            ✨ Submit Prompt
          </button>

          {submittedCount > 0 && (
            <div style={styles.submittedBadge}>
              <span style={styles.submittedBadgeIcon}>✓</span>
              <span>{submittedCount} prompt{submittedCount !== 1 ? "s" : ""} submitted</span>
            </div>
          )}
        </div>

        {/* Encouragement / minimum prompt notice */}
        {submittedCount < 1 && (
          <div style={styles.encouragementBox}>
            <span>📝</span>
            <span>Submit at least 1 prompt to continue</span>
          </div>
        )}

        {/* Ready button */}
        <div style={styles.readySection}>
          <button
            onClick={handleReady}
            disabled={submittedCount < 1 || isReady}
            style={{
              ...styles.readyButton,
              opacity: submittedCount >= 1 && !isReady ? 1 : 0.5,
              cursor: submittedCount >= 1 && !isReady ? "pointer" : "not-allowed",
              animation: submittedCount >= 1 && !isReady ? "tod-glow-green 2s ease-in-out infinite" : "none",
            }}
          >
            {isReady ? "✅ You're Ready!" : "🚀 I'm Ready"}
          </button>
        </div>

        {/* Player ready indicators */}
        <div style={styles.playersCard}>
          <h2 style={styles.playersSectionTitle}>👥 Players</h2>
          <ul style={styles.list}>
            {players.map((player) => {
              const ready = readyPlayers.includes(player.id);
              return (
                <li key={player.id} style={styles.playerRow}>
                  <div style={styles.playerRowLeft}>
                    <span
                      style={{
                        ...styles.readyDot,
                        backgroundColor: ready ? "#22c55e" : "#4b5563",
                        boxShadow: ready ? "0 0 8px rgba(34, 197, 94, 0.6)" : "none",
                      }}
                    />
                    <span style={styles.playerName}>
                      {player.id === myPlayerId ? `${player.name} (you)` : player.name}
                    </span>
                  </div>
                  <span
                    style={{
                      ...styles.readyLabel,
                      color: ready ? "#4ade80" : "#6b7280",
                    }}
                  >
                    {ready ? "Ready" : "Writing..."}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLAY PHASE
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div style={styles.playContainer}>
      {/* Play phase header */}
      <div style={styles.playHeader}>
        <h1 style={styles.playTitle}>🎯 Truth or Dare</h1>
        <p style={styles.playSubtitle}>Let the games begin</p>
      </div>

      {/* Spinning Wheel */}
      {!currentPrompt && (
        <div style={styles.wheelContainer}>
          <div style={styles.wheel}>
            {players.map((player, index) => {
              const isHighlighted = isSpinning && spinHighlightIndex === index;
              const isSelected = !isSpinning && selectedPlayer === player.id;
              return (
                <div
                  key={player.id}
                  style={{
                    ...styles.wheelSlice,
                    ...(isHighlighted ? styles.wheelSliceHighlighted : {}),
                    ...(isSelected ? styles.wheelSliceSelected : {}),
                    animation: isHighlighted
                      ? "tod-spin-highlight 0.3s ease-in-out"
                      : isSelected
                        ? "tod-spotlight 1.5s ease-in-out infinite"
                        : "none",
                  }}
                >
                  <span style={{
                    ...styles.wheelPlayerName,
                    ...(isHighlighted ? styles.wheelPlayerNameHighlighted : {}),
                    ...(isSelected ? styles.wheelPlayerNameSelected : {}),
                  }}>
                    {isSelected ? `🎉 ${player.name}` : player.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Spin / Choice UI */}
          {!isSpinning && !selectedPlayer && isHost && (
            <button
              onClick={handleSpinWheel}
              style={styles.spinButton}
            >
              🎰 Spin the Wheel
            </button>
          )}

          {!isSpinning && !selectedPlayer && !isHost && (
            <p style={styles.waitingText}>⏳ Waiting for host to spin...</p>
          )}

          {/* Selected player spotlight */}
          {!isSpinning && selectedPlayer && !currentCategory && (
            <div style={styles.choiceSection}>
              <div style={styles.spotlightCard}>
                <p style={styles.spotlightEmoji}>🎯</p>
                <p style={styles.spotlightName}>
                  {selectedPlayer === myPlayerId
                    ? "You've been selected!"
                    : `${selectedPlayerName || "A player"} was selected!`}
                </p>
              </div>

              {noPromptsMessage && (
                <div style={styles.warningCard}>
                  <div style={styles.warningIcon}>⚠️</div>
                  <p style={styles.warningText}>{noPromptsMessage}</p>
                </div>
              )}

              {selectedPlayer === myPlayerId ? (
                <div style={styles.choiceRow}>
                  <button
                    onClick={() => handleChoiceSelected("truth")}
                    style={styles.truthChoiceButton}
                  >
                    <span style={styles.choiceBtnEmoji}>🔮</span>
                    <span style={styles.choiceBtnLabel}>Truth</span>
                  </button>
                  <button
                    onClick={() => handleChoiceSelected("dare")}
                    style={styles.dareChoiceButton}
                  >
                    <span style={styles.choiceBtnEmoji}>🔥</span>
                    <span style={styles.choiceBtnLabel}>Dare</span>
                  </button>
                </div>
              ) : (
                <p style={styles.waitingText}>
                  ⏳ Waiting for {selectedPlayerName || "player"} to choose...
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prompt Display */}
      {currentPrompt && (
        <div style={styles.promptCard}>
          <p style={styles.promptPlayerLabel}>
            🎤 {revealedPlayerName || selectedPlayerName || "Player"}
          </p>
          <div
            style={{
              ...styles.promptCategoryBadge,
              background:
                currentCategory === "truth"
                  ? "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)"
                  : "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
              boxShadow:
                currentCategory === "truth"
                  ? "0 4px 20px rgba(99, 102, 241, 0.5)"
                  : "0 4px 20px rgba(249, 115, 22, 0.5)",
            }}
          >
            {currentCategory === "truth" ? "🔮 TRUTH" : "🔥 DARE"}
          </div>
          <div style={styles.promptTextCard}>
            <p style={styles.promptTextDisplay}>{currentPrompt.text}</p>
          </div>
        </div>
      )}

      {/* Host controls */}
      {isHost && currentPrompt && (
        <div style={styles.hostControls}>
          <button onClick={handleNextTurn} style={styles.nextButton}>
            ➡️ Next Turn
          </button>
        </div>
      )}

      {/* End Game — always visible to host in play phase */}
      {isHost && (
        <div style={styles.endGameRow}>
          <button onClick={handleEndGame} style={styles.endGameButton}>
            🛑 End Game
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── STYLES ─────────────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  // ─── SUBMISSION PHASE ──────────────────────────────────────────
  submissionContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px",
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0f0c29 0%, #1a1a2e 30%, #16213e 60%, #0f3460 100%)",
    gap: "22px",
    maxWidth: "500px",
    margin: "0 auto",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    textAlign: "center",
    marginBottom: "4px",
    animation: "tod-fadeInUp 0.5s ease-out",
  },
  title: {
    fontSize: "2.2rem",
    fontWeight: 800,
    color: "#ffffff",
    margin: 0,
    letterSpacing: "-0.03em",
    background: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 50%, #c4b5fd 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    textShadow: "none",
    filter: "drop-shadow(0 2px 8px rgba(99, 102, 241, 0.3))",
  },
  subtitle: {
    fontSize: "1.05rem",
    color: "#94a3b8",
    margin: "8px 0 0 0",
    fontWeight: 400,
    letterSpacing: "0.01em",
  },
  card: {
    width: "100%",
    padding: "24px",
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    borderRadius: "20px",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    animation: "tod-fadeInUp 0.6s ease-out",
  },
  inputWrapper: {
    position: "relative",
    width: "100%",
    marginBottom: "18px",
  },
  textarea: {
    width: "100%",
    minHeight: "120px",
    padding: "18px 18px 32px 18px",
    fontSize: "1.1rem",
    color: "#f1f5f9",
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    border: "2px solid rgba(99, 102, 241, 0.2)",
    borderRadius: "14px",
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
    lineHeight: 1.6,
    transition: "border-color 0.25s ease, box-shadow 0.25s ease",
    outline: "none",
  },
  charCount: {
    position: "absolute",
    bottom: "14px",
    right: "16px",
    fontSize: "0.75rem",
    color: "#64748b",
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', monospace",
  },
  toggleRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "18px",
  },
  togglePill: {
    flex: 1,
    minHeight: "52px",
    padding: "14px 16px",
    fontSize: "1.05rem",
    fontWeight: 700,
    borderRadius: "14px",
    border: "2px solid transparent",
    cursor: "pointer",
    transition: "all 0.25s ease",
    letterSpacing: "0.01em",
  },
  truthPillActive: {
    color: "#ffffff",
    background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)",
    borderColor: "transparent",
    boxShadow: "0 4px 20px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
  },
  darePillActive: {
    color: "#ffffff",
    background: "linear-gradient(135deg, #ea580c 0%, #f97316 50%, #ef4444 100%)",
    borderColor: "transparent",
    boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
  },
  pillInactive: {
    color: "#94a3b8",
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderColor: "rgba(148, 163, 184, 0.15)",
  },
  submitButton: {
    width: "100%",
    minHeight: "54px",
    padding: "16px 24px",
    fontSize: "1.1rem",
    fontWeight: 700,
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 6px 24px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease",
    letterSpacing: "0.02em",
  },
  submittedBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontSize: "0.95rem",
    color: "#4ade80",
    textAlign: "center",
    marginTop: "14px",
    fontWeight: 600,
    padding: "10px 18px",
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    borderRadius: "10px",
    border: "1px solid rgba(34, 197, 94, 0.2)",
  },
  submittedBadgeIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    fontSize: "0.75rem",
    fontWeight: 800,
    color: "#4ade80",
  },
  encouragementBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "0.9rem",
    color: "#fbbf24",
    fontWeight: 500,
    padding: "10px 16px",
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    borderRadius: "10px",
    border: "1px solid rgba(251, 191, 36, 0.15)",
  },
  readySection: {
    width: "100%",
    animation: "tod-fadeInUp 0.7s ease-out",
  },
  readyButton: {
    width: "100%",
    minHeight: "60px",
    padding: "18px 24px",
    fontSize: "1.2rem",
    fontWeight: 800,
    borderRadius: "16px",
    border: "none",
    background: "linear-gradient(135deg, #059669 0%, #22c55e 50%, #4ade80 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 6px 28px rgba(34, 197, 94, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease",
    letterSpacing: "0.02em",
  },
  playersCard: {
    width: "100%",
    padding: "20px",
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    backdropFilter: "blur(8px)",
    animation: "tod-fadeInUp 0.8s ease-out",
  },
  playersSectionTitle: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#94a3b8",
    marginBottom: "14px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    margin: "0 0 14px 0",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  playerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: "12px",
    border: "1px solid rgba(148, 163, 184, 0.06)",
    transition: "background-color 0.2s ease",
  },
  playerRowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  readyDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    transition: "background-color 0.3s ease, box-shadow 0.3s ease",
  },
  playerName: {
    fontSize: "0.95rem",
    color: "#e2e8f0",
    fontWeight: 500,
  },
  readyLabel: {
    fontSize: "0.8rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
  },

  // ─── PLAY PHASE ────────────────────────────────────────────────
  playContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px",
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 40%, #312e81 75%, #1e1b4b 100%)",
    gap: "24px",
    maxWidth: "500px",
    margin: "0 auto",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  playHeader: {
    textAlign: "center",
    animation: "tod-fadeInUp 0.4s ease-out",
  },
  playTitle: {
    fontSize: "2rem",
    fontWeight: 800,
    color: "#ffffff",
    margin: 0,
    background: "linear-gradient(135deg, #e0e7ff 0%, #c4b5fd 50%, #a78bfa 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    filter: "drop-shadow(0 2px 8px rgba(139, 92, 246, 0.3))",
  },
  playSubtitle: {
    fontSize: "0.95rem",
    color: "#818cf8",
    margin: "6px 0 0 0",
    fontWeight: 400,
    fontStyle: "italic",
  },
  wheelContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    animation: "tod-fadeInUp 0.5s ease-out",
  },
  wheel: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    padding: "16px",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: "18px",
    overflow: "hidden",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  },
  wheelSlice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px 18px",
    borderRadius: "10px",
    backgroundColor: "rgba(51, 65, 85, 0.4)",
    transition: "all 0.12s ease",
    border: "1px solid rgba(148, 163, 184, 0.05)",
  },
  wheelSliceHighlighted: {
    backgroundColor: "rgba(99, 102, 241, 0.8)",
    transform: "scale(1.06)",
    border: "1px solid rgba(129, 140, 248, 0.7)",
  },
  wheelSliceSelected: {
    backgroundColor: "rgba(139, 92, 246, 0.7)",
    transform: "scale(1.08)",
    border: "2px solid rgba(167, 139, 250, 0.8)",
  },
  wheelPlayerName: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#cbd5e1",
    transition: "all 0.12s ease",
  },
  wheelPlayerNameHighlighted: {
    color: "#ffffff",
    fontSize: "1.1rem",
    fontWeight: 700,
    textShadow: "0 0 8px rgba(255, 255, 255, 0.5)",
  },
  wheelPlayerNameSelected: {
    color: "#ffffff",
    fontSize: "1.2rem",
    fontWeight: 800,
    textShadow: "0 0 12px rgba(255, 255, 255, 0.6)",
  },
  spinButton: {
    minWidth: "200px",
    minHeight: "56px",
    padding: "16px 40px",
    fontSize: "1.15rem",
    fontWeight: 700,
    borderRadius: "16px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 8px 32px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease",
    letterSpacing: "0.02em",
    animation: "tod-pulse 2s ease-in-out infinite",
  },
  waitingText: {
    fontSize: "0.95rem",
    color: "#94a3b8",
    fontStyle: "italic",
    textAlign: "center",
    padding: "8px 0",
  },
  choiceSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "18px",
    width: "100%",
    animation: "tod-scaleIn 0.4s ease-out",
  },
  spotlightCard: {
    width: "100%",
    padding: "28px 20px",
    background: "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)",
    borderRadius: "18px",
    border: "1px solid rgba(139, 92, 246, 0.3)",
    textAlign: "center",
    animation: "tod-spotlight 2s ease-in-out infinite",
  },
  spotlightEmoji: {
    fontSize: "2.5rem",
    margin: "0 0 8px 0",
    animation: "tod-bounceIn 0.5s ease-out",
  },
  spotlightName: {
    fontSize: "1.5rem",
    fontWeight: 800,
    color: "#ffffff",
    margin: 0,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
  },
  warningCard: {
    width: "100%",
    padding: "14px 18px",
    background: "linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)",
    borderRadius: "12px",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    animation: "tod-fadeInUp 0.3s ease-out",
  },
  warningIcon: {
    fontSize: "1.2rem",
    flexShrink: 0,
  },
  warningText: {
    color: "#fbbf24",
    margin: 0,
    fontSize: "0.9rem",
    fontWeight: 500,
    lineHeight: 1.4,
  },
  choiceRow: {
    display: "flex",
    gap: "14px",
    width: "100%",
  },
  truthChoiceButton: {
    flex: 1,
    minHeight: "80px",
    padding: "18px 24px",
    fontSize: "1.1rem",
    fontWeight: 800,
    borderRadius: "16px",
    border: "none",
    background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #3b82f6 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 8px 28px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
  },
  dareChoiceButton: {
    flex: 1,
    minHeight: "80px",
    padding: "18px 24px",
    fontSize: "1.1rem",
    fontWeight: 800,
    borderRadius: "16px",
    border: "none",
    background: "linear-gradient(135deg, #ea580c 0%, #f97316 50%, #ef4444 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 8px 28px rgba(239, 68, 68, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
  },
  choiceBtnEmoji: {
    fontSize: "1.6rem",
    lineHeight: 1,
  },
  choiceBtnLabel: {
    fontSize: "1.1rem",
    fontWeight: 800,
    letterSpacing: "0.02em",
  },
  promptCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "18px",
    width: "100%",
    padding: "32px 24px",
    background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(51, 65, 85, 0.7) 100%)",
    borderRadius: "22px",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4), 0 0 60px rgba(139, 92, 246, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(12px)",
    animation: "tod-scaleIn 0.4s ease-out",
  },
  promptPlayerLabel: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#a5b4fc",
    margin: 0,
    letterSpacing: "0.01em",
  },
  promptCategoryBadge: {
    padding: "8px 24px",
    borderRadius: "24px",
    fontSize: "0.85rem",
    fontWeight: 800,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
  },
  promptTextCard: {
    width: "100%",
    padding: "20px 16px",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: "14px",
    border: "1px solid rgba(148, 163, 184, 0.08)",
  },
  promptTextDisplay: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: "#f1f5f9",
    textAlign: "center",
    margin: 0,
    lineHeight: 1.5,
  },
  hostControls: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
    maxWidth: "420px",
    animation: "tod-fadeInUp 0.4s ease-out",
  },
  nextButton: {
    width: "100%",
    minHeight: "54px",
    padding: "16px 24px",
    fontSize: "1.1rem",
    fontWeight: 700,
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 6px 24px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease",
    letterSpacing: "0.02em",
  },
  endGameRow: {
    width: "100%",
    maxWidth: "420px",
    marginTop: "8px",
  },
  endGameButton: {
    width: "100%",
    minHeight: "46px",
    padding: "12px 24px",
    fontSize: "0.9rem",
    fontWeight: 600,
    borderRadius: "12px",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    color: "#f87171",
    cursor: "pointer",
    transition: "background-color 0.2s ease, border-color 0.2s ease",
    letterSpacing: "0.01em",
  },
};

export default TruthOrDareGame;
