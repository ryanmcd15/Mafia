import React, { useEffect, useRef, useState } from "react";
import { ConnectionLostModal, GameProvider, useGameStore } from "./store";
import { HomeView } from "./HomeView";
import { LobbyView } from "./LobbyView";
import { RoleRevealView } from "./RoleRevealView";
import { NightView } from "./NightView";
import { MorningView } from "./MorningView";
import { DiscussionView } from "./DiscussionView";
import { VotingView } from "./VotingView";
import { ResultsView } from "./ResultsView";
import { GameOverView } from "./GameOverView";
import { SpectatorView } from "./SpectatorView";
import { GamePhase } from "./types";

function ErrorToast(): React.JSX.Element | null {
  const { error } = useGameStore();

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
  const { phase } = useGameStore();
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [fading, setFading] = useState(false);
  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    // Skip fade for initial render or if phase hasn't changed
    if (prevPhaseRef.current === phase) {
      setDisplayedChildren(children);
      return;
    }

    // Phase changed — fade out, swap content, fade in
    setFading(true);
    const timer = setTimeout(() => {
      setDisplayedChildren(children);
      setFading(false);
      prevPhaseRef.current = phase;
    }, 400); // fade-out duration

    return () => clearTimeout(timer);
  }, [phase, children]);

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

function GameContent(): React.JSX.Element {
  const { roomCode, phase, myPlayer } = useGameStore();

  if (!roomCode) {
    return <HomeView />;
  }

  if (phase === GamePhase.Lobby || phase === null) {
    return <LobbyView />;
  }

  // Eliminated players see SpectatorView for all phases except GameOver
  if (myPlayer?.isAlive === false && phase !== GamePhase.GameOver) {
    return <SpectatorView />;
  }

  switch (phase) {
    case GamePhase.RoleReveal:
      return <RoleRevealView />;
    case GamePhase.Night:
      return <NightView />;
    case GamePhase.Morning:
      return <MorningView />;
    case GamePhase.Discussion:
      return <DiscussionView />;
    case GamePhase.Voting:
      return <VotingView />;
    case GamePhase.Results:
      return <ResultsView />;
    case GamePhase.GameOver:
      return <GameOverView />;
    default:
      return <LobbyView />;
  }
}

function App(): React.JSX.Element {
  return (
    <GameProvider>
      <ConnectionLostModal />
      <ErrorToast />
      <PhaseTransition>
        <GameContent />
      </PhaseTransition>
    </GameProvider>
  );
}

export default App;
