import React from "react";

// ---------- Types ----------

interface ReceivedMessage {
  id: string;
  roundNumber: number;
  text: string;
  reactions: Record<string, number>;
  myReactions: string[];
}

interface MessagePhaseProps {
  messages: ReceivedMessage[];
  currentRound: number;
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
  marginBottom: "16px",
};

const messageCardStyle: React.CSSProperties = {
  background: "var(--bg-secondary)",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "12px",
  border: "1px solid var(--bg-tertiary)",
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
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "32px 16px",
  color: "var(--text-secondary)",
};

// ---------- Component ----------

export const MessagePhase: React.FC<MessagePhaseProps> = ({ messages, currentRound }) => {
  // Show messages for the current round (most recent delivery)
  const roundMessages = messages.filter((m) => m.roundNumber === currentRound);
  const allMessages = roundMessages.length > 0 ? roundMessages : messages;

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>💌 Messages Received</h2>

      {allMessages.length === 0 ? (
        <div style={emptyStateStyle}>
          <p style={{ fontSize: "48px", marginBottom: "12px" }}>📭</p>
          <p>No messages yet. They'll appear after the round ends.</p>
        </div>
      ) : (
        allMessages.map((msg) => (
          <div key={msg.id} style={messageCardStyle}>
            <p style={messageLabelStyle}>
              💌 Anonymous admirer says... (Round {msg.roundNumber})
            </p>
            <p style={messageTextStyle}>{msg.text}</p>

            {/* Show reaction counts if any */}
            {Object.keys(msg.reactions).length > 0 && (
              <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {Object.entries(msg.reactions)
                  .filter(([, count]) => count > 0)
                  .map(([emoji, count]) => (
                    <span
                      key={emoji}
                      style={{
                        background: "var(--bg-tertiary)",
                        borderRadius: "16px",
                        padding: "4px 8px",
                        fontSize: "13px",
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

export default MessagePhase;
