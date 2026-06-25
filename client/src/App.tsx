import React from "react";
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
      <GameContent />
    </GameProvider>
  );
}

export default App;
