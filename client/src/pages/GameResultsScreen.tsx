import React from "react";
import { usePlatformStore, returnToGameSelection, endSession } from "../store/platformStore";

function renderScores(scores: Record<string, number> | Array<{ name: string; score: number }>): React.JSX.Element {
  const entries: Array<{ name: string; score: number }> = Array.isArray(scores)
    ? scores
    : Object.entries(scores).map(([name, score]) => ({ name, score }));

  const sorted = [...entries].sort((a, b) => b.score - a.score);

  return (
    <div style={{ width: "100%", maxWidth: "320px" }}>
      {sorted.map((entry, i) => (
        <div
          key={entry.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            marginBottom: "8px",
            borderRadius: "8px",
            backgroundColor: i === 0 ? "rgba(108, 99, 255, 0.2)" : "rgba(255, 255, 255, 0.05)",
            border: i === 0 ? "1px solid var(--accent, #6c63ff)" : "1px solid transparent",
          }}
        >
          <span style={{ color: "var(--text-primary, #ffffff)", fontWeight: i === 0 ? 700 : 400 }}>
            {i + 1}. {entry.name}
          </span>
          <span style={{ color: "var(--text-secondary, #b0b0b0)", fontWeight: 600 }}>
            {entry.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function renderResults(gameResults: unknown, platformPlayers?: Array<{ id: string; name: string }>): React.JSX.Element {
  if (!gameResults || typeof gameResults !== "object") {
    return <p style={{ color: "var(--text-secondary, #b0b0b0)", fontSize: "1.1rem" }}>Game Complete!</p>;
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
      <p
        key="winner"
        style={{
          fontSize: "1.25rem",
          color: "var(--accent, #6c63ff)",
          fontWeight: 700,
          marginBottom: "16px",
        }}
      >
        Winner: {winnerDisplay}
      </p>
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
    return <p style={{ color: "var(--text-secondary, #b0b0b0)", fontSize: "1.1rem" }}>Game Complete!</p>;
  }

  return <>{elements}</>;
}

export function GameResultsScreen(): React.JSX.Element {
  const { gameResults, myPlayer, players } = usePlatformStore();
  const isHost = myPlayer?.isHost ?? false;

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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        backgroundColor: "var(--bg-primary, #1a1a2e)",
        color: "var(--text-primary, #ffffff)",
        overflowX: "hidden",
        position: "relative",
      }}
    >
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
            color: "rgba(255, 71, 87, 0.25)",
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

      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          marginBottom: "24px",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {isWinner ? "🎉 You Win!" : isLoser ? "Game Over" : "Game Over"}
      </h1>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "32px",
          width: "100%",
          maxWidth: "400px",
          padding: "24px",
          borderRadius: "12px",
          backgroundColor: "var(--bg-secondary, #2d2d44)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {renderResults(gameResults, players)}
      </div>

      {isHost ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            width: "100%",
            maxWidth: "300px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <button
            onClick={handlePlayAgain}
            style={{
              minHeight: "44px",
              padding: "12px 24px",
              fontSize: "1rem",
              fontWeight: 600,
              borderRadius: "8px",
              border: "none",
              backgroundColor: "var(--accent, #6c63ff)",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Back to Games List
          </button>
        </div>
      ) : (
        <p
          style={{
            color: "var(--text-secondary, #b0b0b0)",
            fontSize: "1rem",
            textAlign: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          Waiting for host to decide...
        </p>
      )}

      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
