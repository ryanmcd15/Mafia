import React, { useState } from "react";
import socket from "./socket";
import { useGameStore } from "./store";

interface ValidationErrors {
  name?: string;
  roomCode?: string;
}

function validateCreateName(name: string): string | undefined {
  if (!name.trim()) return "Name is required";
  if (name.trim().length > 32) return "Name must be 32 characters or fewer";
  return undefined;
}

function validateJoinName(name: string): string | undefined {
  if (!name.trim()) return "Name is required";
  if (name.trim().length > 20) return "Name must be 20 characters or fewer";
  return undefined;
}

function validateRoomCode(code: string): string | undefined {
  if (!code.trim()) return "Room code is required";
  if (!/^[A-Z0-9]{6}$/.test(code.trim())) return "Invalid room code format";
  return undefined;
}

export function HomeView(): React.JSX.Element {
  const { error } = useGameStore();

  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const [createErrors, setCreateErrors] = useState<ValidationErrors>({});
  const [joinErrors, setJoinErrors] = useState<ValidationErrors>({});

  function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    const nameError = validateCreateName(createName);
    if (nameError) {
      setCreateErrors({ name: nameError });
      return;
    }
    setCreateErrors({});
    socket.emit("createRoom", { playerName: createName.trim() });
  }

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const nameError = validateJoinName(joinName);
    const codeError = validateRoomCode(roomCode);
    const errors: ValidationErrors = {};
    if (nameError) errors.name = nameError;
    if (codeError) errors.roomCode = codeError;
    if (Object.keys(errors).length > 0) {
      setJoinErrors(errors);
      return;
    }
    setJoinErrors({});
    socket.emit("joinRoom", { roomCode: roomCode.trim(), playerName: joinName.trim() });
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Mafia</h1>

      {error && (
        <div role="alert" style={styles.toast}>
          {error}
        </div>
      )}

      {/* Create Room Section */}
      <form onSubmit={handleCreateRoom} style={styles.section} noValidate>
        <h2 style={styles.sectionTitle}>Create Room</h2>

        <label htmlFor="create-name" style={styles.label}>
          Your Name
        </label>
        <input
          id="create-name"
          type="text"
          value={createName}
          onChange={(e) => {
            setCreateName(e.target.value);
            if (createErrors.name) setCreateErrors({});
          }}
          placeholder="Enter your name"
          maxLength={32}
          autoComplete="off"
          style={styles.input}
          aria-invalid={!!createErrors.name}
          aria-describedby={createErrors.name ? "create-name-error" : undefined}
        />
        {createErrors.name && (
          <p id="create-name-error" style={styles.error} role="alert">
            {createErrors.name}
          </p>
        )}

        <button type="submit" style={styles.button}>
          Create Room
        </button>
      </form>

      {/* Divider */}
      <div style={styles.divider}>
        <span style={styles.dividerText}>or</span>
      </div>

      {/* Join Room Section */}
      <form onSubmit={handleJoinRoom} style={styles.section} noValidate>
        <h2 style={styles.sectionTitle}>Join Room</h2>

        <label htmlFor="join-name" style={styles.label}>
          Your Name
        </label>
        <input
          id="join-name"
          type="text"
          value={joinName}
          onChange={(e) => {
            setJoinName(e.target.value);
            if (joinErrors.name) setJoinErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder="Enter your name"
          maxLength={20}
          autoComplete="off"
          style={styles.input}
          aria-invalid={!!joinErrors.name}
          aria-describedby={joinErrors.name ? "join-name-error" : undefined}
        />
        {joinErrors.name && (
          <p id="join-name-error" style={styles.error} role="alert">
            {joinErrors.name}
          </p>
        )}

        <label htmlFor="join-room-code" style={styles.label}>
          Room Code
        </label>
        <input
          id="join-room-code"
          type="text"
          value={roomCode}
          onChange={(e) => {
            setRoomCode(e.target.value.toUpperCase());
            if (joinErrors.roomCode) setJoinErrors((prev) => ({ ...prev, roomCode: undefined }));
          }}
          placeholder="e.g. ABC123"
          maxLength={6}
          autoComplete="off"
          style={styles.input}
          aria-invalid={!!joinErrors.roomCode}
          aria-describedby={joinErrors.roomCode ? "join-room-code-error" : undefined}
        />
        {joinErrors.roomCode && (
          <p id="join-room-code-error" style={styles.error} role="alert">
            {joinErrors.roomCode}
          </p>
        )}

        <button type="submit" style={styles.button}>
          Join Room
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 16px",
    maxWidth: "480px",
    margin: "0 auto",
    minHeight: "100vh",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "var(--accent)",
    marginBottom: "32px",
  },
  toast: {
    width: "100%",
    padding: "12px 16px",
    marginBottom: "16px",
    borderRadius: "8px",
    backgroundColor: "var(--danger)",
    color: "#fff",
    fontSize: "0.875rem",
    textAlign: "center" as const,
  },
  section: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: "4px",
  },
  label: {
    fontSize: "0.875rem",
    color: "var(--text-secondary)",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid var(--bg-tertiary)",
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-primary)",
    outline: "none",
  },
  error: {
    fontSize: "0.8rem",
    color: "var(--danger)",
    marginTop: "-4px",
  },
  button: {
    width: "100%",
    minHeight: "44px",
    minWidth: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
    marginTop: "4px",
  },
  divider: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "24px 0",
  },
  dividerText: {
    flex: 1,
    textAlign: "center" as const,
    color: "var(--text-secondary)",
    fontSize: "0.875rem",
    position: "relative" as const,
  },
};
