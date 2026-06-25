import { useEffect, useState } from "react";
import { useGameStore } from "./store";
import socket from "./socket";

const SEGMENT_DELAY_MS = 5500;

export function MorningView(): React.JSX.Element {
  const { narration, roomCode, medicFeedback } = useGameStore();
  const segments = narration?.segments ?? [];
  const [visibleCount, setVisibleCount] = useState(0);
  const [flashType, setFlashType] = useState<"kill" | "save" | null>(null);

  const wasKill = narration?.eliminatedPlayerId !== null && narration?.eliminatedPlayerId !== undefined;
  const wasSaved = narration?.wasSaved === true;

  useEffect(() => {
    if (segments.length === 0) return;

    // Show first segment immediately
    setVisibleCount(1);

    let current = 1;
    const timer = setInterval(() => {
      current++;
      if (current <= segments.length) {
        setVisibleCount(current);

        // Trigger flash on the final segment
        if (current === segments.length) {
          if (wasKill) {
            setFlashType("kill");
          } else if (wasSaved) {
            setFlashType("save");
          }
          // Clear flash after animation completes
          setTimeout(() => setFlashType(null), 1200);
        }
      } else {
        // All segments displayed, final delay elapsed — emit complete
        clearInterval(timer);
        socket.emit("narrationComplete", { roomCode });
      }
    }, SEGMENT_DELAY_MS);

    return () => clearInterval(timer);
  }, [segments.length]);

  if (segments.length === 0) {
    return (
      <div style={containerStyle}>
        <p style={segmentStyle}>The sun rises...</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Screen flash overlay */}
      {flashType && (
        <div
          style={{
            ...flashOverlayStyle,
            backgroundColor:
              flashType === "kill"
                ? "rgba(255, 50, 50, 0.35)"
                : "rgba(50, 255, 100, 0.25)",
            animation: "flashPulse 1.2s ease-out forwards",
          }}
        />
      )}

      {segments.slice(0, visibleCount).map((segment, i) => (
        <p
          key={i}
          style={{
            ...segmentStyle,
            animation: "fadeIn 0.6s ease-in forwards",
            opacity: 0,
          }}
        >
          {segment}
        </p>
      ))}

      {/* Private medic feedback whisper */}
      {medicFeedback && visibleCount >= segments.length && (
        <p
          style={{
            fontSize: "0.95rem",
            color: "var(--success, #2ed573)",
            fontStyle: "italic",
            marginTop: "24px",
            padding: "12px 20px",
            borderRadius: "8px",
            backgroundColor: "rgba(46, 213, 115, 0.1)",
            border: "1px solid rgba(46, 213, 115, 0.3)",
            animation: "fadeIn 0.6s ease-in forwards",
            opacity: 0,
            maxWidth: "320px",
            textAlign: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          🩺 {medicFeedback}
        </p>
      )}
      <style>{keyframes}</style>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  padding: "24px 16px",
  gap: "20px",
  textAlign: "center",
  position: "relative",
  overflow: "hidden",
};

const segmentStyle: React.CSSProperties = {
  fontSize: "1.25rem",
  lineHeight: 1.6,
  color: "var(--text-primary)",
  maxWidth: "360px",
  position: "relative",
  zIndex: 1,
};

const flashOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
};

const keyframes = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes flashPulse {
  0%   { opacity: 0; }
  15%  { opacity: 1; }
  40%  { opacity: 0.7; }
  60%  { opacity: 0.9; }
  100% { opacity: 0; }
}
`;
