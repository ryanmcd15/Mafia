import React, { useEffect } from "react";
import { usePlatformStore, returnToGameSelection, endSession } from "../store/platformStore";

/* ─── CSS Keyframes (injected once) ─────────────────────────────────────── */
const KEYFRAMES_ID = "results-keyframes";
function injectKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes results-fadeInUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes results-float1 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(12px, -18px) rotate(5deg); }
      50% { transform: translate(-8px, -30px) rotate(-3deg); }
      75% { transform: translate(15px, -12px) rotate(4deg); }
    }
    @keyframes results-float2 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-15px, -10px) rotate(-5deg); }
      50% { transform: translate(10px, -25px) rotate(6deg); }
      75% { transform: translate(-12px, -15px) rotate(-2deg); }
    }
    @keyframes results-float3 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(8px, -22px) rotate(3deg); }
      50% { transform: translate(-14px, -10px) rotate(-6deg); }
      75% { transform: translate(6px, -28px) rotate(2deg); }
    }
    @keyframes results-float4 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-10px, -14px) rotate(-4deg); }
      50% { transform: translate(12px, -22px) rotate(5deg); }
      75% { transform: translate(-8px, -8px) rotate(-3deg); }
    }
    @keyframes results-glow {
      0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.2), 0 0 60px rgba(139, 92, 246, 0.1); }
      50% { box-shadow: 0 0 30px rgba(99, 102, 241, 0.4), 0 0 80px rgba(139, 92, 246, 0.2); }
    }
    @keyframes results-waitingPulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }
    @keyframes confettiFall {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function renderScores(scores: Record<string, number> | Array<{ name: string; score: number }>): React.JSX.Element {
  const entries: Array<{ name: string; score: number }> = Array.isArray(scores)
    ? scores
    : Object.entries(scores).map(([name, score]) => ({ name, score }));

  const sorted = [...entries].sort((a, b) => b.score - a.score);

  return (
    <div style={{ width: "100%", maxWidth: "340px" }}>
      {sorted.map((entry, i) => (
        <div
          key={entry.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 18px",
            marginBottom: "10px",
            borderRadius: "12px",
            backgroundColor: i === 0
              ? "rgba(250, 204, 21, 0.12)"
              : "rgba(255, 255, 255, 0.04)",
            border: i === 0
              ? "1px solid rgba(250, 204, 21, 0.4)"
              : "1px solid rgba(148, 163, 184, 0.1)",
            backdropFilter: "blur(4px)",
          }}
        >
          <span style={{
            color: i === 0 ? "#fde047" : "#e2e8f0",
            fontWeight: i === 0 ? 700 : 500,
            fontSize: i === 0 ? "1.05rem" : "0.95rem",
          }}>
            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {entry.name}
          </span>
          <span style={{
            color: i === 0 ? "#fbbf24" : "#94a3b8",
            fontWeight: 700,
            fontSize: "0.95rem",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}>
            {entry.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function renderResults(gameResults: unknown, platformPlayers?: Array<{ id: string; name: string }>): React.JSX.Element {
  if (!gameResults || typeof gameResults !== "object") {
    return <p style={{ color: "#94a3b8", fontSize: "1.2rem", fontWeight: 500 }}>Game Complete!</p>;
  }

  const results = gameResults as Record<string, unknown>;
  const elements: React.JSX.Element[] = [];

  if ("winner" in results && results.winner != null) {
    // Try to resolve winner to a player name
    let winnerDisplay = String(results.winner);
    const winnerIds = results.winnerPlayerIds as string[] | undefined;
    if (winnerIds && platformPlayers) {
      const names = winnerIds
        .map((id) => platformPlayers.find((p) => p.id === id)?.name ?? id)
        .filter((n) => n.length < 30); // filter out raw socket IDs if no name found
      if (names.length > 0) {
        winnerDisplay = names.join(", ");
      }
    } else if (platformPlayers) {
      // Maybe winner is a player ID directly
      const player = platformPlayers.find((p) => p.id === winnerDisplay);
      if (player) winnerDisplay = player.name;
    }

    elements.push(
      <div key="winner" style={{ textAlign: "center", marginBottom: "20px" }}>
        <p style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 8px 0",
        }}>
          Winner
        </p>
        <p style={{
          fontSize: "1.6rem",
          fontWeight: 800,
          margin: 0,
          background: "linear-gradient(135deg, #fde047 0%, #fbbf24 50%, #f59e0b 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 2px 8px rgba(251, 191, 36, 0.3))",
        }}>
          🏆 {winnerDisplay}
        </p>
      </div>
    );
  }

  if ("scores" in results && results.scores != null) {
    const scores = results.scores;
    if (Array.isArray(scores) || (typeof scores === "object" && scores !== null)) {
      elements.push(
        <div key="scores" style={{ marginTop: "8px" }}>
          {renderScores(scores as Record<string, number> | Array<{ name: string; score: number }>)}
        </div>
      );
    }
  }

  if (elements.length === 0) {
    return <p style={{ color: "#94a3b8", fontSize: "1.2rem", fontWeight: 500 }}>Game Complete!</p>;
  }

  return <>{elements}</>;
}

export function GameResultsScreen(): React.JSX.Element {
  const { gameResults, myPlayer, players } = usePlatformStore();
  const isHost = myPlayer?.isHost ?? false;

  useEffect(() => {
    injectKeyframes();
  }, []);

  // Determine winner/loser for Mafia-style games
  const results = (gameResults && typeof gameResults === "object") ? gameResults as Record<string, unknown> : null;
  const winner = results?.winner as string | undefined;
  const gamePlayers = results?.players as Array<{ id: string; name: string; role: string; isAlive: boolean }> | undefined;
  const myGamePlayer = gamePlayers?.find((p) => p.id === myPlayer?.id);
  const myRole = myGamePlayer?.role;

  const isMafiaGame = !!winner && !!myRole;
  const isCiviliansWin = winner === "Civilians";
  const isWinner = isMafiaGame
    ? (isCiviliansWin ? myRole !== "Killer" : myRole === "Killer")
    : false;
  const isLoser = isMafiaGame && !isWinner;

  const handlePlayAgain = () => {
    returnToGameSelection();
  };

  const handleEndSession = () => {
    endSession();
  };

  return (
    <div style={styles.container}>
      {/* Floating decorative emojis */}
      <div style={styles.floatingEmojis} aria-hidden="true">
        <span style={{ ...styles.floatingEmoji, ...styles.float1 }}>🎉</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float2 }}>🏆</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float3 }}>⭐</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float4 }}>🎊</span>
      </div>

      {/* Confetti for winners */}
      {isWinner && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }} aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "-10px",
                left: `${Math.random() * 100}%`,
                width: `${6 + Math.random() * 6}px`,
                height: `${6 + Math.random() * 6}px`,
                borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                backgroundColor: isCiviliansWin
                  ? ["#2ed573", "#7bed9f", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffd700"][i % 6]
                  : ["#ff4757", "#ff6b6b", "#ffa502", "#ff6348", "#eb3b5a", "#ffd700"][i % 6],
                animation: `confettiFall ${2 + Math.random() * 2}s ease-in forwards`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* LOSER banner for losers */}
      {isLoser && (
        <div
          style={{
            position: "absolute",
            top: "60px",
            fontSize: "4rem",
            fontWeight: 900,
            color: "rgba(255, 71, 87, 0.2)",
            letterSpacing: "12px",
            textTransform: "uppercase",
            zIndex: 0,
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          LOSER
        </div>
      )}

      {/* Title */}
      <h1 style={styles.title}>
        {isWinner ? "🎉 You Win!" : isLoser ? "🏁 Game Over" : "🏁 Game Over"}
      </h1>

      {/* Results Card */}
      <div style={styles.resultsCard}>
        {renderResults(gameResults, players)}
      </div>

      {/* Actions */}
      {isHost ? (
        <div style={styles.actionsContainer}>
          <button
            onClick={handlePlayAgain}
            style={styles.primaryButton}
          >
            🎮 Back to Games List
          </button>
        </div>
      ) : (
        <p style={styles.waitingText}>
          ⏳ Waiting for host to decide...
        </p>
      )}
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
    justifyContent: "center",
    padding: "48px 16px",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    gap: "28px",
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
    fontSize: "2.2rem",
    opacity: 0.1,
    userSelect: "none",
  },
  float1: {
    top: "10%",
    left: "8%",
    animation: "results-float1 8s ease-in-out infinite",
  },
  float2: {
    top: "18%",
    right: "10%",
    animation: "results-float2 10s ease-in-out infinite",
  },
  float3: {
    bottom: "22%",
    left: "12%",
    animation: "results-float3 9s ease-in-out infinite",
  },
  float4: {
    bottom: "32%",
    right: "8%",
    animation: "results-float4 11s ease-in-out infinite",
  },

  // ─── TITLE ────────────────────────────────────────────────────────
  title: {
    fontSize: "2.6rem",
    fontWeight: 800,
    margin: 0,
    textAlign: "center",
    letterSpacing: "-0.03em",
    background: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 40%, #c4b5fd 70%, #f0abfc 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    filter: "drop-shadow(0 2px 12px rgba(99, 102, 241, 0.4))",
    animation: "results-fadeInUp 0.5s ease-out both",
    position: "relative",
    zIndex: 1,
  },

  // ─── RESULTS CARD ─────────────────────────────────────────────────
  resultsCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "440px",
    padding: "32px 28px",
    borderRadius: "20px",
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    border: "1px solid rgba(99, 102, 241, 0.25)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    animation: "results-fadeInUp 0.6s ease-out both, results-glow 3s ease-in-out infinite",
    animationDelay: "0.1s",
    position: "relative",
    zIndex: 1,
  },

  // ─── ACTIONS ──────────────────────────────────────────────────────
  actionsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "100%",
    maxWidth: "340px",
    position: "relative",
    zIndex: 1,
    animation: "results-fadeInUp 0.7s ease-out both",
    animationDelay: "0.2s",
  },
  primaryButton: {
    width: "100%",
    minHeight: "56px",
    padding: "16px 28px",
    fontSize: "1.1rem",
    fontWeight: 700,
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%)",
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 6px 24px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease",
    letterSpacing: "0.02em",
  },

  // ─── WAITING TEXT ─────────────────────────────────────────────────
  waitingText: {
    color: "#a5b4fc",
    fontSize: "1.05rem",
    fontWeight: 500,
    textAlign: "center",
    position: "relative",
    zIndex: 1,
    animation: "results-waitingPulse 2s ease-in-out infinite",
    padding: "12px 24px",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderRadius: "12px",
    border: "1px solid rgba(99, 102, 241, 0.2)",
  },
};
