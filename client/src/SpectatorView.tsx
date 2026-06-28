import React from "react";
import { useGameStore } from "./store";
import { GamePhase, Player } from "./types";

/**
 * SpectatorView — shown to eliminated players who are spectating.
 * A cleaner, more engaging read-only view.
 */
export function SpectatorView(): React.JSX.Element {
  const { phase, players, narration, voteResult, round } = useGameStore();

  const livingPlayers = players.filter((p: Player) => p.isAlive);
  const eliminatedPlayers = players.filter((p: Player) => !p.isAlive);

  return (
    <div style={styles.container}>
      {/* Ghost emoji header */}
      <div style={styles.header}>
        <span style={styles.ghostEmoji}>👻</span>
        <h1 style={styles.title}>You're a Ghost</h1>
        <p style={styles.subtitle}>Eliminated — watching from beyond</p>
      </div>

      {/* Current phase pill */}
      <div style={styles.phasePill}>
        <span style={styles.phaseLabel}>{formatPhase(phase)}</span>
        {phase === GamePhase.Night && <span style={styles.phaseIcon}>🌙</span>}
        {phase === GamePhase.Morning && <span style={styles.phaseIcon}>☀️</span>}
        {phase === GamePhase.Discussion && <span style={styles.phaseIcon}>💬</span>}
        {phase === GamePhase.Voting && <span style={styles.phaseIcon}>🗳️</span>}
      </div>

      {/* Living players */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Still Alive ({livingPlayers.length})</h2>
        <div style={styles.playerGrid}>
          {livingPlayers.map((player: Player) => (
            <div key={player.id} style={styles.playerChip}>
              <span style={styles.playerDot} />
              {player.name}
            </div>
          ))}
        </div>
      </div>

      {/* Fallen players */}
      {eliminatedPlayers.length > 1 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Fallen 💀</h2>
          <div style={styles.playerGrid}>
            {eliminatedPlayers.map((player: Player) => (
              <div key={player.id} style={styles.deadChip}>
                {player.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narration */}
      {narration && narration.segments.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Last Night</h2>
          <div style={styles.narrationBox}>
            {narration.segments.map((segment: string, idx: number) => (
              <p key={idx} style={styles.narrationText}>
                {segment}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Vote results */}
      {voteResult && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Last Vote</h2>
          <div style={styles.narrationBox}>
            {voteResult.isTie ? (
              <p style={{ color: "var(--warning, #ffa502)", fontSize: "0.95rem" }}>
                ⚖️ Tied vote — no one eliminated
              </p>
            ) : voteResult.eliminatedPlayerId ? (
              <p style={{ color: "var(--danger, #ff4757)", fontSize: "0.95rem" }}>
                ⚰️ {getPlayerName(voteResult.eliminatedPlayerId, players)} was voted out
              </p>
            ) : (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                No one was eliminated
              </p>
            )}
          </div>
        </div>
      )}

      {/* Flavor text */}
      <p style={styles.flavorText}>
        Sit back and watch the chaos unfold...
      </p>
    </div>
  );
}

function formatPhase(phase: GamePhase | null): string {
  switch (phase) {
    case GamePhase.Night: return "Night";
    case GamePhase.Morning: return "Morning";
    case GamePhase.Discussion: return "Discussion";
    case GamePhase.Voting: return "Voting";
    case GamePhase.Results: return "Results";
    case GamePhase.RoleReveal: return "Role Reveal";
    case GamePhase.GameOver: return "Game Over";
    default: return "...";
  }
}

function getPlayerName(playerId: string, players: Player[]): string {
  return players.find((p) => p.id === playerId)?.name ?? "Unknown";
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px",
    minHeight: "100vh",
    background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
    gap: "20px",
  },
  header: {
    textAlign: "center",
    marginBottom: "8px",
  },
  ghostEmoji: {
    fontSize: "48px",
    display: "block",
    marginBottom: "8px",
    opacity: 0.8,
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "var(--text-primary, #fff)",
    margin: 0,
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "var(--text-secondary, #b0b0b0)",
    marginTop: "4px",
  },
  phasePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 20px",
    borderRadius: "20px",
    backgroundColor: "rgba(108, 99, 255, 0.15)",
    border: "1px solid rgba(108, 99, 255, 0.3)",
  },
  phaseLabel: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "var(--accent, #6c63ff)",
  },
  phaseIcon: {
    fontSize: "1rem",
  },
  section: {
    width: "100%",
    maxWidth: "400px",
  },
  sectionTitle: {
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    color: "var(--text-secondary, #b0b0b0)",
    marginBottom: "10px",
    fontWeight: 600,
  },
  playerGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  playerChip: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    borderRadius: "20px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    fontSize: "0.85rem",
    color: "var(--text-primary, #fff)",
  },
  playerDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "var(--success, #2ed573)",
  },
  deadChip: {
    padding: "8px 14px",
    borderRadius: "20px",
    backgroundColor: "rgba(255, 71, 87, 0.1)",
    fontSize: "0.85rem",
    color: "var(--text-secondary, #b0b0b0)",
    textDecoration: "line-through",
  },
  narrationBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: "16px",
    borderLeft: "3px solid var(--accent, #6c63ff)",
  },
  narrationText: {
    color: "var(--text-primary, #fff)",
    fontSize: "0.9rem",
    lineHeight: 1.6,
    marginBottom: "6px",
  },
  flavorText: {
    fontSize: "0.8rem",
    color: "var(--text-secondary, #b0b0b0)",
    fontStyle: "italic",
    marginTop: "auto",
    paddingTop: "24px",
  },
};
