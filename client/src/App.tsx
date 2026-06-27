import React, { useEffect, useRef, useState } from "react";
import {
  PlatformProvider,
  PlatformConnectionLostModal,
  usePlatformStore,
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
      <ErrorToast />
      <PhaseTransition>
        <PlatformContent />
      </PhaseTransition>
    </PlatformProvider>
  );
}

export default App;
