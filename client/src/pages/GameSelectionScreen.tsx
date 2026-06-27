import React, { useState } from "react";
import { usePlatformStore, selectGame } from "../store/platformStore";
import { GameModuleConfig } from "../store/types";

export function GameSelectionScreen(): React.JSX.Element {
  const { players, availableGames, roomCode, myPlayer } = usePlatformStore();
  const [copied, setCopied] = useState(false);

  const isHost = myPlayer?.isHost ?? false;
  const playerCount = players.length;

  function handleCopyRoomCode() {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  function handleSelectGame(gameId: string) {
    if (isHost) {
      selectGame(gameId);
    }
  }

  function getPlayersNeeded(game: GameModuleConfig): number {
    return Math.max(0, game.minPlayers - playerCount);
  }

  function isGameAvailable(game: GameModuleConfig): boolean {
    return playerCount >= game.minPlayers;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Game Selection</h1>
        <button
          onClick={handleCopyRoomCode}
          style={styles.roomCodeButton}
          aria-label={`Copy room code ${roomCode}`}
        >
          <span style={styles.roomCodeLabel}>Room</span>
          <span style={styles.roomCodeValue}>{roomCode}</span>
          <span style={styles.copyIndicator}>{copied ? "✓" : "📋"}</span>
        </button>
      </div>

      {/* Player List */}
      <div style={styles.playerSection}>
        <h2 style={styles.sectionHeading}>
          Players ({playerCount})
        </h2>
        <ul style={styles.playerList}>
          {players.map((player) => (
            <li key={player.id} style={styles.playerItem}>
              <div style={styles.playerInfo}>
                <div
                  style={{
                    ...styles.playerDot,
                    backgroundColor: player.color ?? "#666",
                    opacity: player.isConnected ? 1 : 0.4,
                  }}
                />
                <span
                  style={{
                    ...styles.playerName,
                    opacity: player.isConnected ? 1 : 0.5,
                  }}
                >
                  {player.name}
                </span>
                {player.isHost && <span style={styles.hostBadge}>👑</span>}
              </div>
              {!player.isConnected && (
                <span style={styles.disconnectedLabel}>Disconnected</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Game Cards */}
      <div style={styles.gamesSection}>
        <h2 style={styles.sectionHeading}>Available Games</h2>
        {!isHost && (
          <p style={styles.waitingText}>Waiting for host to select...</p>
        )}
        <div style={styles.gameGrid}>
          {availableGames.map((game) => {
            const available = isGameAvailable(game);
            const needed = getPlayersNeeded(game);

            return (
              <button
                key={game.id}
                onClick={() => available && handleSelectGame(game.id)}
                disabled={!isHost || !available}
                style={{
                  ...styles.gameCard,
                  ...(available ? styles.gameCardAvailable : styles.gameCardUnavailable),
                  ...(isHost && available ? styles.gameCardClickable : {}),
                }}
                aria-label={`${game.name}. ${game.minPlayers} to ${game.maxPlayers} players. ${
                  available ? "Available" : `Need ${needed} more players`
                }`}
              >
                <h3 style={{
                  ...styles.gameName,
                  color: available
                    ? "var(--text-primary, #f5f5f5)"
                    : "var(--text-secondary, #b0b0b0)",
                }}>
                  {game.name}
                </h3>
                <p style={{
                  ...styles.gameDescription,
                  color: available
                    ? "var(--text-secondary, #b0b0b0)"
                    : "var(--text-secondary, #666)",
                }}>
                  {game.description}
                </p>
                <div style={styles.gameFooter}>
                  <span style={{
                    ...styles.playerRange,
                    color: available
                      ? "var(--accent, #6c63ff)"
                      : "var(--text-secondary, #666)",
                  }}>
                    {game.minPlayers}–{game.maxPlayers} players
                  </span>
                  {!available && (
                    <span style={styles.needMoreBadge}>
                      Need {needed} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    minHeight: "100vh",
    gap: "24px",
    maxWidth: "600px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "var(--text-primary, #f5f5f5)",
    margin: 0,
  },
  roomCodeButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    minHeight: "44px",
    minWidth: "44px",
    backgroundColor: "var(--bg-secondary, #2d2d2d)",
    border: "1px solid var(--border, #3d3d3d)",
    borderRadius: "8px",
    cursor: "pointer",
    color: "var(--text-primary, #f5f5f5)",
    fontSize: "14px",
  },
  roomCodeLabel: {
    color: "var(--text-secondary, #b0b0b0)",
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  roomCodeValue: {
    fontWeight: "bold",
    fontSize: "16px",
    letterSpacing: "2px",
    color: "var(--accent, #6c63ff)",
  },
  copyIndicator: {
    fontSize: "14px",
  },
  playerSection: {
    width: "100%",
  },
  sectionHeading: {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--text-primary, #f5f5f5)",
    marginBottom: "12px",
    margin: "0 0 12px 0",
  },
  playerList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  playerItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    backgroundColor: "var(--bg-secondary, #2d2d2d)",
    borderRadius: "8px",
    minHeight: "36px",
    gap: "8px",
  },
  playerInfo: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  playerDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  playerName: {
    fontSize: "14px",
    color: "var(--text-primary, #f5f5f5)",
  },
  hostBadge: {
    fontSize: "14px",
  },
  disconnectedLabel: {
    fontSize: "11px",
    color: "var(--danger, #ff4757)",
    fontStyle: "italic",
  },
  gamesSection: {
    width: "100%",
    flex: 1,
  },
  waitingText: {
    fontSize: "14px",
    color: "var(--text-secondary, #b0b0b0)",
    marginBottom: "12px",
    margin: "0 0 12px 0",
    fontStyle: "italic",
  },
  gameGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  gameCard: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid var(--border, #3d3d3d)",
    textAlign: "left",
    width: "100%",
    minHeight: "44px",
    fontSize: "inherit",
    fontFamily: "inherit",
    transition: "border-color 0.2s, opacity 0.2s",
  },
  gameCardAvailable: {
    backgroundColor: "var(--bg-secondary, #2d2d2d)",
    opacity: 1,
  },
  gameCardUnavailable: {
    backgroundColor: "var(--bg-secondary, #2d2d2d)",
    opacity: 0.5,
    cursor: "not-allowed",
  },
  gameCardClickable: {
    cursor: "pointer",
    borderColor: "var(--accent, #6c63ff)",
  },
  gameName: {
    fontSize: "18px",
    fontWeight: "bold",
    margin: 0,
  },
  gameDescription: {
    fontSize: "14px",
    lineHeight: "1.4",
    margin: 0,
  },
  gameFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "4px",
  },
  playerRange: {
    fontSize: "13px",
    fontWeight: 600,
  },
  needMoreBadge: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--warning, #ffa502)",
    backgroundColor: "rgba(255, 165, 2, 0.1)",
    padding: "2px 8px",
    borderRadius: "4px",
  },
};
