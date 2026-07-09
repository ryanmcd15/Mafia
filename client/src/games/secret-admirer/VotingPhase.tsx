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

// ---------- Styles ----------

const containerStyle: React.CSSProperties = {
  padding: "24px 16px",
  maxWidth: "480px",
  margin: "0 auto",
  color: "var(--text-primary)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "8px",
};

const timerBarContainerStyle: React.CSSProperties = {
  width: "100%",
  height: "6px",
  background: "var(--bg-tertiary)",
  borderRadius: "3px",
  marginBottom: "16px",
  overflow: "hidden",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-secondary)",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "12px",
  border: "2px solid var(--bg-tertiary)",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const buttonBase: React.CSSProperties = {
  width: "100%",
  minHeight: "44px",
  padding: "12px 16px",
  fontSize: "16px",
  fontWeight: "bold",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginTop: "16px",
};

// ---------- Constants ----------

const VOTING_WINDOW_SECONDS = 60;

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
  const timerColor = timeRemaining <= 10 ? "var(--danger)" : "var(--accent)";

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
    <div style={containerStyle}>
      <h2 style={headingStyle}>🗳️ Vote for Funniest</h2>

      {/* Timer */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <span
          aria-live="polite"
          style={{
            fontSize: "14px",
            color: timeRemaining <= 10 ? "var(--danger)" : "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeRemaining <= 0 ? "Voting closed" : `${timeRemaining}s remaining`}
        </span>
      </div>
      <div style={timerBarContainerStyle} aria-label="Voting time remaining">
        <div
          style={{
            width: `${timerProgress * 100}%`,
            height: "100%",
            background: timerColor,
            borderRadius: "3px",
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
        }}
      >
        {votesIn} / {totalEligible} players voted
      </div>

      {/* Voted confirmation state */}
      {hasVoted ? (
        <div
          style={{
            textAlign: "center",
            padding: "24px 16px",
            background: "var(--bg-secondary)",
            borderRadius: "12px",
            marginBottom: "16px",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>
            ✓ Vote submitted!
          </p>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
            Waiting for others to vote...
          </p>
        </div>
      ) : (
        <>
          {/* Message cards */}
          {messages.map((msg) => {
            const isOwn = msg.id === myMessageId;
            const isSelected = msg.id === selectedId;

            return (
              <div
                key={msg.id}
                onClick={() => handleSelect(msg.id)}
                role="button"
                tabIndex={isOwn ? -1 : 0}
                aria-label={
                  isOwn
                    ? "Your message (cannot vote for own)"
                    : `Vote for message: ${msg.text}`
                }
                aria-pressed={isSelected}
                aria-disabled={isOwn}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(msg.id);
                  }
                }}
                style={{
                  ...cardStyle,
                  borderColor: isSelected
                    ? "var(--accent)"
                    : isOwn
                      ? "var(--bg-tertiary)"
                      : "var(--bg-tertiary)",
                  background: isSelected
                    ? "rgba(108, 99, 255, 0.15)"
                    : isOwn
                      ? "var(--bg-tertiary)"
                      : "var(--bg-secondary)",
                  opacity: isOwn ? 0.5 : 1,
                  cursor: isOwn ? "not-allowed" : "pointer",
                }}
              >
                {isOwn && (
                  <p
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    Your message
                  </p>
                )}
                <p
                  style={{
                    fontSize: "16px",
                    lineHeight: "1.5",
                    color: "var(--text-primary)",
                  }}
                >
                  {msg.text}
                </p>
              </div>
            );
          })}

          {/* Submit vote button */}
          <button
            onClick={handleSubmitVote}
            disabled={!selectedId}
            aria-label="Submit your vote"
            style={{
              ...buttonBase,
              background: selectedId ? "var(--accent)" : "var(--bg-tertiary)",
              color: selectedId ? "#ffffff" : "var(--text-secondary)",
              cursor: selectedId ? "pointer" : "not-allowed",
            }}
          >
            Submit Vote
          </button>
        </>
      )}
    </div>
  );
};

export default VotingPhase;
