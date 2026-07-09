import React, { useState } from "react";

// ---------- Types ----------

interface GuessingPhaseProps {
  guessOptions: Array<{ id: string; name: string }>;
  timeRemaining: number;
  hasGuessed: boolean;
  onGuess: (playerId: string) => void;
}

// ---------- Constants ----------

const GUESSING_WINDOW_SECONDS = 20;

// ---------- Component ----------

export const GuessingPhase: React.FC<GuessingPhaseProps> = ({
  guessOptions,
  timeRemaining,
  hasGuessed,
  onGuess,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const timerProgress = timeRemaining / GUESSING_WINDOW_SECONDS;
  const timerColor = timeRemaining <= 10 ? "#ff4757" : "#6c63ff";

  function handleSubmit() {
    if (selectedId && !hasGuessed) {
      onGuess(selectedId);
    }
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: "480px", margin: "0 auto", color: "var(--text-primary)", minHeight: "100vh", background: "radial-gradient(ellipse at top, rgba(108, 99, 255, 0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(255, 107, 157, 0.06) 0%, transparent 50%)" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <h2
          style={{
            fontSize: "22px",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #c44dff, #6c63ff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "6px",
          }}
        >
          🕵️ Guess Your Admirer
        </h2>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Who's been writing sweet messages about you?
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
          {timeRemaining <= 0 ? "⏰ Time's up!" : `${timeRemaining}s remaining`}
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "4px",
          background: "var(--bg-tertiary)",
          borderRadius: "2px",
          marginBottom: "20px",
          overflow: "hidden",
        }}
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

      {hasGuessed ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 16px",
            background: "linear-gradient(135deg, rgba(46, 213, 115, 0.1), rgba(108, 99, 255, 0.05))",
            borderRadius: "16px",
            border: "1px solid rgba(46, 213, 115, 0.3)",
          }}
        >
          <p style={{ fontSize: "32px", marginBottom: "8px" }}>🔮</p>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>
            Guess locked in!
          </p>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px", fontSize: "14px" }}>
            Waiting for others to guess...
          </p>
        </div>
      ) : (
        <>
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
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(108, 99, 255, 0.15), rgba(196, 77, 255, 0.1))"
                      : "var(--bg-secondary)",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    marginBottom: "8px",
                    border: isSelected ? "2px solid #6c63ff" : "2px solid var(--bg-tertiary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    fontSize: "16px",
                    fontWeight: isSelected ? "600" : "500",
                    color: isSelected ? "var(--accent)" : "var(--text-primary)",
                    transition: "all 0.15s ease",
                    transform: isSelected ? "scale(1.01)" : "scale(1)",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{isSelected ? "💌" : "👤"}</span>
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
            {selectedId ? "🔮 Lock In Guess" : "Select a player"}
          </button>
        </>
      )}
    </div>
  );
};

export default GuessingPhase;
