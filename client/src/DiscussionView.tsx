import { useEffect, useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Player } from "./types";

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

// Color for avatar circles based on player index
const avatarColors = [
  "#6c63ff", "#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3",
  "#54a0ff", "#5f27cd", "#01a3a4", "#f368e0", "#ee5a24",
];

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

  // Timer color transitions: white → yellow → red
  const timerColor =
    timeLeft <= 10
      ? "#ff4757"
      : timeLeft <= 30
        ? "#ffa502"
        : "var(--text-primary)";

  const timerGlow =
    timeLeft <= 10
      ? "0 0 20px rgba(255, 71, 87, 0.4)"
      : timeLeft <= 30
        ? "0 0 12px rgba(255, 165, 2, 0.2)"
        : "none";

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <p style={styles.roundBadge}>Day {round}</p>
        <h1 style={styles.title}>💬 Discussion Time</h1>
        <p style={styles.subtitle}>Talk it out — who seems suspicious?</p>
      </div>

      {/* Countdown Timer */}
      <div
        aria-label="Discussion time remaining"
        style={{
          ...styles.timer,
          color: timerColor,
          textShadow: timerGlow !== "none" ? timerGlow : undefined,
        }}
      >
        {formatTime(timeLeft)}
      </div>

      {/* Living Players List */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Living Players</h2>
        <ul style={styles.list}>
          {livingPlayers.map((player, index) => (
            <li key={player.id} style={styles.playerCard}>
              <div
                style={{
                  ...styles.avatar,
                  backgroundColor: avatarColors[index % avatarColors.length],
                }}
                aria-hidden="true"
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              <span style={styles.playerName}>{player.name}</span>
              {player.id === myPlayer?.id && (
                <span style={styles.youBadge}>You</span>
              )}
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
          ⚖️ Skip to Vote
        </button>
      )}

      <style>{discussionKeyframes}</style>
    </div>
  );
}

const discussionKeyframes = `
@keyframes borderGlow {
  0%, 100% { border-color: rgba(108, 99, 255, 0.2); }
  50% { border-color: rgba(108, 99, 255, 0.4); }
}
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    minHeight: "100vh",
    background: "linear-gradient(180deg, #1a1a1a 0%, #1e1e2e 100%)",
    gap: "24px",
  },
  header: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
  },
  roundBadge: {
    fontSize: "12px",
    color: "var(--accent)",
    textTransform: "uppercase",
    letterSpacing: "2px",
    fontWeight: 600,
    backgroundColor: "rgba(108, 99, 255, 0.1)",
    padding: "4px 12px",
    borderRadius: "12px",
    marginBottom: "4px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  },
  subtitle: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    marginTop: "4px",
  },
  timer: {
    fontSize: "4rem",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    transition: "color 0.5s ease, text-shadow 0.5s ease",
  },
  section: {
    width: "100%",
    maxWidth: "480px",
  },
  sectionTitle: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  playerCard: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "12px",
    marginBottom: "8px",
    border: "1px solid var(--bg-tertiary)",
    gap: "12px",
    transition: "border-color 0.3s",
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: 700,
    color: "#ffffff",
    flexShrink: 0,
  },
  playerName: {
    color: "var(--text-primary)",
    fontSize: "1rem",
    fontWeight: 500,
    flex: 1,
  },
  youBadge: {
    fontSize: "11px",
    color: "var(--accent)",
    backgroundColor: "rgba(108, 99, 255, 0.15)",
    padding: "2px 8px",
    borderRadius: "8px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
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
    minHeight: "48px",
    padding: "14px 32px",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#ffffff",
    backgroundColor: "var(--accent)",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(108, 99, 255, 0.3)",
    transition: "background-color 0.2s, box-shadow 0.2s",
    letterSpacing: "0.02em",
  },
};
