import React, { useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";
import { Role } from "./types";

const WIN_CONDITIONS: Record<Role, string> = {
  [Role.Killer]: "Eliminate all non-Killer players to win",
  [Role.Medic]: "Find and eliminate the Killer to win",
  [Role.Civilian]: "Find and eliminate the Killer to win",
};

const NIGHT_ACTIONS: Record<Role, string> = {
  [Role.Killer]: "Each night, choose a player to eliminate",
  [Role.Medic]: "Each night, choose a player to protect from elimination",
  [Role.Civilian]: "Sleep through the night and hope for the best",
};

export function RoleRevealView(): React.JSX.Element {
  const { role, roomCode } = useGameStore();
  const [acknowledged, setAcknowledged] = useState(false);

  function handleAcknowledge() {
    socket.emit("roleAcknowledged", { roomCode });
    setAcknowledged(true);
  }

  if (!role) {
    return (
      <div style={styles.container}>
        <p style={styles.loadingText}>Assigning roles…</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p style={styles.label}>Your Role</p>
        <h1 style={styles.roleName}>{role}</h1>

        <div style={styles.section}>
          <p style={styles.sectionLabel}>Win Condition</p>
          <p style={styles.sectionText}>{WIN_CONDITIONS[role]}</p>
        </div>

        <div style={styles.section}>
          <p style={styles.sectionLabel}>Night Action</p>
          <p style={styles.sectionText}>{NIGHT_ACTIONS[role]}</p>
        </div>

        {acknowledged ? (
          <p style={{ marginTop: "16px", fontSize: "14px", color: "var(--text-secondary)", fontStyle: "italic" }}>
            Waiting for other players...
          </p>
        ) : (
          <button
            type="button"
            onClick={handleAcknowledge}
            style={styles.button}
          >
            Got it
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    backgroundColor: "var(--bg-primary)",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "16px",
    padding: "32px 24px",
    textAlign: "center" as const,
  },
  label: {
    fontSize: "14px",
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "1.5px",
    marginBottom: "8px",
  },
  roleName: {
    fontSize: "36px",
    fontWeight: 700,
    color: "var(--accent)",
    marginBottom: "32px",
  },
  section: {
    marginBottom: "24px",
  },
  sectionLabel: {
    fontSize: "12px",
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    marginBottom: "6px",
  },
  sectionText: {
    fontSize: "16px",
    color: "var(--text-primary)",
    lineHeight: "1.4",
  },
  button: {
    marginTop: "16px",
    minWidth: "44px",
    minHeight: "44px",
    padding: "14px 32px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#ffffff",
    backgroundColor: "var(--accent)",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    width: "100%",
  },
  loadingText: {
    fontSize: "18px",
    color: "var(--text-secondary)",
  },
};
