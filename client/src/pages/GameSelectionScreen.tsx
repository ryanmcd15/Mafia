import React, { useState, useEffect } from "react";
import { usePlatformStore, selectGame } from "../store/platformStore";
import { GameModuleConfig } from "../store/types";

/* ─── CSS Keyframes (injected once) ─────────────────────────────────────── */
const KEYFRAMES_ID = "game-selection-keyframes";
function injectKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes gs-fadeInUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes gs-float1 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(12px, -18px) rotate(5deg); }
      50% { transform: translate(-8px, -30px) rotate(-3deg); }
      75% { transform: translate(15px, -12px) rotate(4deg); }
    }
    @keyframes gs-float2 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-15px, -10px) rotate(-5deg); }
      50% { transform: translate(10px, -25px) rotate(6deg); }
      75% { transform: translate(-12px, -15px) rotate(-2deg); }
    }
    @keyframes gs-float3 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(8px, -22px) rotate(3deg); }
      50% { transform: translate(-14px, -10px) rotate(-6deg); }
      75% { transform: translate(6px, -28px) rotate(2deg); }
    }
    @keyframes gs-float4 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-10px, -14px) rotate(-4deg); }
      50% { transform: translate(12px, -22px) rotate(5deg); }
      75% { transform: translate(-8px, -8px) rotate(-3deg); }
    }
    @keyframes gs-cardGlow {
      0%, 100% { box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05); }
      50% { box-shadow: 0 8px 48px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08); }
    }
    @keyframes gs-pulse-border {
      0%, 100% { border-color: rgba(99, 102, 241, 0.3); }
      50% { border-color: rgba(139, 92, 246, 0.6); }
    }
    .gs-game-card {
      transition: transform 0.2s ease, box-shadow 0.3s ease, border-color 0.3s ease;
    }
    .gs-game-card:not(:disabled):hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 12px 40px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
      border-color: rgba(139, 92, 246, 0.6) !important;
    }
    .gs-game-card:not(:disabled):active {
      transform: translateY(-1px) scale(0.97);
    }
    .gs-game-card:disabled {
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

/* ─── Game Emoji Map ─────────────────────────────────────────────────────── */
const GAME_EMOJIS: Record<string, string> = {
  mafia: "🔫",
  "truth-or-dare": "🎯",
  "two-truths-one-lie": "🤥",
  spyfall: "🕵️",
  "battle-shits": "💩",
  "guess-who": "❓",
  "fake-artist": "🎨",
};

function getGameEmoji(gameId: string): string {
  return GAME_EMOJIS[gameId] ?? "🎮";
}

/* ─── Avatar Color Palette ───────────────────────────────────────────────── */
const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6",
];

function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export function GameSelectionScreen(): React.JSX.Element {
  const { players, availableGames, roomCode, myPlayer } = usePlatformStore();
  const [copied, setCopied] = useState(false);

  const isHost = myPlayer?.isHost ?? false;
  const playerCount = players.length;

  useEffect(() => {
    injectKeyframes();
  }, []);

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
      {/* Floating decorative emojis */}
      <div style={styles.floatingEmojis} aria-hidden="true">
        <span style={{ ...styles.floatingEmoji, ...styles.float1 }}>🎲</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float2 }}>🃏</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float3 }}>🎭</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float4 }}>🕹️</span>
      </div>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>🎮 Choose Your Game</h1>
        <p style={styles.subtitle}>What are we playing?</p>
      </div>

      {/* Room Info Bar */}
      <div style={styles.roomInfoBar}>
        <button
          onClick={handleCopyRoomCode}
          style={styles.roomCodeButton}
          aria-label={`Copy room code ${roomCode}`}
        >
          <span style={styles.roomCodeLabel}>Room</span>
          <span style={styles.roomCodeValue}>{roomCode}</span>
          <span style={styles.copyIndicator}>{copied ? "✓ Copied!" : "📋"}</span>
        </button>

        {/* Player Avatars */}
        <div style={styles.playerAvatars}>
          {players.slice(0, 6).map((player, idx) => (
            <div
              key={player.id}
              title={player.name + (player.isHost ? " (Host)" : "")}
              style={{
                ...styles.avatarPill,
                backgroundColor: player.color || getAvatarColor(idx),
                opacity: player.isConnected ? 1 : 0.4,
              }}
            >
              <span style={styles.avatarInitials}>{getInitials(player.name)}</span>
              {player.isHost && <span style={styles.avatarCrown}>👑</span>}
            </div>
          ))}
          {players.length > 6 && (
            <div style={styles.avatarOverflow}>+{players.length - 6}</div>
          )}
        </div>
      </div>

      {/* Player List Section */}
      <div style={styles.playerSection}>
        <h2 style={styles.sectionHeading}>
          👥 Players ({playerCount})
        </h2>
        <ul style={styles.playerList}>
          {players.map((player, idx) => (
            <li key={player.id} style={styles.playerChip}>
              <div
                style={{
                  ...styles.playerChipAvatar,
                  backgroundColor: player.color || getAvatarColor(idx),
                  opacity: player.isConnected ? 1 : 0.5,
                }}
              >
                {getInitials(player.name)}
              </div>
              <span
                style={{
                  ...styles.playerChipName,
                  opacity: player.isConnected ? 1 : 0.5,
                }}
              >
                {player.name}
              </span>
              {player.isHost && <span style={styles.crownBadge}>👑</span>}
              {!player.isConnected && (
                <span style={styles.disconnectedDot} title="Disconnected" />
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Game Cards */}
      <div style={styles.gamesSection}>
        <h2 style={styles.sectionHeading}>🃏 Available Games</h2>
        {!isHost && (
          <p style={styles.waitingText}>
            ⏳ Waiting for host to choose...
          </p>
        )}
        <div style={styles.gameGrid}>
          {availableGames.map((game, idx) => {
            const available = isGameAvailable(game);
            const needed = getPlayersNeeded(game);

            return (
              <button
                key={game.id}
                className="gs-game-card"
                onClick={() => available && handleSelectGame(game.id)}
                disabled={!isHost || !available}
                title={game.description}
                style={{
                  ...styles.gameCard,
                  ...(available ? styles.gameCardAvailable : styles.gameCardUnavailable),
                  ...(isHost && available ? styles.gameCardClickable : {}),
                  animationDelay: `${0.1 + idx * 0.08}s`,
                }}
                aria-label={`${game.name}. ${game.minPlayers} to ${game.maxPlayers} players. ${
                  available ? "Available" : `Need ${needed} more players`
                }`}
              >
                <div style={styles.gameCardInner}>
                  <div style={{
                    ...styles.gameEmoji,
                    opacity: available ? 1 : 0.7,
                  }}>
                    {getGameEmoji(game.id)}
                  </div>
                  <h3 style={{
                    ...styles.gameName,
                    color: available ? "#e2e8f0" : "#94a3b8",
                  }}>
                    {game.name}
                  </h3>
                  <span style={{
                    ...styles.playerRangePill,
                    backgroundColor: available
                      ? "rgba(99, 102, 241, 0.15)"
                      : "rgba(100, 116, 139, 0.1)",
                    color: available ? "#a5b4fc" : "#64748b",
                    borderColor: available
                      ? "rgba(99, 102, 241, 0.3)"
                      : "rgba(100, 116, 139, 0.2)",
                  }}>
                    👥 {game.minPlayers}–{game.maxPlayers}
                  </span>
                </div>
                {!available && (
                  <div style={styles.needOverlay}>
                    Need {needed}+
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── STYLES ─────────────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0f0c29 0%, #1a1a2e 30%, #16213e 60%, #0f3460 100%)",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "36px 16px",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    gap: "24px",
  },

  // ─── FLOATING EMOJIS ─────────────────────────────────────────────
  floatingEmojis: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "none",
    overflow: "hidden",
  },
  floatingEmoji: {
    position: "absolute",
    fontSize: "2rem",
    opacity: 0.12,
    userSelect: "none",
  },
  float1: {
    top: "6%",
    left: "6%",
    animation: "gs-float1 8s ease-in-out infinite",
  },
  float2: {
    top: "12%",
    right: "8%",
    animation: "gs-float2 10s ease-in-out infinite",
  },
  float3: {
    bottom: "18%",
    left: "10%",
    animation: "gs-float3 9s ease-in-out infinite",
  },
  float4: {
    bottom: "28%",
    right: "6%",
    animation: "gs-float4 11s ease-in-out infinite",
  },

  // ─── HEADER ───────────────────────────────────────────────────────
  header: {
    textAlign: "center",
    animation: "gs-fadeInUp 0.5s ease-out both",
    position: "relative",
    zIndex: 1,
  },
  title: {
    fontSize: "2.4rem",
    fontWeight: 800,
    margin: 0,
    letterSpacing: "-0.03em",
    background: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 40%, #c4b5fd 70%, #f0abfc 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    filter: "drop-shadow(0 2px 12px rgba(99, 102, 241, 0.4))",
  },
  subtitle: {
    fontSize: "1.05rem",
    color: "#94a3b8",
    marginTop: "8px",
    fontWeight: 400,
    letterSpacing: "0.02em",
  },

  // ─── ROOM INFO BAR ────────────────────────────────────────────────
  roomInfoBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "16px",
    width: "100%",
    maxWidth: "560px",
    animation: "gs-fadeInUp 0.6s ease-out both",
    animationDelay: "0.05s",
    position: "relative",
    zIndex: 1,
  },
  roomCodeButton: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 16px",
    minHeight: "44px",
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    border: "1px solid rgba(99, 102, 241, 0.3)",
    borderRadius: "12px",
    cursor: "pointer",
    color: "#f1f5f9",
    fontSize: "14px",
    backdropFilter: "blur(8px)",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },
  roomCodeLabel: {
    color: "#94a3b8",
    fontSize: "0.75rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontWeight: 600,
  },
  roomCodeValue: {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    fontWeight: 700,
    fontSize: "1.2rem",
    letterSpacing: "3px",
    color: "#a5b4fc",
  },
  copyIndicator: {
    fontSize: "0.85rem",
    color: "#94a3b8",
  },

  // ─── PLAYER AVATARS (compact, in room bar) ────────────────────────
  playerAvatars: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  avatarPill: {
    position: "relative",
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid rgba(255, 255, 255, 0.15)",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
  },
  avatarInitials: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#ffffff",
    textTransform: "uppercase" as const,
  },
  avatarCrown: {
    position: "absolute",
    top: "-6px",
    right: "-4px",
    fontSize: "0.65rem",
  },
  avatarOverflow: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148, 163, 184, 0.2)",
    border: "2px solid rgba(148, 163, 184, 0.3)",
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "#94a3b8",
  },

  // ─── PLAYER LIST SECTION ──────────────────────────────────────────
  playerSection: {
    width: "100%",
    maxWidth: "560px",
    animation: "gs-fadeInUp 0.6s ease-out both",
    animationDelay: "0.1s",
    position: "relative",
    zIndex: 1,
  },
  sectionHeading: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#e2e8f0",
    margin: "0 0 12px 0",
    letterSpacing: "-0.01em",
  },
  playerList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  playerChip: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px 6px 6px",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "999px",
    backdropFilter: "blur(8px)",
  },
  playerChipAvatar: {
    width: "26px",
    height: "26px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.6rem",
    fontWeight: 700,
    color: "#ffffff",
  },
  playerChipName: {
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "#e2e8f0",
  },
  crownBadge: {
    fontSize: "0.75rem",
  },
  disconnectedDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#ef4444",
    flexShrink: 0,
  },

  // ─── GAMES SECTION ────────────────────────────────────────────────
  gamesSection: {
    width: "100%",
    maxWidth: "560px",
    flex: 1,
    position: "relative",
    zIndex: 1,
  },
  waitingText: {
    fontSize: "0.9rem",
    color: "#94a3b8",
    margin: "0 0 16px 0",
    fontStyle: "italic",
  },
  gameGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
  },

  // ─── GAME CARDS ───────────────────────────────────────────────────
  gameCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: "16px 12px",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    textAlign: "center",
    width: "100%",
    height: "150px",
    fontSize: "inherit",
    fontFamily: "inherit",
    backdropFilter: "blur(12px)",
    animation: "gs-fadeInUp 0.5s ease-out both",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  gameCardAvailable: {
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    opacity: 1,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  },
  gameCardUnavailable: {
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    opacity: 0.85,
    cursor: "not-allowed",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
  },
  gameCardClickable: {
    cursor: "pointer",
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
  gameCardInner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    flex: 1,
  },
  gameEmoji: {
    fontSize: "2.6rem",
    flexShrink: 0,
    lineHeight: 1,
    filter: "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3))",
  },
  gameName: {
    fontSize: "0.9rem",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.01em",
    lineHeight: 1.2,
  },
  playerRangePill: {
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: "999px",
    border: "1px solid",
    letterSpacing: "0.02em",
  },
  needOverlay: {
    position: "absolute",
    top: "8px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "3px 10px",
    borderRadius: "10px",
    backgroundColor: "rgba(251, 191, 36, 0.2)",
    border: "1px solid rgba(251, 191, 36, 0.4)",
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#fbbf24",
    letterSpacing: "0.02em",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  },
};
