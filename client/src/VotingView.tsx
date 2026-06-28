import React, { useEffect, useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Player } from "./types";

export function VotingView(): React.JSX.Element {
  const { players, myPlayer, roomCode } = useGameStore();
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [voteCount, setVoteCount] = useState(0);
  const [votedForName, setVotedForName] = useState<string | null>(null);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for voteRecorded events to track progress
  useEffect(() => {
    function onVoteRecorded(_data: { voterId: string; voterName: string }) {
      setVoteCount((prev) => prev + 1);
    }
    socket.on("voteRecorded", onVoteRecorded);
    return () => {
      socket.off("voteRecorded", onVoteRecorded);
    };
  }, []);

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  // Timer color transitions: white → yellow → red
  const timerColor =
    timeLeft <= 10
      ? "#ff4757"
      : timeLeft <= 30
        ? "#ffa502"
        : "var(--text-primary)";

  const timerGlow =
    timeLeft <= 10
      ? "0 0 20px rgba(255, 71, 87, 0.4)"
      : timeLeft <= 30
        ? "0 0 12px rgba(255, 165, 2, 0.2)"
        : "none";

  // Living players excluding self
  const alivePlayers: Player[] = players.filter((p) => p.isAlive);
  const targets: Player[] = alivePlayers.filter(
    (p) => p.id !== myPlayer?.id
  );

  function handleSubmit() {
    if (!selectedTargetId) return;
    const target = targets.find((p) => p.id === selectedTargetId);
    socket.emit("gameEvent", { type: "submitVote", data: { targetId: selectedTargetId } });
    setVotedForName(target?.name ?? null);
    setSubmitted(true);
  }

  function handleSkipVote() {
    socket.emit("gameEvent", { type: "skipVote", data: {} });
    setVotedForName(null);
    setSubmitted(true);
  }

  return (
    <div style={styles.outerContainer}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>🗳️ Vote to Eliminate</h1>
      </div>

      {/* Timer */}
      <div style={styles.timerWrapper}>
        <p style={styles.timerLabel}>Time remaining</p>
        <p
          aria-live="polite"
          style={{
            ...styles.timerValue,
            color: timerColor,
            textShadow: timerGlow !== "none" ? timerGlow : undefined,
          }}
        >
          {minutes}:{seconds}
        </p>
      </div>

      {submitted ? (
        <div style={styles.submittedCard}>
          <div style={styles.checkmarkCircle} aria-hidden="true">
            <span style={styles.checkmark}>✓</span>
          </div>
          <p style={styles.submittedTitle}>Vote submitted!</p>
          {votedForName ? (
            <p style={styles.submittedDetail}>
              You voted to eliminate: <strong>{votedForName}</strong>
            </p>
          ) : (
            <p style={styles.submittedDetailMuted}>
              You skipped your vote.
            </p>
          )}
          <p style={styles.voteProgress} aria-live="polite">
            {voteCount} of {alivePlayers.length} voted
          </p>
          <div style={styles.waitingDots}>
            <span style={styles.waitingText}>Waiting for others</span>
            <span style={styles.dots}>...</span>
          </div>
        </div>
      ) : (
        <div style={styles.votingArea}>
          {/* Player list */}
          <ul
            role="listbox"
            aria-label="Vote targets"
            style={styles.playerList}
          >
            {targets.map((player) => {
              const isSelected = selectedTargetId === player.id;
              return (
                <li key={player.id} style={styles.playerItem}>
                  <button
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelectedTargetId(player.id)}
                    style={{
                      ...styles.playerButton,
                      ...(isSelected ? styles.playerButtonSelected : {}),
                    }}
                  >
                    <span style={styles.playerName}>{player.name}</span>
                    {isSelected && (
                      <span style={styles.skullIcon}>💀</span>
                    )}
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
              ...styles.submitButton,
              ...(selectedTargetId ? styles.submitButtonActive : styles.submitButtonDisabled),
            }}
          >
            ⚠️ Submit Vote
          </button>

          {/* Skip Vote button */}
          <button
            onClick={handleSkipVote}
            style={styles.skipButton}
          >
            Skip Vote
          </button>
        </div>
      )}

      <style>{votingKeyframes}</style>
    </div>
  );
}

const votingKeyframes = `
@keyframes checkPop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulseDots {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  outerContainer: {
    padding: "24px 16px",
    maxWidth: "480px",
    margin: "0 auto",
    minHeight: "100vh",
    background: "linear-gradient(180deg, #1a1a1a 0%, #1f1a2e 50%, #1a1a1a 100%)",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    textAlign: "center",
    paddingTop: "8px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  },
  timerWrapper: {
    textAlign: "center",
  },
  timerLabel: {
    fontSize: "13px",
    color: "var(--text-secondary)",
    marginBottom: "4px",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  timerValue: {
    fontSize: "3.5rem",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    transition: "color 0.5s ease, text-shadow 0.5s ease",
    margin: 0,
  },
  submittedCard: {
    textAlign: "center",
    padding: "36px 20px",
    background: "var(--bg-secondary)",
    borderRadius: "16px",
    border: "1px solid var(--bg-tertiary)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    animation: "fadeInUp 0.4s ease-out",
  },
  checkmarkCircle: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    backgroundColor: "rgba(46, 213, 115, 0.15)",
    border: "2px solid var(--success)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "checkPop 0.5s ease-out",
  },
  checkmark: {
    fontSize: "28px",
    color: "var(--success)",
    fontWeight: 700,
  },
  submittedTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--success)",
    margin: 0,
  },
  submittedDetail: {
    color: "var(--text-primary)",
    fontSize: "15px",
    margin: 0,
  },
  submittedDetailMuted: {
    color: "var(--text-secondary)",
    fontSize: "15px",
    margin: 0,
  },
  voteProgress: {
    color: "var(--text-secondary)",
    fontSize: "13px",
    margin: 0,
  },
  waitingDots: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginTop: "4px",
  },
  waitingText: {
    color: "var(--text-secondary)",
    fontSize: "14px",
  },
  dots: {
    color: "var(--text-secondary)",
    animation: "pulseDots 1.5s ease-in-out infinite",
  },
  votingArea: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  playerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  playerItem: {
    margin: 0,
  },
  playerButton: {
    width: "100%",
    minHeight: "52px",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    border: "2px solid var(--bg-tertiary)",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
  },
  playerButtonSelected: {
    background: "rgba(255, 71, 87, 0.12)",
    borderColor: "#ff4757",
    color: "#ffffff",
    boxShadow: "0 0 14px rgba(255, 71, 87, 0.2)",
  },
  playerName: {
    fontSize: "16px",
    fontWeight: 500,
  },
  skullIcon: {
    fontSize: "20px",
  },
  submitButton: {
    width: "100%",
    minHeight: "52px",
    padding: "16px",
    fontSize: "17px",
    fontWeight: 700,
    border: "none",
    borderRadius: "12px",
    transition: "background 0.2s, opacity 0.2s, box-shadow 0.2s",
    marginTop: "8px",
  },
  submitButtonActive: {
    color: "#ffffff",
    background: "linear-gradient(135deg, #ff4757 0%, #c0392b 100%)",
    cursor: "pointer",
    opacity: 1,
    boxShadow: "0 4px 20px rgba(255, 71, 87, 0.35)",
  },
  submitButtonDisabled: {
    color: "var(--text-secondary)",
    background: "var(--bg-tertiary)",
    cursor: "not-allowed",
    opacity: 0.6,
  },
  skipButton: {
    width: "100%",
    minHeight: "44px",
    padding: "14px",
    fontSize: "15px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "2px solid var(--bg-tertiary)",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
};
