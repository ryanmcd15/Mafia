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

  // Submission Phase
  if (phase === "submission") {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Truth or Dare</h1>
        <p style={styles.subtitle}>Submit prompts for the game</p>

        {/* Prompt input */}
        <div style={styles.section}>
          <div style={styles.inputWrapper}>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value.slice(0, 280))}
              placeholder="Enter a truth or dare prompt..."
              style={styles.textarea}
              maxLength={280}
              aria-label="Prompt text"
            />
            <span style={styles.charCount}>
              {promptText.length}/280
            </span>
          </div>

          {/* Truth/Dare toggle */}
          <div style={styles.toggleRow}>
            <button
              onClick={() => setPromptCategory("truth")}
              style={{
                ...styles.toggleButton,
                ...(promptCategory === "truth" ? styles.toggleActive : {}),
              }}
              aria-pressed={promptCategory === "truth"}
            >
              Truth
            </button>
            <button
              onClick={() => setPromptCategory("dare")}
              style={{
                ...styles.toggleButton,
                ...(promptCategory === "dare" ? styles.toggleDareActive : {}),
              }}
              aria-pressed={promptCategory === "dare"}
            >
              Dare
            </button>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmitPrompt}
            disabled={!promptText.trim()}
            style={{
              ...styles.primaryButton,
              opacity: promptText.trim() ? 1 : 0.5,
              cursor: promptText.trim() ? "pointer" : "not-allowed",
            }}
          >
            Submit Prompt
          </button>

          {submittedCount > 0 && (
            <p style={styles.submittedText}>
              {submittedCount} prompt{submittedCount !== 1 ? "s" : ""} submitted
            </p>
          )}
        </div>

        {/* Ready button */}
        <div style={styles.section}>
          <button
            onClick={handleReady}
            disabled={submittedCount < 1 || isReady}
            style={{
              ...styles.readyButton,
              opacity: submittedCount >= 1 && !isReady ? 1 : 0.5,
              cursor: submittedCount >= 1 && !isReady ? "pointer" : "not-allowed",
            }}
          >
            {isReady ? "✓ Ready!" : "I'm Ready"}
          </button>
        </div>

        {/* Player ready indicators */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Players</h2>
          <ul style={styles.list}>
            {players.map((player) => (
              <li key={player.id} style={styles.playerRow}>
                <span style={styles.playerName}>{player.name}</span>
                <span
                  style={{
                    ...styles.readyIndicator,
                    color: readyPlayers.includes(player.id)
                      ? "var(--success)"
                      : "var(--text-secondary)",
                  }}
                >
                  {readyPlayers.includes(player.id) ? "✓ Ready" : "Submitting..."}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Play Phase
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Truth or Dare</h1>

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
                  }}
                >
                  <span style={styles.wheelPlayerName}>{player.name}</span>
                </div>
              );
            })}
          </div>

          {/* Spin / Choice UI */}
          {!isSpinning && !selectedPlayer && isHost && (
            <button onClick={handleSpinWheel} style={styles.spinButton}>
              Spin the Wheel
            </button>
          )}

          {!isSpinning && !selectedPlayer && !isHost && (
            <p style={styles.waitingText}>Waiting for host to spin...</p>
          )}

          {/* Truth or Dare choice - only for selected player */}
          {!isSpinning && selectedPlayer && !currentCategory && (
            <div style={styles.choiceSection}>
              <p style={styles.selectedText}>
                {selectedPlayer === myPlayerId
                  ? "You've been selected!"
                  : `${selectedPlayerName || "A player"} was selected!`}
              </p>
              {noPromptsMessage && (
                <p style={{ color: "var(--danger, #ff4757)", textAlign: "center", marginBottom: "12px", fontSize: "0.9rem" }}>
                  {noPromptsMessage}
                </p>
              )}
              {selectedPlayer === myPlayerId ? (
                <div style={styles.choiceRow}>
                  <button
                    onClick={() => handleChoiceSelected("truth")}
                    style={styles.truthButton}
                  >
                    Truth
                  </button>
                  <button
                    onClick={() => handleChoiceSelected("dare")}
                    style={styles.dareButton}
                  >
                    Dare
                  </button>
                </div>
              ) : (
                <p style={styles.waitingText}>
                  Waiting for {selectedPlayerName || "player"} to choose...
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prompt Display */}
      {currentPrompt && (
        <div style={styles.promptDisplay}>
          <p style={styles.promptPlayerLabel}>
            {revealedPlayerName || selectedPlayerName || "Player"}
          </p>
          <div
            style={{
              ...styles.promptCategoryBadge,
              backgroundColor:
                currentCategory === "truth"
                  ? "var(--accent)"
                  : "var(--danger)",
            }}
          >
            {currentCategory === "truth" ? "TRUTH" : "DARE"}
          </div>
          <p style={styles.promptTextDisplay}>{currentPrompt.text}</p>
        </div>
      )}

      {/* Host controls */}
      {isHost && currentPrompt && (
        <div style={styles.hostControls}>
          <button onClick={handleNextTurn} style={styles.primaryButton}>
            Next
          </button>
        </div>
      )}

      {/* End Game — always visible to host in play phase */}
      {isHost && (
        <div style={{ width: "100%", maxWidth: "400px", marginTop: "16px" }}>
          <button onClick={handleEndGame} style={styles.endGameButton}>
            End Game
          </button>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    minHeight: "100vh",
    backgroundColor: "var(--bg-primary)",
    gap: "20px",
    maxWidth: "480px",
    margin: "0 auto",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  },
  subtitle: {
    fontSize: "0.875rem",
    color: "var(--text-secondary)",
    margin: 0,
  },
  section: {
    width: "100%",
  },
  sectionTitle: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  inputWrapper: {
    position: "relative",
    width: "100%",
    marginBottom: "12px",
  },
  textarea: {
    width: "100%",
    minHeight: "80px",
    padding: "12px",
    fontSize: "1rem",
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-secondary)",
    border: "2px solid var(--bg-tertiary)",
    borderRadius: "8px",
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  charCount: {
    position: "absolute",
    bottom: "8px",
    right: "12px",
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
  },
  toggleRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "12px",
  },
  toggleButton: {
    flex: 1,
    minHeight: "44px",
    padding: "10px 16px",
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-secondary)",
    border: "2px solid var(--bg-tertiary)",
    borderRadius: "8px",
    cursor: "pointer",
  },
  toggleActive: {
    color: "var(--accent)",
    borderColor: "var(--accent)",
    backgroundColor: "var(--bg-tertiary)",
  },
  toggleDareActive: {
    color: "var(--danger)",
    borderColor: "var(--danger)",
    backgroundColor: "var(--bg-tertiary)",
  },
  primaryButton: {
    width: "100%",
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
  },
  submittedText: {
    fontSize: "0.875rem",
    color: "var(--success)",
    textAlign: "center",
    marginTop: "8px",
  },
  readyButton: {
    width: "100%",
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--success)",
    color: "#fff",
    cursor: "pointer",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  playerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "8px",
    marginBottom: "8px",
  },
  playerName: {
    fontSize: "1rem",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  readyIndicator: {
    fontSize: "0.875rem",
    fontWeight: 600,
  },
  // Play phase styles
  wheelContainer: {
    width: "100%",
    maxWidth: "320px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  },
  wheel: {
    width: "100%",
    maxWidth: "300px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "12px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "12px",
    overflow: "hidden",
  },
  wheelSlice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 16px",
    borderRadius: "6px",
    backgroundColor: "var(--bg-tertiary)",
    transition: "background-color 0.1s, transform 0.1s",
  },
  wheelSliceHighlighted: {
    backgroundColor: "var(--accent)",
    transform: "scale(1.05)",
  },
  wheelSliceSelected: {
    backgroundColor: "var(--accent)",
    transform: "scale(1.08)",
    boxShadow: "0 0 12px rgba(99, 102, 241, 0.5)",
  },
  wheelPlayerName: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  spinButton: {
    minWidth: "44px",
    minHeight: "44px",
    padding: "12px 32px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
  },
  waitingText: {
    fontSize: "0.875rem",
    color: "var(--text-secondary)",
    fontStyle: "italic",
    textAlign: "center",
  },
  choiceSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  },
  selectedText: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    textAlign: "center",
  },
  choiceRow: {
    display: "flex",
    gap: "12px",
    width: "100%",
  },
  truthButton: {
    flex: 1,
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
  },
  dareButton: {
    flex: 1,
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--danger)",
    color: "#fff",
    cursor: "pointer",
  },
  promptDisplay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "24px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "12px",
  },
  promptPlayerLabel: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    margin: 0,
  },
  promptCategoryBadge: {
    padding: "4px 16px",
    borderRadius: "16px",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  promptTextDisplay: {
    fontSize: "1.25rem",
    fontWeight: 500,
    color: "var(--text-primary)",
    textAlign: "center",
    margin: 0,
    lineHeight: 1.4,
  },
  hostControls: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "100%",
  },
  endGameButton: {
    width: "100%",
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--danger)",
    color: "#fff",
    cursor: "pointer",
  },
};

export default TruthOrDareGame;
