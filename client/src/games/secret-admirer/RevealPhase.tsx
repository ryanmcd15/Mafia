import React from "react";
import type { RevealData } from "./types";

// ---------- Styles ----------

const containerStyle: React.CSSProperties = {
  padding: "24px 16px",
  maxWidth: "480px",
  margin: "0 auto",
  color: "var(--text-primary)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "24px",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-secondary)",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "16px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  marginBottom: "12px",
  color: "var(--text-primary)",
};

const listItemStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "var(--text-primary)",
  padding: "6px 0",
  borderBottom: "1px solid var(--bg-tertiary)",
};

const secondaryTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--text-secondary)",
};

// ---------- Component ----------

interface RevealPhaseProps {
  revealData: RevealData;
}

export const RevealPhase: React.FC<RevealPhaseProps> = ({ revealData }) => {
  const { cycle, guesses, messages, statistics, leaderboard, awards } = revealData;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <h2 style={headingStyle}>🎉 The Big Reveal!</h2>

      {/* Cycle Assignments Section */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>💌 Admirer Cycle</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {cycle.map((entry) => (
            <li key={entry.admirerId} style={listItemStyle}>
              {entry.admirerName} ❤️ {entry.targetName}
            </li>
          ))}
        </ul>
      </div>

      {/* Guesses Section */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>🤔 Guesses</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {guesses.map((guess) => (
            <li key={guess.playerId} style={listItemStyle}>
              {guess.guessedName === null ? (
                <span>
                  {guess.playerName} didn't guess{" "}
                  <span style={secondaryTextStyle}>
                    (actual: {guess.actualAdmirerName})
                  </span>
                </span>
              ) : guess.correct ? (
                <span>
                  {guess.playerName} guessed {guess.guessedName} ✅
                </span>
              ) : (
                <span>
                  {guess.playerName} guessed {guess.guessedName} ❌{" "}
                  <span style={secondaryTextStyle}>
                    (actual: {guess.actualAdmirerName})
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Messages by Round Section */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>📝 Messages by Round</h3>
        {messages.map((round) => (
          <div key={round.roundNumber} style={{ marginBottom: "12px" }}>
            <h4
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--accent)",
                marginBottom: "6px",
              }}
            >
              Round {round.roundNumber}
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {round.messages.map((msg, idx) => (
                <li
                  key={`${round.roundNumber}-${idx}`}
                  style={{
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    padding: "4px 0",
                  }}
                >
                  {msg.text ? (
                    <span>
                      {msg.authorName} → {msg.targetName}: {msg.text}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {msg.authorName} → {msg.targetName}: (no message)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Statistics Section */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>📊 Statistics</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {statistics.mostReactedMessage && (
            <li style={listItemStyle}>
              🏆 Most Reactions: "{statistics.mostReactedMessage.authorName}:{" "}
              {statistics.mostReactedMessage.text}" (
              {statistics.mostReactedMessage.reactionCount} reactions)
            </li>
          )}
          {statistics.longestAnswer && (
            <li style={listItemStyle}>
              📏 Longest Answer: "{statistics.longestAnswer.authorName}:{" "}
              {statistics.longestAnswer.text}" ({statistics.longestAnswer.length}{" "}
              chars)
            </li>
          )}
          {statistics.shortestAnswer && (
            <li style={listItemStyle}>
              ⚡ Shortest Answer: "{statistics.shortestAnswer.authorName}:{" "}
              {statistics.shortestAnswer.text}" (
              {statistics.shortestAnswer.length} chars)
            </li>
          )}
          {statistics.fastestSubmission && (
            <li style={listItemStyle}>
              🚀 Fastest: "{statistics.fastestSubmission.authorName}" (
              {statistics.fastestSubmission.timeSeconds}s)
            </li>
          )}
          {!statistics.mostReactedMessage &&
            !statistics.longestAnswer &&
            !statistics.shortestAnswer &&
            !statistics.fastestSubmission && (
              <li style={{ ...listItemStyle, color: "var(--text-secondary)" }}>
                No statistics available
              </li>
            )}
        </ul>
      </div>

      {/* Leaderboard Section */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>🏅 Leaderboard</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {leaderboard.map((entry) => {
            const rankEmoji =
              entry.rank === 1
                ? "🥇"
                : entry.rank === 2
                  ? "🥈"
                  : entry.rank === 3
                    ? "🥉"
                    : `#${entry.rank}`;

            const isTopThree = entry.rank <= 3;

            return (
              <li
                key={entry.playerId}
                style={{
                  ...listItemStyle,
                  fontWeight: isTopThree ? "bold" : "normal",
                  color: isTopThree ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                {rankEmoji} {entry.playerName} — {entry.score} pts
              </li>
            );
          })}
        </ul>
      </div>

      {/* Awards Section */}
      {awards.length > 0 && (
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>🏆 Awards</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {awards.map((award, idx) => (
              <li key={idx} style={{ ...listItemStyle, padding: "8px 0" }}>
                <div style={{ fontWeight: "600", fontSize: "14px" }}>
                  {award.name}
                </div>
                <div style={secondaryTextStyle}>{award.description}</div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "var(--accent)",
                    marginTop: "4px",
                  }}
                >
                  {award.winners.join(", ")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default RevealPhase;
