import React, { useState } from "react";

// ---------- Types ----------

interface VotingMessage {
  id: string;
  text: string;
}

interface VotingPhaseProps {
  messages: VotingMessage[];
  timeRemaining: number;
  hasVoted: boolean;
  votesIn: number;
  totalEligible: number;
  myMessageId: string | null;
  onVote: (messageId: string) => void;
}

// ---------- Constants ----------

const VOTING_WINDOW_SECONDS = 30;

// ---------- Component ----------

export const VotingPhase: React.FC<VotingPhaseProps> = ({
  messages,
  timeRemaining,
  hasVoted,
  votesIn,
  totalEligible,
  myMessageId,
  onVote,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const timerProgress = timeRemaining / VOTING_WINDOW_SECONDS;
  const timerColor = timeRemaining <= 10 ? "#ff4757" : "#6c63ff";

  function handleSelect(messageId: string) {
    if (hasVoted) return;
    if (messageId === myMessageId) return;
    setSelectedId(messageId);
  }

  function handleSubmitVote() {
    if (!selectedId || hasVoted) return;
    onVote(selectedId);
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: "480px", margin: "0 auto", color: "var(--text-primary)" }}>
      {/* Header with gradient */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #ffd700, #ff6b9d)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "4px",
          }}
        >
          🗳️ Vote for Funniest
        </h2>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Pick the message that made you laugh the most!
        </p>
      </div>

      {/* Timer */}
      <div style={{ textAlign: "center", marginBottom: "6px" }}>
        <span
          aria-live="polite"
          style={{
            fontSize: "14px",
            color: timeRemaining <= 10 ? "#ff4757" : "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
            fontWeight: timeRemaining <= 10 ? "bold" : "normal",
          }}
        >
          {timeRemaining <= 0 ? "⏰ Voting closed" : `${timeRemaining}s remaining`}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "4px",
          background: "var(--bg-tertiary)",
          borderRadius: "2px",
          marginBottom: "16px",
          overflow: "hidden",
        }}
        aria-label="Voting time remaining"
      >
        <div
          style={{
            width: `${timerProgress * 100}%`,
            height: "100%",
            background: timerColor,
            borderRadius: "2px",
            transition: "width 1s linear",
          }}
        />
      </div>

      {/* Vote progress */}
      <div
        style={{
          textAlign: "center",
          fontSize: "13px",
          color: "var(--text-secondary)",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        <span style={{ fontSize: "16px" }}>👥</span>
        {votesIn} / {totalEligible} voted
      </div>

      {/* Voted confirmation state */}
      {hasVoted ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 16px",
            background: "linear-gradient(135deg, rgba(46, 213, 115, 0.1), rgba(108, 99, 255, 0.05))",
            borderRadius: "16px",
            border: "1px solid rgba(46, 213, 115, 0.3)",
          }}
        >
          <p style={{ fontSize: "32px", marginBottom: "8px" }}>✅</p>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>
            Vote submitted!
          </p>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px", fontSize: "14px" }}>
            Waiting for others to vote...
          </p>
        </div>
      ) : (
        <>
          {/* Message cards */}
          {messages.map((msg, index) => {
            const isOwn = msg.id === myMessageId;
            const isSelected = msg.id === selectedId;

            return (
              <div
                key={msg.id}
                onClick={() => handleSelect(msg.id)}
                role="button"
                tabIndex={isOwn ? -1 : 0}
                aria-label={isOwn ? "Your message (cannot vote for own)" : `Vote for message: ${msg.text}`}
                aria-pressed={isSelected}
                aria-disabled={isOwn}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(msg.id);
                  }
                }}
                style={{
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(108, 99, 255, 0.15), rgba(196, 77, 255, 0.1))"
                    : isOwn
                      ? "var(--bg-tertiary)"
                      : "var(--bg-secondary)",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  marginBottom: "10px",
                  border: isSelected
                    ? "2px solid #6c63ff"
                    : "2px solid var(--bg-tertiary)",
                  opacity: isOwn ? 0.4 : 1,
                  cursor: isOwn ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  transform: isSelected ? "scale(1.01)" : "scale(1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ fontSize: "16px", opacity: 0.7, marginTop: "2px" }}>
                    {isOwn ? "🔇" : isSelected ? "✨" : `${index + 1}.`}
                  </span>
                  <div style={{ flex: 1 }}>
                    {isOwn && (
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Your message
                      </p>
                    )}
                    <p style={{ fontSize: "15px", lineHeight: "1.5", color: "var(--text-primary)" }}>
                      {msg.text}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Submit vote button */}
          <button
            onClick={handleSubmitVote}
            disabled={!selectedId}
            aria-label="Submit your vote"
            style={{
              width: "100%",
              minHeight: "48px",
              padding: "14px 16px",
              fontSize: "16px",
              fontWeight: "bold",
              border: "none",
              borderRadius: "12px",
              cursor: selectedId ? "pointer" : "not-allowed",
              background: selectedId
                ? "linear-gradient(135deg, #6c63ff, #c44dff)"
                : "var(--bg-tertiary)",
              color: selectedId ? "#ffffff" : "var(--text-secondary)",
              marginTop: "12px",
              boxShadow: selectedId ? "0 4px 12px rgba(108, 99, 255, 0.3)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            {selectedId ? "🎯 Submit Vote" : "Select a message to vote"}
          </button>
        </>
      )}
    </div>
  );
};

export default VotingPhase;
