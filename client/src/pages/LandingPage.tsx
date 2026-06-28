import React, { useState, useEffect } from "react";
import { createRoom, joinRoom } from "../store/platformStore";

const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

/* ─── CSS Keyframes (injected once) ─────────────────────────────────────── */
const KEYFRAMES_ID = "landing-keyframes";
function injectKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes landing-fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes landing-float1 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(12px, -18px) rotate(5deg); }
      50% { transform: translate(-8px, -30px) rotate(-3deg); }
      75% { transform: translate(15px, -12px) rotate(4deg); }
    }
    @keyframes landing-float2 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-15px, -10px) rotate(-5deg); }
      50% { transform: translate(10px, -25px) rotate(6deg); }
      75% { transform: translate(-12px, -15px) rotate(-2deg); }
    }
    @keyframes landing-float3 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(8px, -22px) rotate(3deg); }
      50% { transform: translate(-14px, -10px) rotate(-6deg); }
      75% { transform: translate(6px, -28px) rotate(2deg); }
    }
    @keyframes landing-float4 {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      25% { transform: translate(-10px, -14px) rotate(-4deg); }
      50% { transform: translate(12px, -22px) rotate(5deg); }
      75% { transform: translate(-8px, -8px) rotate(-3deg); }
    }
    @keyframes landing-glow {
      0%, 100% { box-shadow: 0 6px 24px rgba(99, 102, 241, 0.35); }
      50% { box-shadow: 0 8px 40px rgba(139, 92, 246, 0.55), 0 0 60px rgba(99, 102, 241, 0.2); }
    }
    @keyframes landing-pulse-border {
      0%, 100% { border-color: rgba(99, 102, 241, 0.3); }
      50% { border-color: rgba(139, 92, 246, 0.6); }
    }
  `;
  document.head.appendChild(style);
}

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

  useEffect(() => {
    injectKeyframes();
  }, []);

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
      {/* Floating decorative emojis */}
      <div style={styles.floatingEmojis} aria-hidden="true">
        <span style={{ ...styles.floatingEmoji, ...styles.float1 }}>🎲</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float2 }}>🎯</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float3 }}>🎭</span>
        <span style={{ ...styles.floatingEmoji, ...styles.float4 }}>🕹️</span>
      </div>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>🎮 Party Games</h1>
        <p style={styles.tagline}>Game night, anywhere</p>
      </div>

      {/* Create Room Section */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>✨ Create Room</h2>
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
              placeholder="What should we call you?"
              maxLength={32}
              autoComplete="off"
              style={styles.input}
              aria-describedby={createNameError ? "create-name-error" : undefined}
              aria-invalid={!!createNameError}
            />
            {createNameError && (
              <div id="create-name-error" style={styles.errorBox} role="alert">
                <span style={styles.errorIcon}>⚠️</span>
                <span>{createNameError}</span>
              </div>
            )}
          </div>

          {createServerError && (
            <div style={styles.errorBox} role="alert">
              <span style={styles.errorIcon}>⚠️</span>
              <span>{createServerError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={createLoading}
            style={{
              ...styles.createButton,
              opacity: createLoading ? 0.7 : 1,
              cursor: createLoading ? "not-allowed" : "pointer",
              animation: createLoading ? "none" : "landing-glow 2.5s ease-in-out infinite",
            }}
          >
            {createLoading ? "Creating…" : "✨ Create Room"}
          </button>
        </form>
      </div>

      {/* Divider */}
      <div style={styles.divider}>
        <div style={styles.dividerLine} />
        <span style={styles.dividerPill}>or</span>
        <div style={styles.dividerLine} />
      </div>

      {/* Join Room Section */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>🚀 Join Room</h2>
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
              placeholder="ENTER CODE"
              maxLength={6}
              autoComplete="off"
              style={styles.roomCodeInput}
              aria-describedby={joinCodeError ? "join-code-error" : undefined}
              aria-invalid={!!joinCodeError}
            />
            {joinCodeError && (
              <div id="join-code-error" style={styles.errorBox} role="alert">
                <span style={styles.errorIcon}>⚠️</span>
                <span>{joinCodeError}</span>
              </div>
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
              placeholder="Who's joining the party?"
              maxLength={20}
              autoComplete="off"
              style={styles.input}
              aria-describedby={joinNameError ? "join-name-error" : undefined}
              aria-invalid={!!joinNameError}
            />
            {joinNameError && (
              <div id="join-name-error" style={styles.errorBox} role="alert">
                <span style={styles.errorIcon}>⚠️</span>
                <span>{joinNameError}</span>
              </div>
            )}
          </div>

          {joinServerError && (
            <div style={styles.errorBox} role="alert">
              <span style={styles.errorIcon}>⚠️</span>
              <span>{joinServerError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={joinLoading}
            style={{
              ...styles.joinButton,
              opacity: joinLoading ? 0.7 : 1,
              cursor: joinLoading ? "not-allowed" : "pointer",
            }}
          >
            {joinLoading ? "Joining…" : "🚀 Join Room"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── STYLES ─────────────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0f0c29 0%, #1a1a2e 30%, #16213e 60%, #0f3460 100%)",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 16px",
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  // ─── FLOATING EMOJIS ─────────────────────────────────────────────
  floatingEmojis: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "none",
    overflow: "hidden",
  },
  floatingEmoji: {
    position: "absolute",
    fontSize: "2rem",
    opacity: 0.15,
    userSelect: "none",
  },
  float1: {
    top: "8%",
    left: "8%",
    animation: "landing-float1 8s ease-in-out infinite",
  },
  float2: {
    top: "15%",
    right: "10%",
    animation: "landing-float2 10s ease-in-out infinite",
  },
  float3: {
    bottom: "20%",
    left: "12%",
    animation: "landing-float3 9s ease-in-out infinite",
  },
  float4: {
    bottom: "30%",
    right: "8%",
    animation: "landing-float4 11s ease-in-out infinite",
  },

  // ─── HEADER ───────────────────────────────────────────────────────
  header: {
    textAlign: "center",
    marginBottom: "36px",
    animation: "landing-fadeInUp 0.5s ease-out",
    position: "relative",
    zIndex: 1,
  },
  title: {
    fontSize: "2.8rem",
    fontWeight: 800,
    margin: 0,
    letterSpacing: "-0.03em",
    background: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 40%, #c4b5fd 70%, #f0abfc 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    filter: "drop-shadow(0 2px 12px rgba(99, 102, 241, 0.4))",
  },
  tagline: {
    fontSize: "1.1rem",
    color: "#94a3b8",
    marginTop: "10px",
    fontWeight: 400,
    letterSpacing: "0.02em",
  },

  // ─── CARDS ────────────────────────────────────────────────────────
  card: {
    width: "100%",
    maxWidth: "420px",
    padding: "28px",
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    borderRadius: "20px",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    boxSizing: "border-box",
    animation: "landing-fadeInUp 0.6s ease-out",
    position: "relative",
    zIndex: 1,
  },
  cardTitle: {
    fontSize: "1.35rem",
    fontWeight: 700,
    margin: "0 0 20px 0",
    color: "#e2e8f0",
    letterSpacing: "-0.01em",
  },

  // ─── FORM FIELDS ──────────────────────────────────────────────────
  fieldGroup: {
    marginBottom: "18px",
  },
  label: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  input: {
    width: "100%",
    minHeight: "52px",
    padding: "14px 16px",
    fontSize: "1rem",
    borderRadius: "12px",
    border: "2px solid rgba(99, 102, 241, 0.2)",
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    color: "#f1f5f9",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.25s ease, box-shadow 0.25s ease",
    fontFamily: "inherit",
  },
  roomCodeInput: {
    width: "100%",
    minHeight: "52px",
    padding: "14px 16px",
    fontSize: "1.3rem",
    borderRadius: "12px",
    border: "2px solid rgba(99, 102, 241, 0.2)",
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    color: "#a5b4fc",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.25s ease, box-shadow 0.25s ease",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    letterSpacing: "6px",
    textAlign: "center",
    textTransform: "uppercase",
    fontWeight: 700,
  },

  // ─── ERROR DISPLAY ────────────────────────────────────────────────
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "0.85rem",
    color: "#fca5a5",
    fontWeight: 500,
    padding: "10px 14px",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: "10px",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    marginTop: "8px",
    marginBottom: "12px",
  },
  errorIcon: {
    fontSize: "0.9rem",
    flexShrink: 0,
  },

  // ─── BUTTONS ──────────────────────────────────────────────────────
  createButton: {
    width: "100%",
    minHeight: "54px",
    padding: "16px 24px",
    fontSize: "1.1rem",
    fontWeight: 700,
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%)",
    color: "#ffffff",
    boxShadow: "0 6px 24px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease",
    letterSpacing: "0.02em",
  },
  joinButton: {
    width: "100%",
    minHeight: "54px",
    padding: "16px 24px",
    fontSize: "1.1rem",
    fontWeight: 700,
    borderRadius: "14px",
    border: "none",
    background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 60%, #8b5cf6 100%)",
    color: "#ffffff",
    boxShadow: "0 6px 24px rgba(14, 165, 233, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
    transition: "transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease",
    letterSpacing: "0.02em",
  },

  // ─── DIVIDER ──────────────────────────────────────────────────────
  divider: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    maxWidth: "420px",
    margin: "28px 0",
    gap: "16px",
    position: "relative",
    zIndex: 1,
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "linear-gradient(90deg, transparent 0%, rgba(148, 163, 184, 0.3) 50%, transparent 100%)",
  },
  dividerPill: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#818cf8",
    padding: "6px 18px",
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    borderRadius: "999px",
    border: "1px solid rgba(99, 102, 241, 0.25)",
    letterSpacing: "0.05em",
  },
};
