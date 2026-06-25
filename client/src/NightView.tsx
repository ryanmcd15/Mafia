import React, { useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Role, Player } from "./types";

export function NightView(): React.JSX.Element {
  const { role, players, myPlayer } = useGameStore();

  if (role === Role.Killer) {
    return <KillerSubView players={players} myPlayer={myPlayer} />;
  }

  if (role === Role.Medic) {
    return <MedicSubView players={players} myPlayer={myPlayer} />;
  }

  return <CivilianSubView />;
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

function CivilianSubView(): React.JSX.Element {
  return (
    <div style={styles.cinematicContainer}>
      <p style={styles.cinematicText}>Night falls… everyone is asleep.</p>
    </div>
  );
}

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
  },
  cinematicText: {
    fontSize: "22px",
    color: "var(--text-secondary)",
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 1.6,
  },
};
