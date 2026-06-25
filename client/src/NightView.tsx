import React, { useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Role, Player } from "./types";

export function NightView(): React.JSX.Element {
  const { role, players, myPlayer, round } = useGameStore();

  if (role === Role.Killer) {
    return <KillerSubView players={players} myPlayer={myPlayer} />;
  }

  if (role === Role.Medic) {
    return <MedicSubView players={players} myPlayer={myPlayer} />;
  }

  return <CivilianSubView round={round} />;
}

// --- Killer Sub-View ---

function KillerSubView({
  players,
  myPlayer,
}: {
  players: Player[];
  myPlayer: Player | null;
}): React.JSX.Element {
  const { roomCode } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const targets = players.filter(
    (p) => p.isAlive && p.id !== myPlayer?.id
  );

  function handleSubmitKill() {
    if (!selectedId) return;
    socket.emit("submitKill", { roomCode, targetId: selectedId });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={styles.container}>
        <p style={styles.waitingText}>Waiting for other players...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Choose your target</h2>
      <ul style={styles.playerList} role="listbox" aria-label="Target selection">
        {targets.map((player) => (
          <li
            key={player.id}
            role="option"
            aria-selected={selectedId === player.id}
            onClick={() => setSelectedId(player.id)}
            style={{
              ...styles.playerRow,
              ...(selectedId === player.id ? styles.playerRowSelected : {}),
            }}
          >
            <span style={styles.playerName}>{player.name}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={handleSubmitKill}
        disabled={!selectedId}
        style={{
          ...styles.submitButton,
          ...(selectedId ? styles.submitButtonEnabled : styles.submitButtonDisabled),
        }}
        aria-disabled={!selectedId}
      >
        Submit Kill
      </button>
    </div>
  );
}

// --- Medic Sub-View ---

function MedicSubView({
  players,
  myPlayer,
}: {
  players: Player[];
  myPlayer: Player | null;
}): React.JSX.Element {
  const { roomCode } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const targets = players.filter((p) => p.isAlive);

  function handleSubmitSave() {
    if (!selectedId) return;
    socket.emit("submitSave", { roomCode, targetId: selectedId });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={styles.container}>
        <p style={styles.waitingText}>Waiting for other players...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Choose who to save</h2>
      <ul style={styles.playerList} role="listbox" aria-label="Target selection">
        {targets.map((player) => (
          <li
            key={player.id}
            role="option"
            aria-selected={selectedId === player.id}
            onClick={() => setSelectedId(player.id)}
            style={{
              ...styles.playerRow,
              ...(selectedId === player.id ? styles.playerRowSelected : {}),
            }}
          >
            <span style={styles.playerName}>
              {player.name}
              {player.id === myPlayer?.id ? " (You)" : ""}
            </span>
          </li>
        ))}
      </ul>
      <button
        onClick={handleSubmitSave}
        disabled={!selectedId}
        style={{
          ...styles.submitButton,
          ...(selectedId ? styles.submitButtonEnabled : styles.submitButtonDisabled),
        }}
        aria-disabled={!selectedId}
      >
        Submit Save
      </button>
    </div>
  );
}

// --- Civilian Sub-View ---

function CivilianSubView({ round }: { round: number }): React.JSX.Element {
  return (
    <div style={styles.cinematicContainer}>
      {/* Pulsing moon */}
      <div style={styles.moon} aria-hidden="true" />

      {/* Drifting stars */}
      <div style={styles.starsContainer} aria-hidden="true">
        <div style={{ ...styles.star, top: "12%", left: "15%", animationDelay: "0s" }} />
        <div style={{ ...styles.star, top: "8%", left: "72%", animationDelay: "1.2s" }} />
        <div style={{ ...styles.star, top: "25%", left: "85%", animationDelay: "0.6s" }} />
        <div style={{ ...styles.star, top: "18%", left: "40%", animationDelay: "2.1s" }} />
        <div style={{ ...styles.star, top: "35%", left: "22%", animationDelay: "1.8s" }} />
        <div style={{ ...styles.star, top: "5%", left: "55%", animationDelay: "0.3s" }} />
        <div style={{ ...styles.star, top: "30%", left: "65%", animationDelay: "2.5s" }} />
        <div style={{ ...styles.star, top: "15%", left: "90%", animationDelay: "1.5s" }} />
      </div>

      <p style={{ fontSize: "14px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px", position: "relative", zIndex: 1 }}>
        Night {round}
      </p>
      <p style={styles.cinematicText}>Night falls… everyone is asleep.</p>

      <style>{nightKeyframes}</style>
    </div>
  );
}

const nightKeyframes = `
@keyframes moonPulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

@keyframes starDrift {
  0%, 100% { opacity: 0.3; transform: translateY(0px); }
  50% { opacity: 1; transform: translateY(-4px); }
}
`;

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    minHeight: "100vh",
    gap: "16px",
  },
  heading: {
    fontSize: "20px",
    color: "var(--text-primary)",
    marginBottom: "8px",
    textAlign: "center",
  },
  playerList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    minHeight: "44px",
    minWidth: "44px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "8px",
    cursor: "pointer",
    border: "2px solid transparent",
    transition: "border-color 0.2s, background-color 0.2s",
  },
  playerRowSelected: {
    borderColor: "var(--accent)",
    backgroundColor: "var(--bg-tertiary)",
  },
  playerName: {
    fontSize: "16px",
    color: "var(--text-primary)",
  },
  submitButton: {
    width: "100%",
    maxWidth: "400px",
    minHeight: "44px",
    minWidth: "44px",
    padding: "14px 24px",
    fontSize: "18px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "8px",
    marginTop: "16px",
    transition: "background-color 0.2s",
  },
  submitButtonEnabled: {
    backgroundColor: "var(--accent)",
    color: "var(--text-primary)",
    cursor: "pointer",
  },
  submitButtonDisabled: {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    cursor: "not-allowed",
    opacity: 0.7,
  },
  waitingText: {
    fontSize: "18px",
    color: "var(--text-secondary)",
    textAlign: "center",
    marginTop: "40vh",
  },
  cinematicContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "24px 16px",
    backgroundColor: "var(--bg-primary)",
    position: "relative",
    overflow: "hidden",
  },
  cinematicText: {
    fontSize: "22px",
    color: "var(--text-secondary)",
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 1.6,
    position: "relative",
    zIndex: 1,
  },
  moon: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 35%, #f0e68c, #d4a843)",
    boxShadow: "0 0 40px rgba(240, 230, 140, 0.4), 0 0 80px rgba(240, 230, 140, 0.15)",
    marginBottom: "40px",
    animation: "moonPulse 4s ease-in-out infinite",
    position: "relative",
    zIndex: 1,
  },
  starsContainer: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  star: {
    position: "absolute",
    width: "4px",
    height: "4px",
    borderRadius: "50%",
    backgroundColor: "#ffffff",
    animation: "starDrift 3s ease-in-out infinite",
  },
};
