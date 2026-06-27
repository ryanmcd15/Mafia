import React, { useState } from "react";
import { createRoom, joinRoom } from "../store/platformStore";

const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

export function LandingPage(): React.JSX.Element {
  // Create Room state
  const [createName, setCreateName] = useState("");
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [createServerError, setCreateServerError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Join Room state
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [joinNameError, setJoinNameError] = useState<string | null>(null);
  const [joinServerError, setJoinServerError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  function validateCreateName(value: string): boolean {
    if (value.length === 0) {
      setCreateNameError("Name is required");
      return false;
    }
    if (value.length > 32) {
      setCreateNameError("Name must be 32 characters or fewer");
      return false;
    }
    setCreateNameError(null);
    return true;
  }

  function validateJoinCode(value: string): boolean {
    if (value.length === 0) {
      setJoinCodeError("Room code is required");
      return false;
    }
    if (!ROOM_CODE_REGEX.test(value)) {
      setJoinCodeError("Room code must be 6 uppercase alphanumeric characters");
      return false;
    }
    setJoinCodeError(null);
    return true;
  }

  function validateJoinName(value: string): boolean {
    if (value.length === 0) {
      setJoinNameError("Name is required");
      return false;
    }
    if (value.length > 20) {
      setJoinNameError("Name must be 20 characters or fewer");
      return false;
    }
    setJoinNameError(null);
    return true;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateServerError(null);

    const nameValid = validateCreateName(createName.trim());
    if (!nameValid) return;

    setCreateLoading(true);
    try {
      const result = await createRoom(createName.trim());
      if (!result.success) {
        setCreateServerError(result.error ?? "Failed to create room");
      }
    } catch {
      setCreateServerError("Connection error. Please try again.");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoinServerError(null);

    const codeValid = validateJoinCode(joinCode.trim().toUpperCase());
    const nameValid = validateJoinName(joinName.trim());
    if (!codeValid || !nameValid) return;

    setJoinLoading(true);
    try {
      const result = await joinRoom(joinCode.trim().toUpperCase(), joinName.trim());
      if (!result.success) {
        setJoinServerError(result.error ?? "Failed to join room");
      }
    } catch {
      setJoinServerError("Connection error. Please try again.");
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Party Games</h1>
        <p style={styles.subtitle}>Create or join a room to get started</p>
      </div>

      {/* Create Room Section */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Create Room</h2>
        <form onSubmit={handleCreate} noValidate>
          <div style={styles.fieldGroup}>
            <label htmlFor="create-name" style={styles.label}>
              Your Name
            </label>
            <input
              id="create-name"
              type="text"
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                if (createNameError) validateCreateName(e.target.value.trim());
              }}
              onBlur={() => validateCreateName(createName.trim())}
              placeholder="Enter your name"
              maxLength={32}
              autoComplete="off"
              style={styles.input}
              aria-describedby={createNameError ? "create-name-error" : undefined}
              aria-invalid={!!createNameError}
            />
            {createNameError && (
              <p id="create-name-error" style={styles.errorText} role="alert">
                {createNameError}
              </p>
            )}
          </div>

          {createServerError && (
            <p style={styles.serverError} role="alert">
              {createServerError}
            </p>
          )}

          <button
            type="submit"
            disabled={createLoading}
            style={{
              ...styles.button,
              opacity: createLoading ? 0.7 : 1,
            }}
          >
            {createLoading ? "Creating…" : "Create"}
          </button>
        </form>
      </div>

      {/* Divider */}
      <div style={styles.divider}>
        <span style={styles.dividerText}>or</span>
      </div>

      {/* Join Room Section */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Join Room</h2>
        <form onSubmit={handleJoin} noValidate>
          <div style={styles.fieldGroup}>
            <label htmlFor="join-code" style={styles.label}>
              Room Code
            </label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setJoinCode(val);
                if (joinCodeError) validateJoinCode(val.trim());
              }}
              onBlur={() => validateJoinCode(joinCode.trim().toUpperCase())}
              placeholder="e.g. ABC123"
              maxLength={6}
              autoComplete="off"
              style={{
                ...styles.input,
                textTransform: "uppercase",
                letterSpacing: "2px",
              }}
              aria-describedby={joinCodeError ? "join-code-error" : undefined}
              aria-invalid={!!joinCodeError}
            />
            {joinCodeError && (
              <p id="join-code-error" style={styles.errorText} role="alert">
                {joinCodeError}
              </p>
            )}
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="join-name" style={styles.label}>
              Your Name
            </label>
            <input
              id="join-name"
              type="text"
              value={joinName}
              onChange={(e) => {
                setJoinName(e.target.value);
                if (joinNameError) validateJoinName(e.target.value.trim());
              }}
              onBlur={() => validateJoinName(joinName.trim())}
              placeholder="Enter your name"
              maxLength={20}
              autoComplete="off"
              style={styles.input}
              aria-describedby={joinNameError ? "join-name-error" : undefined}
              aria-invalid={!!joinNameError}
            />
            {joinNameError && (
              <p id="join-name-error" style={styles.errorText} role="alert">
                {joinNameError}
              </p>
            )}
          </div>

          {joinServerError && (
            <p style={styles.serverError} role="alert">
              {joinServerError}
            </p>
          )}

          <button
            type="submit"
            disabled={joinLoading}
            style={{
              ...styles.button,
              opacity: joinLoading ? 0.7 : 1,
            }}
          >
            {joinLoading ? "Joining…" : "Join"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "var(--bg-primary, #1a1a2e)",
    color: "var(--text-primary, #ffffff)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 16px",
    boxSizing: "border-box",
  },
  header: {
    textAlign: "center",
    marginBottom: "32px",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 700,
    margin: 0,
    color: "var(--text-primary, #ffffff)",
  },
  subtitle: {
    fontSize: "1rem",
    color: "var(--text-secondary, #b0b0b0)",
    marginTop: "8px",
  },
  card: {
    backgroundColor: "var(--bg-secondary, #2d2d44)",
    borderRadius: "12px",
    padding: "24px",
    width: "100%",
    maxWidth: "400px",
    boxSizing: "border-box",
  },
  cardTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    margin: "0 0 16px 0",
    color: "var(--text-primary, #ffffff)",
  },
  fieldGroup: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "var(--text-secondary, #b0b0b0)",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    minHeight: "44px",
    padding: "10px 12px",
    fontSize: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    color: "var(--text-primary, #ffffff)",
    outline: "none",
    boxSizing: "border-box",
  },
  errorText: {
    fontSize: "0.8rem",
    color: "var(--danger, #ff4757)",
    margin: "4px 0 0 0",
  },
  serverError: {
    fontSize: "0.875rem",
    color: "var(--danger, #ff4757)",
    backgroundColor: "rgba(255, 71, 87, 0.1)",
    borderRadius: "6px",
    padding: "8px 12px",
    marginBottom: "12px",
  },
  button: {
    width: "100%",
    minHeight: "44px",
    padding: "12px 24px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "8px",
    border: "none",
    backgroundColor: "var(--accent, #6c63ff)",
    color: "#ffffff",
    cursor: "pointer",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    maxWidth: "400px",
    margin: "24px 0",
  },
  dividerText: {
    flex: 1,
    textAlign: "center",
    fontSize: "0.875rem",
    color: "var(--text-secondary, #b0b0b0)",
  },
};
