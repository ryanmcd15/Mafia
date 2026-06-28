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
    socket.emit("gameEvent", { type: "nightAction", data: { targetId: selectedId, action: "kill" } });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={killerStyles.container}>
        <div style={killerStyles.waitingWrapper}>
          <div style={killerStyles.pulseOrb} aria-hidden="true" />
          <p style={killerStyles.waitingText}>Waiting for other players...</p>
        </div>
        <style>{killerKeyframes}</style>
      </div>
    );
  }

  return (
    <div style={killerStyles.container}>
      <h2 style={killerStyles.heading}>🔪 Choose your target</h2>
      <p style={killerStyles.subtext}>Select a player to eliminate tonight</p>
      <ul style={killerStyles.playerList} role="listbox" aria-label="Target selection">
        {targets.map((player) => (
          <li
            key={player.id}
            role="option"
            aria-selected={selectedId === player.id}
            onClick={() => setSelectedId(player.id)}
            style={{
              ...killerStyles.playerRow,
              ...(selectedId === player.id ? killerStyles.playerRowSelected : {}),
            }}
          >
            <span style={killerStyles.playerName}>{player.name}</span>
            {selectedId === player.id && (
              <span style={killerStyles.selectedIndicator}>💀</span>
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={handleSubmitKill}
        disabled={!selectedId}
        style={{
          ...killerStyles.submitButton,
          ...(selectedId ? killerStyles.submitButtonEnabled : killerStyles.submitButtonDisabled),
        }}
        aria-disabled={!selectedId}
      >
        🔪 Submit Kill
      </button>
      <style>{killerKeyframes}</style>
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
    socket.emit("gameEvent", { type: "nightAction", data: { targetId: selectedId, action: "save" } });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={medicStyles.container}>
        <div style={medicStyles.waitingWrapper}>
          <div style={medicStyles.pulseOrb} aria-hidden="true" />
          <p style={medicStyles.waitingText}>Waiting for other players...</p>
        </div>
        <style>{medicKeyframes}</style>
      </div>
    );
  }

  return (
    <div style={medicStyles.container}>
      <h2 style={medicStyles.heading}>🩺 Choose who to protect</h2>
      <p style={medicStyles.subtext}>Select a player to save tonight</p>
      <ul style={medicStyles.playerList} role="listbox" aria-label="Target selection">
        {targets.map((player) => (
          <li
            key={player.id}
            role="option"
            aria-selected={selectedId === player.id}
            onClick={() => setSelectedId(player.id)}
            style={{
              ...medicStyles.playerRow,
              ...(selectedId === player.id ? medicStyles.playerRowSelected : {}),
            }}
          >
            <span style={medicStyles.playerName}>
              {player.name}
              {player.id === myPlayer?.id ? " (You)" : ""}
            </span>
            {selectedId === player.id && (
              <span style={medicStyles.selectedIndicator}>🛡️</span>
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={handleSubmitSave}
        disabled={!selectedId}
        style={{
          ...medicStyles.submitButton,
          ...(selectedId ? medicStyles.submitButtonEnabled : medicStyles.submitButtonDisabled),
        }}
        aria-disabled={!selectedId}
      >
        🩺 Submit Save
      </button>
      <style>{medicKeyframes}</style>
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

// --- Keyframes ---

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

const killerKeyframes = `
@keyframes killerPulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
`;

const medicKeyframes = `
@keyframes medicPulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
`;

// --- Killer Styles ---

const killerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    minHeight: "100vh",
    gap: "16px",
    background: "linear-gradient(180deg, #1a1a1a 0%, #2a1515 50%, #1a1010 100%)",
  },
  heading: {
    fontSize: "22px",
    color: "#ff4757",
    marginBottom: "0",
    textAlign: "center",
    fontWeight: 700,
    marginTop: "16px",
  },
  subtext: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    textAlign: "center",
    marginBottom: "8px",
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
    justifyContent: "space-between",
    padding: "14px 18px",
    minHeight: "44px",
    minWidth: "44px",
    backgroundColor: "rgba(255, 71, 87, 0.06)",
    borderRadius: "10px",
    cursor: "pointer",
    border: "2px solid rgba(255, 71, 87, 0.15)",
    transition: "border-color 0.2s, background-color 0.2s, box-shadow 0.2s",
  },
  playerRowSelected: {
    borderColor: "#ff4757",
    backgroundColor: "rgba(255, 71, 87, 0.15)",
    boxShadow: "0 0 12px rgba(255, 71, 87, 0.25)",
  },
  playerName: {
    fontSize: "16px",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  selectedIndicator: {
    fontSize: "18px",
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
    borderRadius: "10px",
    marginTop: "16px",
    transition: "background-color 0.2s, box-shadow 0.2s",
  },
  submitButtonEnabled: {
    backgroundColor: "#ff4757",
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(255, 71, 87, 0.3)",
  },
  submitButtonDisabled: {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    cursor: "not-allowed",
    opacity: 0.7,
  },
  waitingWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: "60vh",
    gap: "24px",
  },
  pulseOrb: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255, 71, 87, 0.6), rgba(255, 71, 87, 0.1))",
    animation: "killerPulse 2s ease-in-out infinite",
  },
  waitingText: {
    fontSize: "18px",
    color: "var(--text-secondary)",
    textAlign: "center",
    fontStyle: "italic",
  },
};

// --- Medic Styles ---

const medicStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    minHeight: "100vh",
    gap: "16px",
    background: "linear-gradient(180deg, #1a1a1a 0%, #152a1a 50%, #101a12 100%)",
  },
  heading: {
    fontSize: "22px",
    color: "#2ed573",
    marginBottom: "0",
    textAlign: "center",
    fontWeight: 700,
    marginTop: "16px",
  },
  subtext: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    textAlign: "center",
    marginBottom: "8px",
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
    justifyContent: "space-between",
    padding: "14px 18px",
    minHeight: "44px",
    minWidth: "44px",
    backgroundColor: "rgba(46, 213, 115, 0.06)",
    borderRadius: "10px",
    cursor: "pointer",
    border: "2px solid rgba(46, 213, 115, 0.15)",
    transition: "border-color 0.2s, background-color 0.2s, box-shadow 0.2s",
  },
  playerRowSelected: {
    borderColor: "#2ed573",
    backgroundColor: "rgba(46, 213, 115, 0.15)",
    boxShadow: "0 0 12px rgba(46, 213, 115, 0.25)",
  },
  playerName: {
    fontSize: "16px",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  selectedIndicator: {
    fontSize: "18px",
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
    borderRadius: "10px",
    marginTop: "16px",
    transition: "background-color 0.2s, box-shadow 0.2s",
  },
  submitButtonEnabled: {
    backgroundColor: "#2ed573",
    color: "#1a1a1a",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(46, 213, 115, 0.3)",
  },
  submitButtonDisabled: {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    cursor: "not-allowed",
    opacity: 0.7,
  },
  waitingWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: "60vh",
    gap: "24px",
  },
  pulseOrb: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(46, 213, 115, 0.6), rgba(46, 213, 115, 0.1))",
    animation: "medicPulse 2s ease-in-out infinite",
  },
  waitingText: {
    fontSize: "18px",
    color: "var(--text-secondary)",
    textAlign: "center",
    fontStyle: "italic",
  },
};

// --- Civilian Styles ---

const styles: Record<string, React.CSSProperties> = {
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
