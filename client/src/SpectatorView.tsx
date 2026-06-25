import React from "react";
import { useGameStore } from "./store";
import { GamePhase, Player } from "./types";

/**
 * SpectatorView — shown to eliminated players who are spectating.
 * Read-only view displaying public game information with no action buttons.
 */
export function SpectatorView(): React.JSX.Element {
  const { phase, players, narration, voteResult } = useGameStore();

  const livingPlayers = players.filter((p: Player) => p.isAlive);

  return (
    <div className="container" style={{ paddingTop: "16px", paddingBottom: "32px" }}>
      {/* Persistent eliminated banner */}
      <div
        role="banner"
        aria-label="Eliminated — You are spectating"
        style={{
          backgroundColor: "var(--danger, #ff4757)",
          color: "#fff",
          textAlign: "center",
          padding: "12px 16px",
          borderRadius: "8px",
          fontWeight: 700,
          fontSize: "1rem",
          letterSpacing: "0.5px",
          marginBottom: "24px",
        }}
      >
        ELIMINATED — You are spectating
      </div>

      {/* Current phase */}
      {phase && (
        <section style={{ marginBottom: "20px" }}>
          <h2
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--text-secondary, #b0b0b0)",
              marginBottom: "4px",
              letterSpacing: "1px",
            }}
          >
            Current Phase
          </h2>
          <p
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "var(--text-primary, #f0f0f0)",
            }}
          >
            {formatPhase(phase)}
          </p>
        </section>
      )}

      {/* Living players */}
      <section style={{ marginBottom: "20px" }}>
        <h2
          style={{
            fontSize: "0.75rem",
            textTransform: "uppercase",
            color: "var(--text-secondary, #b0b0b0)",
            marginBottom: "8px",
            letterSpacing: "1px",
          }}
        >
          Living Players ({livingPlayers.length})
        </h2>
        {livingPlayers.length > 0 ? (
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            {livingPlayers.map((player: Player) => (
              <li
                key={player.id}
                style={{
                  backgroundColor: "var(--bg-tertiary, #3a3a3a)",
                  padding: "6px 12px",
                  borderRadius: "16px",
                  fontSize: "0.875rem",
                  color: "var(--text-primary, #f0f0f0)",
                }}
              >
                {player.name}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--text-secondary, #b0b0b0)", fontSize: "0.875rem" }}>
            No players remaining.
          </p>
        )}
      </section>

      {/* Narration */}
      {narration && (
        <section style={{ marginBottom: "20px" }}>
          <h2
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--text-secondary, #b0b0b0)",
              marginBottom: "8px",
              letterSpacing: "1px",
            }}
          >
            Narration
          </h2>
          <div
            style={{
              backgroundColor: "var(--bg-secondary, #2d2d2d)",
              borderRadius: "8px",
              padding: "12px 16px",
            }}
          >
            {narration.segments.map((segment: string, idx: number) => (
              <p
                key={idx}
                style={{
                  color: "var(--text-primary, #f0f0f0)",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  marginBottom: idx < narration.segments.length - 1 ? "8px" : 0,
                }}
              >
                {segment}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Vote results */}
      {voteResult && (
        <section style={{ marginBottom: "20px" }}>
          <h2
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              color: "var(--text-secondary, #b0b0b0)",
              marginBottom: "8px",
              letterSpacing: "1px",
            }}
          >
            Vote Results
          </h2>
          <div
            style={{
              backgroundColor: "var(--bg-secondary, #2d2d2d)",
              borderRadius: "8px",
              padding: "12px 16px",
            }}
          >
            {voteResult.isTie ? (
              <p style={{ color: "var(--warning, #ffa502)", fontSize: "0.9rem" }}>
                The vote ended in a tie. No one was eliminated.
              </p>
            ) : voteResult.eliminatedPlayerId ? (
              <p style={{ color: "var(--danger, #ff4757)", fontSize: "0.9rem" }}>
                {getPlayerName(voteResult.eliminatedPlayerId, players)} was eliminated by vote.
              </p>
            ) : (
              <p style={{ color: "var(--text-secondary, #b0b0b0)", fontSize: "0.9rem" }}>
                No one was eliminated.
              </p>
            )}

            {/* Vote counts */}
            {Object.keys(voteResult.voteCounts).length > 0 && (
              <ul style={{ listStyle: "none", marginTop: "8px" }}>
                {Object.entries(voteResult.voteCounts).map(([playerId, count]) => (
                  <li
                    key={playerId}
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary, #b0b0b0)",
                      marginBottom: "4px",
                    }}
                  >
                    {getPlayerName(playerId, players)}: {count} vote{count !== 1 ? "s" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** Format a GamePhase enum value to a user-friendly label. */
function formatPhase(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.RoleReveal:
      return "Role Reveal";
    case GamePhase.GameOver:
      return "Game Over";
    default:
      return phase;
  }
}

/** Look up a player name by ID, falling back to 'Unknown'. */
function getPlayerName(playerId: string, players: Player[]): string {
  const player = players.find((p) => p.id === playerId);
  return player?.name ?? "Unknown";
}
