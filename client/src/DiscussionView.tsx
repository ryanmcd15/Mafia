import { useEffect, useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Player } from "./types";

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function DiscussionView(): React.JSX.Element {
  const { players, myPlayer, roomCode, voteHistory, accusationResults, round } = useGameStore();
  const [timeLeft, setTimeLeft] = useState(120);
  const [accusationTarget, setAccusationTarget] = useState<string | null>(null);
  const [accusationSubmitted, setAccusationSubmitted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const livingPlayers: Player[] = players.filter((p) => p.isAlive);
  const accusationTargets: Player[] = players.filter(
    (p) => p.isAlive && p.id !== myPlayer?.id
  );

  function handleSubmitAccusation() {
    if (!accusationTarget) return;
    socket.emit("submitAccusation", { roomCode, targetId: accusationTarget });
    setAccusationSubmitted(true);
  }

  return (
    <div style={styles.container}>
      {/* Round indicator */}
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "2px" }}>
        Day {round}
      </p>

      {/* Countdown Timer */}
      <div aria-label="Discussion time remaining" style={styles.timer}>
        {formatTime(timeLeft)}
      </div>

      {/* Anonymous Accusation Section */}
      {myPlayer?.isAlive && !accusationSubmitted && !accusationResults && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Who do you suspect?</h2>
          <p style={styles.sectionSubtext}>Anonymous — no one will know who accused whom</p>
          <ul style={styles.list}>
            {accusationTargets.map((player) => (
              <li key={player.id} style={{ marginBottom: "8px" }}>
                <button
                  onClick={() => setAccusationTarget(player.id)}
                  style={{
                    ...styles.selectButton,
                    ...(accusationTarget === player.id ? styles.selectButtonActive : {}),
                  }}
                >
                  {player.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={handleSubmitAccusation}
            disabled={!accusationTarget}
            style={{
              ...styles.submitButton,
              opacity: accusationTarget ? 1 : 0.5,
              cursor: accusationTarget ? "pointer" : "not-allowed",
            }}
          >
            Submit Suspicion
          </button>
        </div>
      )}

      {/* Accusation submitted waiting */}
      {accusationSubmitted && !accusationResults && (
        <div style={styles.section}>
          <p style={styles.waitingText}>Suspicion submitted. Waiting for others...</p>
        </div>
      )}

      {/* Accusation Results */}
      {accusationResults && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Suspicion Results</h2>
          <ul style={styles.list}>
            {Object.entries(accusationResults)
              .sort(([, a], [, b]) => b - a)
              .map(([name, count]) => (
                <li key={name} style={styles.resultRow}>
                  <span style={styles.resultName}>{name}</span>
                  <span style={styles.resultCount}>
                    {count} {count === 1 ? "suspect" : "suspects"}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Living Players List */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Living Players</h2>
        <ul style={styles.list}>
          {livingPlayers.map((player) => (
            <li key={player.id} style={styles.playerRow}>
              {player.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Vote History */}
      {voteHistory.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Vote History</h2>
          {voteHistory.map((round) => (
            <div key={round.round} style={styles.historyRound}>
              <p style={styles.roundLabel}>Round {round.round}</p>
              <ul style={styles.list}>
                {Object.entries(round.votes).map(([voter, target]) => (
                  <li key={voter} style={styles.historyRow}>
                    <span style={styles.historyVoter}>{voter}</span>
                    <span style={styles.historyArrow}>→</span>
                    <span
                      style={{
                        ...styles.historyTarget,
                        color: target === "Skip" ? "var(--text-secondary)" : "var(--accent)",
                      }}
                    >
                      {target}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Skip to Vote button — Host only */}
      {myPlayer?.isHost && (
        <button
          onClick={() => socket.emit("skipDiscussion", { roomCode })}
          style={styles.skipButton}
        >
          Skip to Vote
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    minHeight: "100vh",
    backgroundColor: "var(--bg-primary)",
    gap: "24px",
  },
  timer: {
    fontSize: "3rem",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: "var(--text-primary)",
  },
  section: {
    width: "100%",
    maxWidth: "480px",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  sectionSubtext: {
    fontSize: "0.8rem",
    color: "var(--text-secondary)",
    marginBottom: "12px",
    fontStyle: "italic",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  playerRow: {
    padding: "12px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "8px",
    marginBottom: "8px",
    color: "var(--text-primary)",
    fontSize: "1rem",
  },
  selectButton: {
    width: "100%",
    minHeight: "44px",
    padding: "12px 16px",
    fontSize: "1rem",
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-secondary)",
    border: "2px solid transparent",
    borderRadius: "8px",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "border-color 0.15s, background-color 0.15s",
  },
  selectButtonActive: {
    borderColor: "var(--accent)",
    backgroundColor: "var(--bg-tertiary)",
  },
  submitButton: {
    width: "100%",
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--accent)",
    color: "#fff",
    marginTop: "12px",
  },
  waitingText: {
    color: "var(--text-secondary)",
    fontStyle: "italic",
    textAlign: "center" as const,
  },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "8px",
    marginBottom: "8px",
  },
  resultName: {
    fontSize: "1rem",
    color: "var(--text-primary)",
    fontWeight: 600,
  },
  resultCount: {
    fontSize: "0.875rem",
    color: "var(--accent)",
    fontWeight: 600,
  },
  historyRound: {
    marginBottom: "16px",
  },
  roundLabel: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "var(--accent)",
    marginBottom: "6px",
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "8px",
    marginBottom: "4px",
    fontSize: "0.875rem",
  },
  historyVoter: {
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  historyArrow: {
    color: "var(--text-secondary)",
  },
  historyTarget: {
    fontWeight: 600,
  },
  skipButton: {
    minWidth: "44px",
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    backgroundColor: "var(--accent)",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
};
