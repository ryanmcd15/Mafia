import React, { useState } from "react";
import type { RevealData } from "./types";
import { socket } from "../../socket";

// ---------- Types ----------

interface RevealPhaseProps {
  revealData: RevealData;
  isHost: boolean;
}

// ---------- Styles ----------

const containerStyle: React.CSSProperties = {
  padding: "24px 16px",
  maxWidth: "480px",
  margin: "0 auto",
  color: "var(--text-primary)",
};

const heroStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "28px",
  padding: "20px 0",
};

const heroTitle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: "bold",
  background: "linear-gradient(135deg, #ff6b9d, #c44dff, #6c63ff)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  marginBottom: "8px",
};

const tabContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  marginBottom: "20px",
  background: "var(--bg-tertiary)",
  borderRadius: "12px",
  padding: "4px",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-secondary)",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "16px",
  border: "1px solid var(--bg-tertiary)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  marginBottom: "12px",
  color: "var(--text-primary)",
};

const cycleItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 12px",
  borderRadius: "8px",
  marginBottom: "6px",
  background: "rgba(108, 99, 255, 0.08)",
  fontSize: "15px",
};

const guessItemStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  marginBottom: "6px",
  fontSize: "14px",
};

const leaderboardItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: "8px",
  marginBottom: "6px",
};

const awardCardStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(255, 107, 157, 0.1), rgba(108, 99, 255, 0.1))",
  borderRadius: "12px",
  padding: "14px 16px",
  marginBottom: "10px",
  border: "1px solid rgba(108, 99, 255, 0.2)",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "48px",
  padding: "14px 20px",
  fontSize: "16px",
  fontWeight: "bold",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  background: "linear-gradient(135deg, #6c63ff, #c44dff)",
  color: "#ffffff",
  marginTop: "20px",
  boxShadow: "0 4px 12px rgba(108, 99, 255, 0.3)",
};

// ---------- Tab definitions ----------

type TabId = "leaderboard" | "cycle" | "guesses" | "stats" | "awards";

const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: "leaderboard", label: "Scores", emoji: "🏅" },
  { id: "cycle", label: "Cycle", emoji: "💌" },
  { id: "guesses", label: "Guesses", emoji: "🤔" },
  { id: "stats", label: "Stats", emoji: "📊" },
  { id: "awards", label: "Awards", emoji: "🏆" },
];

// ---------- Component ----------

export const RevealPhase: React.FC<RevealPhaseProps> = ({ revealData, isHost }) => {
  const { cycle, guesses, messages, statistics, leaderboard, awards } = revealData;
  const [activeTab, setActiveTab] = useState<TabId>("leaderboard");

  const handleReturnToLobby = () => {
    socket.emit("gameEvent", { type: "returnToLobby", payload: {} });
  };

  return (
    <div style={containerStyle}>
      {/* Hero Header */}
      <div style={heroStyle}>
        <h2 style={heroTitle}>🎉 The Big Reveal!</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          The mystery is solved. Here's who admired who!
        </p>
      </div>

      {/* Tabs */}
      <div style={tabContainerStyle}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "8px 4px",
              border: "none",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: activeTab === tab.id ? "bold" : "normal",
              background: activeTab === tab.id ? "var(--bg-secondary)" : "transparent",
              color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: activeTab === tab.id ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
            }}
          >
            <span style={{ display: "block", fontSize: "16px", marginBottom: "2px" }}>
              {tab.emoji}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Tab */}
      {activeTab === "leaderboard" && (
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>🏅 Final Scores</h3>
          {leaderboard.map((entry) => {
            const rankEmoji =
              entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : "";
            const isTopThree = entry.rank <= 3;
            const bgColor =
              entry.rank === 1
                ? "rgba(255, 215, 0, 0.1)"
                : entry.rank === 2
                  ? "rgba(192, 192, 192, 0.1)"
                  : entry.rank === 3
                    ? "rgba(205, 127, 50, 0.1)"
                    : "transparent";

            return (
              <div
                key={entry.playerId}
                style={{
                  ...leaderboardItemStyle,
                  background: bgColor,
                  fontWeight: isTopThree ? "bold" : "normal",
                }}
              >
                <span style={{ fontSize: isTopThree ? "16px" : "14px" }}>
                  {rankEmoji || `#${entry.rank}`} {entry.playerName}
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    color: isTopThree ? "var(--accent)" : "var(--text-secondary)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {entry.score} pts
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Cycle Tab */}
      {activeTab === "cycle" && (
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>💌 Who Admired Who</h3>
          {cycle.map((entry) => (
            <div key={entry.admirerId} style={cycleItemStyle}>
              <span style={{ fontWeight: "600" }}>{entry.admirerName}</span>
              <span style={{ color: "#ff6b9d" }}>❤️</span>
              <span>{entry.targetName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Guesses Tab */}
      {activeTab === "guesses" && (
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>🤔 Who Guessed Right?</h3>
          {guesses.map((guess) => (
            <div
              key={guess.playerId}
              style={{
                ...guessItemStyle,
                background: guess.correct
                  ? "rgba(46, 213, 115, 0.1)"
                  : guess.guessedName === null
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(255, 71, 87, 0.08)",
              }}
            >
              {guess.guessedName === null ? (
                <span style={{ color: "var(--text-secondary)" }}>
                  {guess.playerName} — didn't guess
                  <span style={{ fontSize: "12px", marginLeft: "8px", opacity: 0.7 }}>
                    (was {guess.actualAdmirerName})
                  </span>
                </span>
              ) : guess.correct ? (
                <span>
                  <span style={{ color: "var(--success)" }}>✅</span> {guess.playerName} guessed{" "}
                  <strong>{guess.guessedName}</strong>
                </span>
              ) : (
                <span>
                  <span style={{ color: "var(--danger)" }}>❌</span> {guess.playerName} guessed{" "}
                  {guess.guessedName}
                  <span
                    style={{ fontSize: "12px", color: "var(--text-secondary)", marginLeft: "8px" }}
                  >
                    (was {guess.actualAdmirerName})
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === "stats" && (
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>📊 Game Stats</h3>
          {statistics.mostReactedMessage && (
            <div style={{ padding: "10px 0", borderBottom: "1px solid var(--bg-tertiary)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                🏆 Most Reactions
              </div>
              <div style={{ fontSize: "14px" }}>
                "{statistics.mostReactedMessage.text}"
              </div>
              <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "2px" }}>
                by {statistics.mostReactedMessage.authorName} — {statistics.mostReactedMessage.reactionCount} reactions
              </div>
            </div>
          )}
          {statistics.longestAnswer && (
            <div style={{ padding: "10px 0", borderBottom: "1px solid var(--bg-tertiary)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                📏 Longest Answer
              </div>
              <div style={{ fontSize: "14px" }}>
                "{statistics.longestAnswer.text}"
              </div>
              <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "2px" }}>
                by {statistics.longestAnswer.authorName} — {statistics.longestAnswer.length} chars
              </div>
            </div>
          )}
          {statistics.shortestAnswer && (
            <div style={{ padding: "10px 0", borderBottom: "1px solid var(--bg-tertiary)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                ⚡ Shortest Answer
              </div>
              <div style={{ fontSize: "14px" }}>
                "{statistics.shortestAnswer.text}"
              </div>
              <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "2px" }}>
                by {statistics.shortestAnswer.authorName} — {statistics.shortestAnswer.length} chars
              </div>
            </div>
          )}
          {statistics.fastestSubmission && (
            <div style={{ padding: "10px 0" }}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                🚀 Fastest Submission
              </div>
              <div style={{ fontSize: "14px" }}>
                {statistics.fastestSubmission.authorName}
              </div>
              <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "2px" }}>
                {statistics.fastestSubmission.timeSeconds}s
              </div>
            </div>
          )}
          {!statistics.mostReactedMessage && !statistics.longestAnswer && !statistics.shortestAnswer && !statistics.fastestSubmission && (
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", textAlign: "center", padding: "16px 0" }}>
              No statistics available yet
            </p>
          )}

          {/* Messages Summary */}
          {messages && messages.length > 0 && (
            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--bg-tertiary)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                📝 All Messages ({messages.length} rounds)
              </div>
              {messages.map((round) => (
                <div key={round.roundNumber} style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--accent)", marginBottom: "4px" }}>
                    Round {round.roundNumber}
                  </div>
                  {round.messages.map((msg, idx) => (
                    <div
                      key={`${round.roundNumber}-${idx}`}
                      style={{ fontSize: "13px", padding: "3px 0", color: msg.text ? "var(--text-primary)" : "var(--text-secondary)" }}
                    >
                      <strong>{msg.authorName}</strong> → {msg.targetName}:{" "}
                      {msg.text || <em>no message</em>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Awards Tab */}
      {activeTab === "awards" && (
        <div>
          {awards.length > 0 ? (
            awards.map((award, idx) => (
              <div key={idx} style={awardCardStyle}>
                <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "4px" }}>
                  {award.name}
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                  {award.description}
                </div>
                <div style={{ fontSize: "15px", color: "var(--accent)", fontWeight: "600" }}>
                  {award.winners.join(", ")}
                </div>
              </div>
            ))
          ) : (
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                No awards to display
              </p>
            </div>
          )}
        </div>
      )}

      {/* Return to Lobby button (host only) */}
      {isHost ? (
        <button onClick={handleReturnToLobby} style={buttonStyle}>
          🎮 Back to Games
        </button>
      ) : (
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "13px", marginTop: "20px" }}>
          Waiting for host to end the game...
        </p>
      )}
    </div>
  );
};

export default RevealPhase;
