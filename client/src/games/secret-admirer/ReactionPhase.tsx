import React, { useState, useEffect, useCallback } from "react";
import socket from "../../socket";
import { VALID_REACTION_EMOJIS } from "./types";
import type { SaReactionUpdatedPayload } from "./types";

// ---------- Types ----------

interface ReceivedMessage {
  id: string;
  roundNumber: number;
  text: string;
  reactions: Record<string, number>;
  myReactions: string[];
}

interface ReactionPhaseProps {
  messages: ReceivedMessage[];
  currentRound: number;
  /** Timestamp (ms) when messages were delivered — used to calculate remaining reaction time */
  deliveredAt: number;
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
  height: "4px",
  background: "var(--bg-tertiary)",
  borderRadius: "2px",
  marginBottom: "16px",
  overflow: "hidden",
};

const messageCardStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--bg-secondary), rgba(255, 107, 157, 0.04))",
  borderRadius: "16px",
  padding: "16px",
  marginBottom: "12px",
  border: "1px solid rgba(255, 107, 157, 0.15)",
};

const messageLabelStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--text-secondary)",
  marginBottom: "4px",
};

const messageTextStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "1.5",
  color: "var(--text-primary)",
  marginBottom: "12px",
};

const reactionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  alignItems: "center",
};

const reactionCountsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  marginTop: "8px",
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "32px 16px",
  color: "var(--text-secondary)",
};

// ---------- Constants ----------

const REACTION_WINDOW_SECONDS = 15;

// ---------- Component ----------

export const ReactionPhase: React.FC<ReactionPhaseProps> = ({
  messages,
  currentRound,
  deliveredAt,
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    const elapsed = Math.floor((Date.now() - deliveredAt) / 1000);
    return Math.max(0, REACTION_WINDOW_SECONDS - elapsed);
  });
  const [localMessages, setLocalMessages] = useState<ReceivedMessage[]>(messages);

  const windowClosed = timeRemaining <= 0;

  // Sync messages from props when they change
  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  // Countdown timer
  useEffect(() => {
    if (windowClosed) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - deliveredAt) / 1000);
      const remaining = Math.max(0, REACTION_WINDOW_SECONDS - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deliveredAt, windowClosed]);

  // Listen for reaction updates from server
  useEffect(() => {
    function handleReactionUpdated(data: SaReactionUpdatedPayload) {
      setLocalMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId ? { ...msg, reactions: data.reactions } : msg
        )
      );
    }

    socket.on("saReactionUpdated", handleReactionUpdated);
    return () => {
      socket.off("saReactionUpdated", handleReactionUpdated);
    };
  }, []);

  // Handle emoji reaction
  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      if (windowClosed) return;

      // Optimistic update: add to myReactions locally
      setLocalMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          if (msg.myReactions.includes(emoji)) return msg;
          return {
            ...msg,
            myReactions: [...msg.myReactions, emoji],
            reactions: {
              ...msg.reactions,
              [emoji]: (msg.reactions[emoji] || 0) + 1,
            },
          };
        })
      );

      socket.emit("gameEvent", { type: "react", payload: { messageId, emoji } });
    },
    [windowClosed]
  );

  // Filter to messages for the current round
  const roundMessages = localMessages.filter((m) => m.roundNumber === currentRound);
  const displayMessages = roundMessages.length > 0 ? roundMessages : localMessages;

  // Timer progress (1 = full, 0 = empty)
  const timerProgress = timeRemaining / REACTION_WINDOW_SECONDS;
  const timerColor = timeRemaining <= 10 ? "var(--danger)" : "var(--accent)";

  return (
    <div style={{ ...containerStyle, animation: "sa-fadeIn 0.4s ease-out" }}>
      <h2 style={{
        ...headingStyle,
        background: "linear-gradient(135deg, #ff6b9d, #c44dff)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        fontSize: "22px",
      }}>💌 React to Messages</h2>

      {/* Timer indicator */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <span
          style={{
            fontSize: "14px",
            color: timeRemaining <= 10 ? "var(--danger)" : "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {windowClosed ? "Reaction window closed" : `${timeRemaining}s remaining`}
        </span>
      </div>
      <div style={timerBarContainerStyle}>
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

      {displayMessages.length === 0 ? (
        <div style={emptyStateStyle}>
          <p style={{ fontSize: "48px", marginBottom: "12px" }}>📭</p>
          <p>No messages to react to yet.</p>
        </div>
      ) : (
        displayMessages.map((msg) => (
          <div key={msg.id} style={messageCardStyle}>
            <p style={messageLabelStyle}>
              💌 Anonymous admirer says... (Round {msg.roundNumber})
            </p>
            <p style={messageTextStyle}>{msg.text}</p>

            {/* Reaction buttons */}
            <div style={reactionRowStyle}>
              {VALID_REACTION_EMOJIS.map((emoji) => {
                const alreadyReacted = msg.myReactions.includes(emoji);
                const disabled = windowClosed || alreadyReacted;

                return (
                  <button
                    key={emoji}
                    onClick={() => handleReact(msg.id, emoji)}
                    disabled={disabled}
                    aria-label={`React with ${emoji}`}
                    style={{
                      minWidth: "44px",
                      minHeight: "44px",
                      fontSize: "20px",
                      border: alreadyReacted
                        ? "2px solid var(--accent)"
                        : "2px solid var(--bg-tertiary)",
                      borderRadius: "8px",
                      background: alreadyReacted
                        ? "rgba(108, 99, 255, 0.15)"
                        : "var(--bg-tertiary)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled && !alreadyReacted ? 0.4 : 1,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>

            {/* Aggregate reaction counts */}
            {Object.keys(msg.reactions).length > 0 && (
              <div style={reactionCountsStyle}>
                {Object.entries(msg.reactions)
                  .filter(([, count]) => count > 0)
                  .map(([emoji, count]) => (
                    <span
                      key={emoji}
                      style={{
                        background: "var(--bg-tertiary)",
                        borderRadius: "16px",
                        padding: "4px 10px",
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {emoji} {count}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default ReactionPhase;
