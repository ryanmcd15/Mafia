import React, { useEffect, useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Player } from "./types";

export function VotingView(): React.JSX.Element {
  const { players, myPlayer, roomCode } = useGameStore();
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  // Living players excluding self
  const targets: Player[] = players.filter(
    (p) => p.id !== myPlayer?.id && p.isAlive
  );

  function handleSubmit() {
    if (!selectedTargetId) return;
    socket.emit("submitVote", { roomCode, targetId: selectedTargetId });
    setSubmitted(true);
  }

  function handleSkipVote() {
    socket.emit("submitSkipVote", { roomCode });
    setSubmitted(true);
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: "480px", margin: "0 auto" }}>
      {/* Timer */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "24px",
        }}
      >
        <p
          style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            marginBottom: "4px",
          }}
        >
          Time remaining
        </p>
        <p
          aria-live="polite"
          style={{
            fontSize: "32px",
            fontWeight: "bold",
            fontVariantNumeric: "tabular-nums",
            color: timeLeft <= 10 ? "var(--danger)" : "var(--text-primary)",
          }}
        >
          {minutes}:{seconds}
        </p>
      </div>

      {submitted ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 16px",
            background: "var(--bg-secondary)",
            borderRadius: "12px",
          }}
        >
          <p
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              color: "var(--success)",
              marginBottom: "8px",
            }}
          >
            Vote submitted!
          </p>
          <p style={{ color: "var(--text-secondary)" }}>
            Waiting for others...
          </p>
        </div>
      ) : (
        <>
          {/* Heading */}
          <h2
            style={{
              fontSize: "18px",
              marginBottom: "12px",
              color: "var(--text-primary)",
            }}
          >
            Vote to eliminate
          </h2>

          {/* Player list */}
          <ul
            role="listbox"
            aria-label="Vote targets"
            style={{ listStyle: "none", marginBottom: "20px" }}
          >
            {targets.map((player) => {
              const isSelected = selectedTargetId === player.id;
              return (
                <li key={player.id} style={{ marginBottom: "8px" }}>
                  <button
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelectedTargetId(player.id)}
                    style={{
                      width: "100%",
                      minHeight: "44px",
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      background: isSelected
                        ? "var(--accent)"
                        : "var(--bg-secondary)",
                      color: isSelected
                        ? "#ffffff"
                        : "var(--text-primary)",
                      border: isSelected
                        ? "2px solid var(--accent)"
                        : "2px solid var(--bg-tertiary)",
                      borderRadius: "8px",
                      fontSize: "16px",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    {player.name}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!selectedTargetId}
            style={{
              width: "100%",
              minHeight: "44px",
              padding: "14px",
              fontSize: "16px",
              fontWeight: "bold",
              color: "#ffffff",
              background: selectedTargetId
                ? "var(--danger)"
                : "var(--bg-tertiary)",
              border: "none",
              borderRadius: "8px",
              cursor: selectedTargetId ? "pointer" : "not-allowed",
              opacity: selectedTargetId ? 1 : 0.6,
              transition: "background 0.15s, opacity 0.15s",
            }}
          >
            Submit Vote
          </button>

          {/* Skip Vote button */}
          <button
            onClick={handleSkipVote}
            style={{
              width: "100%",
              minHeight: "44px",
              padding: "14px",
              fontSize: "16px",
              fontWeight: "bold",
              color: "var(--text-secondary)",
              background: "transparent",
              border: "2px solid var(--bg-tertiary)",
              borderRadius: "8px",
              cursor: "pointer",
              marginTop: "12px",
              transition: "border-color 0.15s",
            }}
          >
            Skip Vote
          </button>
        </>
      )}
    </div>
  );
}
