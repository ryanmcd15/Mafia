import React from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Role } from "./types";

export function GameOverView(): React.JSX.Element {
  const { winCondition, players, myPlayer, roomCode } = useGameStore();

  const isHost = myPlayer?.isHost ?? false;
  const isCiviliansWin = winCondition?.winner === "Civilians";

  // Show confetti only if you're on the winning side
  const myRole = myPlayer?.role;
  const isWinner = isCiviliansWin
    ? myRole !== Role.Killer  // Civilians and Medic win
    : myRole === Role.Killer; // Killer wins

  function handlePlayAgain() {
    socket.emit("replayGame", { roomCode });
  }

  return (
    <div style={styles.container}>
      {/* Confetti particles — only for winning side */}
      {isWinner && (
        <div style={styles.confettiContainer} aria-hidden="true">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.confetti,
                left: `${Math.random() * 100}%`,
                backgroundColor: isCiviliansWin
                  ? ["#2ed573", "#7bed9f", "#4ecdc4", "#45b7d1", "#96ceb4"][i % 5]
                  : ["#ff4757", "#ff6b6b", "#ffa502", "#ff6348", "#eb3b5a"][i % 5],
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}
      <style>{confettiKeyframes}</style>
      {/* Winner Announcement Banner */}
      <div
        style={{
          ...styles.banner,
          backgroundColor: isCiviliansWin
            ? "rgba(46, 213, 115, 0.15)"
            : "rgba(255, 71, 87, 0.15)",
          borderColor: isCiviliansWin
            ? "var(--success)"
            : "var(--danger)",
        }}
      >
        <h1
          style={{
            ...styles.winnerText,
            color: isCiviliansWin ? "var(--success)" : "var(--danger)",
          }}
        >
          {isCiviliansWin ? "Civilians Win!" : "Killer Wins!"}
        </h1>
        {winCondition?.reason && (
          <p style={styles.reasonText}>{winCondition.reason}</p>
        )}
      </div>

      {/* Player List with Roles Revealed */}
      <div style={styles.playerSection}>
        <h2 style={styles.playerHeading}>All Players</h2>
        <ul style={styles.playerList}>
          {players.map((player) => (
            <li
              key={player.id}
              style={{
                ...styles.playerItem,
                opacity: player.isAlive ? 1 : 0.5,
              }}
            >
              <span
                style={{
                  ...styles.playerName,
                  textDecoration: player.isAlive ? "none" : "line-through",
                }}
              >
                {player.name}
              </span>
              <span
                style={{
                  ...styles.roleBadge,
                  color: getRoleColor(player.role),
                }}
              >
                {player.role ?? "Unknown"}
                {!player.isAlive && " ☠️"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Play Again / Waiting */}
      <div style={styles.actionSection}>
        {isHost ? (
          <button onClick={handlePlayAgain} style={styles.playAgainButton}>
            Play Again
          </button>
        ) : (
          <p style={styles.waitingText}>Waiting for host...</p>
        )}
      </div>
    </div>
  );
}

function getRoleColor(role: Role | null): string {
  switch (role) {
    case Role.Killer:
      return "var(--danger)";
    case Role.Medic:
      return "var(--success)";
    case Role.Civilian:
      return "var(--text-secondary)";
    default:
      return "var(--text-secondary)";
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    minHeight: "100vh",
    gap: "24px",
  },
  banner: {
    width: "100%",
    maxWidth: "400px",
    textAlign: "center",
    padding: "24px 16px",
    borderRadius: "12px",
    border: "2px solid",
    marginTop: "16px",
  },
  winnerText: {
    fontSize: "32px",
    fontWeight: "bold",
    margin: 0,
  },
  reasonText: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    marginTop: "8px",
  },
  playerSection: {
    width: "100%",
    maxWidth: "400px",
  },
  playerHeading: {
    fontSize: "18px",
    color: "var(--text-primary)",
    marginBottom: "12px",
  },
  playerList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  playerItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "8px",
    minHeight: "44px",
  },
  playerName: {
    fontSize: "16px",
    color: "var(--text-primary)",
  },
  roleBadge: {
    fontSize: "14px",
    fontWeight: "600",
  },
  actionSection: {
    width: "100%",
    maxWidth: "400px",
    marginTop: "auto",
    paddingBottom: "24px",
    textAlign: "center",
  },
  playAgainButton: {
    width: "100%",
    minHeight: "44px",
    minWidth: "44px",
    padding: "14px 24px",
    fontSize: "18px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "var(--accent)",
    color: "var(--text-primary)",
    transition: "background-color 0.2s",
  },
  waitingText: {
    fontSize: "16px",
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
  confettiContainer: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: 0,
  },
  confetti: {
    position: "absolute",
    top: "-10px",
    width: "8px",
    height: "8px",
    borderRadius: "2px",
    animation: "confettiFall 3s ease-in forwards",
  },
};

const confettiKeyframes = `
@keyframes confettiFall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
`;
