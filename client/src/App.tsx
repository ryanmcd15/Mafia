import React, { useEffect, useRef, useState } from "react";
import {
  PlatformProvider,
  PlatformConnectionLostModal,
  usePlatformStore,
  returnToGameSelection,
} from "./store/platformStore";
import { PlatformPhase } from "./store/types";
import { getGameUI, GameUIProps } from "./games/registry";
import { LandingPage } from "./pages/LandingPage";
import { GameSelectionScreen } from "./pages/GameSelectionScreen";
import { GameResultsScreen } from "./pages/GameResultsScreen";

function ErrorToast(): React.JSX.Element | null {
  const { error } = usePlatformStore();

  if (!error) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--danger, #ff4757)",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: 500,
        zIndex: 10000,
        maxWidth: "90%",
        textAlign: "center",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      {error}
    </div>
  );
}

/** Pause button + modal — only shown during ActiveGame phase */
function PauseMenu(): React.JSX.Element | null {
  const { platformPhase, myPlayer } = usePlatformStore();
  const [open, setOpen] = useState(false);
  const isHost = myPlayer?.isHost ?? false;

  if (platformPhase !== PlatformPhase.ActiveGame) return null;

  return (
    <>
      {/* Pause button — top-right corner */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Pause game"
        style={{
          position: "fixed",
          top: "12px",
          right: "12px",
          zIndex: 9000,
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "none",
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          color: "#ffffff",
          fontSize: "18px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        ⏸
      </button>

      {/* Pause modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game paused"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 9500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, #1a1a2e, #16213e)",
              border: "1px solid rgba(148,163,184,0.15)",
              borderRadius: "20px",
              padding: "36px 28px",
              maxWidth: "320px",
              width: "90%",
              textAlign: "center",
              boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>⏸</div>
            <h2 style={{
              fontSize: "1.4rem",
              fontWeight: 800,
              color: "#e2e8f0",
              margin: "0 0 6px",
            }}>
              Game Paused
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "24px" }}>
              {isHost ? "What would you like to do?" : "Waiting for host..."}
            </p>

            {/* Resume */}
            <button
              onClick={() => setOpen(false)}
              style={{
                width: "100%",
                minHeight: "48px",
                marginBottom: "12px",
                padding: "14px 24px",
                fontSize: "1rem",
                fontWeight: 700,
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff",
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
              }}
            >
              ▶ Resume Game
            </button>

            {/* Back to games list — host only */}
            {isHost && (
              <button
                onClick={() => {
                  setOpen(false);
                  returnToGameSelection();
                }}
                style={{
                  width: "100%",
                  minHeight: "48px",
                  padding: "14px 24px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  borderRadius: "12px",
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.08)",
                  color: "#f87171",
                  cursor: "pointer",
                }}
              >
                🎮 Back to Games List
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Wraps children with a fade-to-black transition on phase changes */
function PhaseTransition({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { platformPhase } = usePlatformStore();
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [fading, setFading] = useState(false);
  const prevPhaseRef = useRef(platformPhase);

  useEffect(() => {
    if (prevPhaseRef.current === platformPhase) {
      setDisplayedChildren(children);
      return;
    }

    setFading(true);
    const timer = setTimeout(() => {
      setDisplayedChildren(children);
      setFading(false);
      prevPhaseRef.current = platformPhase;
    }, 400);

    return () => clearTimeout(timer);
  }, [platformPhase, children]);

  return (
    <div
      style={{
        opacity: fading ? 0 : 1,
        transition: "opacity 0.4s ease-in-out",
        minHeight: "100vh",
      }}
    >
      {displayedChildren}
    </div>
  );
}

function PlatformContent(): React.JSX.Element {
  const { roomCode, platformPhase, activeGameId, players, myPlayer } =
    usePlatformStore();

  // No room — show landing
  if (!roomCode) {
    return <LandingPage />;
  }

  // Game selection or lobby phase
  if (
    platformPhase === PlatformPhase.GameSelection ||
    platformPhase === PlatformPhase.Lobby
  ) {
    return <GameSelectionScreen />;
  }

  // Active game — render the game module UI from registry
  if (platformPhase === PlatformPhase.ActiveGame && activeGameId) {
    const gameModule = getGameUI(activeGameId);
    if (gameModule) {
      const gameUIProps: GameUIProps = {
        roomCode,
        players,
        myPlayerId: myPlayer?.id ?? "",
        isHost: myPlayer?.isHost ?? false,
      };
      const GameComponent = gameModule.component;
      return <GameComponent {...gameUIProps} />;
    }
  }

  // Game results
  if (platformPhase === PlatformPhase.GameResults) {
    return <GameResultsScreen />;
  }

  // Default fallback
  return <LandingPage />;
}

function App(): React.JSX.Element {
  return (
    <PlatformProvider>
      <PlatformConnectionLostModal />
      <PauseMenu />
      <ErrorToast />
      <PhaseTransition>
        <PlatformContent />
      </PhaseTransition>
    </PlatformProvider>
  );
}

export default App;
