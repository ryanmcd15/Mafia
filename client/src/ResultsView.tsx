import React from "react";
import { useGameStore } from "./store";
import type { Player } from "./types";

export function ResultsView(): React.JSX.Element {
  const { voteResult, players } = useGameStore();

  // Not yet received
  if (!voteResult) {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <p style={styles.tieLabel}>Tallying votes...</p>
        </div>
        <style>{resultsKeyframes}</style>
      </div>
    );
  }

  // Tie scenario
  if (voteResult?.isTie) {
    const tiedNames = voteResult.tiedPlayers
      .map((id) => players.find((p) => p.id === id)?.name ?? "Unknown")
      .join(", ");

    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <p style={styles.tieLabel}>No one was eliminated</p>
          <p style={styles.tieSubtext}>The vote was tied</p>
          <p style={styles.tiedNames}>{tiedNames}</p>
        </div>
        <style>{resultsKeyframes}</style>
      </div>
    );
  }

  // Elimination scenario
  const eliminatedPlayer: Player | undefined = voteResult?.eliminatedPlayerId
    ? players.find((p) => p.id === voteResult.eliminatedPlayerId)
    : undefined;

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {eliminatedPlayer ? (
          <>
            <p style={styles.eliminatedLabel}>Eliminated</p>
            <h1 style={styles.playerName}>{eliminatedPlayer.name}</h1>
            <p style={styles.roleBadge}>
              {eliminatedPlayer.role ?? "Unknown"}
            </p>
          </>
        ) : (
          <p style={styles.tieLabel}>No one was eliminated</p>
        )}
      </div>
      <style>{resultsKeyframes}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--bg-primary)",
    zIndex: 1000,
    animation: "shakeIn 0.5s ease-out",
  },
  content: {
    textAlign: "center",
    padding: "24px",
    animation: "scaleReveal 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
    transform: "scale(0)",
  },
  eliminatedLabel: {
    fontSize: "14px",
    textTransform: "uppercase",
    letterSpacing: "3px",
    color: "var(--danger)",
    marginBottom: "12px",
  },
  playerName: {
    fontSize: "clamp(36px, 10vw, 64px)",
    fontWeight: "bold",
    color: "var(--text-primary)",
    margin: "0 0 16px 0",
    lineHeight: 1.1,
  },
  roleBadge: {
    fontSize: "20px",
    color: "var(--accent)",
    fontWeight: 600,
    textTransform: "capitalize",
  },
  tieLabel: {
    fontSize: "clamp(24px, 7vw, 42px)",
    fontWeight: "bold",
    color: "var(--text-primary)",
    marginBottom: "8px",
    lineHeight: 1.2,
  },
  tieSubtext: {
    fontSize: "18px",
    color: "var(--text-secondary)",
    marginBottom: "16px",
  },
  tiedNames: {
    fontSize: "16px",
    color: "var(--accent)",
    fontStyle: "italic",
  },
};

const resultsKeyframes = `
@keyframes scaleReveal {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes shakeIn {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-4px); }
  30% { transform: translateX(4px); }
  45% { transform: translateX(-3px); }
  60% { transform: translateX(3px); }
  75% { transform: translateX(-1px); }
  90% { transform: translateX(1px); }
}
`;
