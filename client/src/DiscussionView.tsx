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
  const { players, myPlayer, voteHistory, round } = useGameStore();
  const [timeLeft, setTimeLeft] = useState(120);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const livingPlayers: Player[] = players.filter((p) => p.isAlive);

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
          onClick={() => socket.emit("gameEvent", { type: "skipDiscussion", data: {} })}
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
