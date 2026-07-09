import React, { useState } from "react";

// ---------- Types ----------

interface GuessingPhaseProps {
  guessOptions: Array<{ id: string; name: string }>;
  timeRemaining: number;
  hasGuessed: boolean;
  onGuess: (playerId: string) => void;
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
  padding: "14px 16px",
  marginBottom: "8px",
  border: "2px solid var(--bg-tertiary)",
  cursor: "pointer",
  minHeight: "44px",
  display: "flex",
  alignItems: "center",
  fontSize: "16px",
  fontWeight: "500",
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

const GUESSING_WINDOW_SECONDS = 60;

// ---------- Component ----------

export const GuessingPhase: React.FC<GuessingPhaseProps> = ({
  guessOptions,
  timeRemaining,
  hasGuessed,
  onGuess,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const timerProgress = timeRemaining / GUESSING_WINDOW_SECONDS;
  const timerColor = timeRemaining <= 10 ? "var(--danger)" : "var(--accent)";

  function handleSubmit() {
    if (selectedId && !hasGuessed) {
      onGuess(selectedId);
    }
  }

  if (hasGuessed) {
    return (
      <div style={containerStyle}>
        <h2 style={headingStyle}>🤔 Guess Your Admirer</h2>
        <div
          style={{
            textAlign: "center",
            padding: "32px 16px",
            background: "var(--bg-secondary)",
            borderRadius: "12px",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>
            ✓ Guess submitted!
          </p>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
            Waiting for others to guess...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>🤔 Guess Your Admirer</h2>
      <p
        style={{
          textAlign: "center",
          color: "var(--text-secondary)",
          marginBottom: "16px",
          fontSize: "14px",
        }}
      >
        Who do you think has been writing about you?
      </p>

      {/* Timer */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <span
          aria-live="polite"
          aria-label={`${timeRemaining} seconds remaining`}
          style={{
            fontSize: "14px",
            color: timeRemaining <= 10 ? "var(--danger)" : "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeRemaining}s remaining
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

      {/* Player Options */}
      <div role="radiogroup" aria-label="Select your admirer">
        {guessOptions.map((player) => {
          const isSelected = selectedId === player.id;
          return (
            <div
              key={player.id}
              role="radio"
              aria-checked={isSelected}
              aria-label={`Select ${player.name}`}
              tabIndex={0}
              onClick={() => setSelectedId(player.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId(player.id);
                }
              }}
              style={{
                ...cardStyle,
                borderColor: isSelected ? "var(--accent)" : "var(--bg-tertiary)",
                background: isSelected
                  ? "rgba(108, 99, 255, 0.15)"
                  : "var(--bg-secondary)",
                color: isSelected ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              {player.name}
            </div>
          );
        })}
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!selectedId}
        aria-label="Submit guess"
        style={{
          ...buttonBase,
          background: selectedId ? "var(--accent)" : "var(--bg-tertiary)",
          color: selectedId ? "#ffffff" : "var(--text-secondary)",
          cursor: selectedId ? "pointer" : "not-allowed",
        }}
      >
        Submit Guess
      </button>
    </div>
  );
};

export default GuessingPhase;
