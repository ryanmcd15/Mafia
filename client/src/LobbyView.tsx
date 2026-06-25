import React from "react";
import { useGameStore } from "./store";
import socket from "./socket";

export function LobbyView(): React.JSX.Element {
  const { roomCode, players, myPlayer } = useGameStore();

  const isHost = myPlayer?.isHost ?? false;
  const canStart = players.length >= 4;

  function handleStartGame() {
    if (canStart && roomCode) {
      socket.emit("startGame", { roomCode });
    }
  }

  return (
    <div style={styles.container}>
      {/* Room Code Display */}
      <div style={styles.roomCodeSection}>
        <p style={styles.roomCodeLabel}>Room Code</p>
        <h1 style={styles.roomCode}>{roomCode}</h1>
      </div>

      {/* Player List */}
      <div style={styles.playerSection}>
        <h2 style={styles.playerHeading}>
          Players ({players.length})
        </h2>
        <ul style={styles.playerList}>
          {players.map((player) => (
            <li key={player.id} style={styles.playerItem}>
              <span style={styles.playerName}>{player.name}</span>
              {player.isHost && (
                <span style={styles.hostBadge}>👑 Host</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Start Game Button (Host only) */}
      {isHost && (
        <div style={styles.startSection}>
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            style={{
              ...styles.startButton,
              ...(canStart ? styles.startButtonEnabled : styles.startButtonDisabled),
            }}
            aria-disabled={!canStart}
          >
            Start Game
          </button>
          {!canStart && (
            <p style={styles.helperText}>
              Need at least 4 players to start
            </p>
          )}
        </div>
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
    gap: "24px",
  },
  roomCodeSection: {
    textAlign: "center",
    marginTop: "16px",
  },
  roomCodeLabel: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    marginBottom: "4px",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  roomCode: {
    fontSize: "48px",
    fontWeight: "bold",
    color: "var(--accent)",
    letterSpacing: "6px",
    margin: 0,
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
  hostBadge: {
    fontSize: "14px",
    color: "var(--warning, #ffa502)",
  },
  startSection: {
    width: "100%",
    maxWidth: "400px",
    marginTop: "auto",
    paddingBottom: "24px",
    textAlign: "center",
  },
  startButton: {
    width: "100%",
    minHeight: "44px",
    minWidth: "44px",
    padding: "14px 24px",
    fontSize: "18px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  startButtonEnabled: {
    backgroundColor: "var(--accent)",
    color: "var(--text-primary)",
    cursor: "pointer",
  },
  startButtonDisabled: {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    cursor: "not-allowed",
    opacity: 0.7,
  },
  helperText: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    marginTop: "8px",
  },
};
