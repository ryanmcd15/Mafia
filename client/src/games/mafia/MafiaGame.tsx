import React from "react";
import { GameProvider, useGameStore } from "../../store";
import { GamePhase } from "../../types";
import { RoleRevealView } from "../../RoleRevealView";
import { NightView } from "../../NightView";
import { MorningView } from "../../MorningView";
import { DiscussionView } from "../../DiscussionView";
import { VotingView } from "../../VotingView";
import { ResultsView } from "../../ResultsView";
import { GameOverView } from "../../GameOverView";
import { SpectatorView } from "../../SpectatorView";
import type { GameUIProps } from "../registry";

/**
 * MafiaGame — the top-level Mafia game UI component registered with the platform.
 *
 * It wraps the existing GameProvider (which manages Mafia-specific socket events
 * and state via useGameStore) and routes to the appropriate phase sub-view.
 *
 * Eliminated players are shown the SpectatorView regardless of phase.
 */
export const MafiaGame: React.FC<GameUIProps> = (_props) => {
  return (
    <GameProvider>
      <MafiaRouter />
    </GameProvider>
  );
};

/**
 * Internal router that reads Mafia phase state and renders the correct view.
 * Eliminated players always see SpectatorView.
 */
function MafiaRouter(): React.JSX.Element {
  const { phase, myPlayer } = useGameStore();

  // Eliminated players see the spectator view regardless of current phase
  if (myPlayer && !myPlayer.isAlive) {
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
      return (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
          Waiting for game to start...
        </div>
      );
  }
}

export default MafiaGame;
