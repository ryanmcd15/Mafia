import React from "react";
import { PlatformPlayer } from "../store/types";
import { MafiaGame } from "./mafia/MafiaGame";
import { TruthOrDareGame } from "./truth-or-dare/TruthOrDareGame";
import { SpyfallGame } from "./spyfall/SpyfallGame";
import { TwoTruthsOneLieGame } from "./two-truths-one-lie/TwoTruthsOneLieGame";
import { BattleShitsGame } from "./battle-shits/BattleShitsGame";

export interface GameUIProps {
  roomCode: string;
  players: PlatformPlayer[];
  myPlayerId: string;
  isHost: boolean;
}

export interface GameUIModule {
  id: string;
  component: React.ComponentType<GameUIProps>;
  icon?: string;
}

const gameUIModules: GameUIModule[] = [
  { id: "mafia", component: MafiaGame, icon: "🔫" },
  { id: "truth-or-dare", component: TruthOrDareGame, icon: "🎯" },
  { id: "two-truths-one-lie", component: TwoTruthsOneLieGame, icon: "🤥" },
  { id: "spyfall", component: SpyfallGame, icon: "🕵️" },
  { id: "battle-shits", component: BattleShitsGame, icon: "💩" },
];

const registry = new Map<string, GameUIModule>(
  gameUIModules.map((m) => [m.id, m])
);

export function getGameUI(gameId: string): GameUIModule | undefined {
  return registry.get(gameId);
}

export { registry, gameUIModules };
