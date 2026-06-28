import React from "react";
import { GameProvider, useGameStore } from "../../store";
import { GamePhase, Role } from "../../types";
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

/** Color for role label in the status bar */
function getRoleColor(role: Role | null): string {
  switch (role) {
    case Role.Killer:
      return "#ff4757";
    case Role.Medic:
      return "#2ed573";
    case Role.Civilian:
    default:
      return "#b0b0b0";
  }
}

const statusBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 16px",
  background: "rgba(0, 0, 0, 0.4)",
  fontSize: "13px",
  fontWeight: 500,
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
};

/**
 * Internal router that reads Mafia phase state and renders the correct view.
 * Eliminated players always see SpectatorView.
 */
function MafiaRouter(): React.JSX.Element {
  const { phase, myPlayer, players, role } = useGameStore();
  const aliveCount = players.filter((p) => p.isAlive).length;

  // Show status bar during active gameplay (not during role reveal, game over, or when dead)
  const showStatusBar =
    phase != null &&
    phase !== GamePhase.RoleReveal &&
    phase !== GamePhase.GameOver &&
    myPlayer?.isAlive;

  // Eliminated players see the spectator view regardless of current phase
  if (myPlayer && !myPlayer.isAlive) {
    return <SpectatorView />;
  }

  const phaseView = (() => {
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
  })();

  return (
    <>
      {showStatusBar && (
        <div style={statusBarStyle} aria-label="Game status">
          <span style={{ color: "var(--text-secondary, #b0b0b0)" }}>
            {aliveCount} alive
          </span>
          <span style={{ color: getRoleColor(role) }}>
            You: {role ?? "???"}
          </span>
        </div>
      )}
      {phaseView}
    </>
  );
}

export default MafiaGame;
