# Implementation Plan: Secret Admirer

## Overview

Implement the Secret Admirer party game as a `GameModule` on the Party Games Platform. The server module handles cycle generation, prompt selection, round management, voting, guessing, scoring, and awards. The client renders phase-specific UI components. Follow the same patterns as `BattleShitsModule`, `TwoTruthsOneLieModule`, and `SpyfallModule`.

## Tasks

- [x] 1. Create server-side types and shared interfaces
  - [x] 1.1 Create `server/src/games/secret-admirer/types.ts`
    - Define `SpiceLevel`, `SecretAdmirerConfig`, `GamePhase`, `RoundMessage`, `SecretAdmirerState`, `SecretAdmirerClientState`, `Award`, `LeaderboardEntry`, `ScoreUpdate`, `RevealData`
    - Define constants: `VALID_REACTION_EMOJIS`, `DEFAULT_CONFIG`, `MIN_ROUNDS`, `MAX_ROUNDS`, `MIN_TIMER`, `MAX_TIMER`, `TIMER_STEP`, `MAX_ANSWER_LENGTH`, `MAX_CUSTOM_PROMPT_LENGTH`
    - _Requirements: 2.2, 2.6, 2.7, 5.2, 6.1_

- [x] 2. Implement cycle generation algorithm
  - [x] 2.1 Create `server/src/games/secret-admirer/cycleGenerator.ts`
    - Implement `generateAdmirerCycle(playerIds: string[]): Map<string, string>` using Fisher-Yates shuffle to create a single Hamiltonian cycle
    - Implement `serializeCycle(cycle: Map<string, string>): object` and `deserializeCycle(data: object): Map<string, string>` for round-trip support
    - _Requirements: 3.1, 3.2, 3.3, 14.1, 14.2, 14.3_

  - [x] 2.2 Write property test for cycle structural invariants
    - **Property 1: Admirer Cycle structural invariants**
    - **Validates: Requirements 3.1, 3.2, 3.3, 14.2**

  - [x] 2.3 Write property test for cycle serialization round-trip
    - **Property 2: Admirer Cycle serialization round-trip**
    - **Validates: Requirements 14.1**

  - [x] 2.4 Write property test for cycle randomness
    - **Property 3: Admirer Cycle randomness**
    - **Validates: Requirements 14.3**

- [x] 3. Implement prompt pool
  - [x] 3.1 Create `server/src/games/secret-admirer/promptPool.ts`
    - Implement `PromptPool` class with `constructor(filePath)`, `validate()`, `getPrompt(spiceLevel, usedPrompts)`, `getFallbackPrompt(currentLevel, usedPrompts)`
    - Load and validate JSON prompt file structure (three keys, 100+ prompts per level, 1-280 chars each)
    - Implement spice level fallback logic: Mild → Medium → Hot → Mild
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 13.1, 13.2, 13.3, 13.4_

  - [x] 3.2 Write property test for prompt pool data validation
    - **Property 23: Prompt pool data validation**
    - **Validates: Requirements 13.2**

- [x] 4. Implement scoring and awards calculators
  - [x] 4.1 Create `server/src/games/secret-admirer/scoreCalculator.ts`
    - Implement `calculateRoundScores(votes, reactions)`: award 2 pts for most votes, 2 pts for most reactions, handle ties
    - Implement `calculateGuessScores(guesses, cycle)`: award 5 pts for correct guess
    - Implement `buildLeaderboard(scores, playerNames)`: sort descending by score, ties alphabetical
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 4.2 Create `server/src/games/secret-admirer/awardsCalculator.ts`
    - Implement `calculateAwards(gameData)`: Biggest Flirt, Most Mysterious, Best Compliment, Chaos Agent
    - Handle ties (award to all), omit Most Mysterious when all guesses correct
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 4.3 Write property test for community vote scoring with ties
    - **Property 17: Community vote scoring with ties**
    - **Validates: Requirements 7.4, 7.5, 7.6, 10.4**

  - [x] 4.4 Write property test for correct guess scoring
    - **Property 20: Correct guess scoring**
    - **Validates: Requirements 10.1**

  - [x] 4.5 Write property test for leaderboard sorting
    - **Property 21: Leaderboard sorting**
    - **Validates: Requirements 10.6**

  - [x] 4.6 Write property test for awards calculation correctness
    - **Property 22: Awards calculation correctness**
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 5. Checkpoint — Ensure pure function tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `SecretAdmirerModule` — config and game start
  - [x] 6.1 Create `server/src/games/secret-admirer/SecretAdmirerModule.ts` implementing `GameModule`
    - Implement `config` with `id: "secret-admirer"`, `name: "Secret Admirer"`, `minPlayers: 3`, `maxPlayers: 20`, description summarizing game premise (≤200 chars)
    - Implement `start(context)`: initialize state with default config, set phase to "config", emit `saPhaseChanged`
    - Implement `handleEvent` routing for `configure` and `startGame`
    - Implement `configure` handler: validate host-only, validate rounds (5-20), spice level, round timer (30-120, step 5), custom prompts toggle; reject invalid with error
    - Implement `startGame` handler: validate host-only, validate ≥3 players, generate Admirer_Cycle, send `saAssignment` per-player, transition to `roundActive`
    - _Requirements: 1.1, 1.3, 2.1–2.9, 3.1–3.8_

  - [x] 6.2 Write property test for rounds configuration validation
    - **Property 4: Rounds configuration validation**
    - **Validates: Requirements 2.2, 2.3**

  - [x] 6.3 Write property test for round timer configuration validation
    - **Property 5: Round timer configuration validation**
    - **Validates: Requirements 2.7**

  - [x] 6.4 Write property test for non-host configuration rejection
    - **Property 6: Non-host configuration rejection**
    - **Validates: Requirements 2.8**

- [x] 7. Implement round gameplay phase
  - [x] 7.1 Implement round start and answer submission
    - On round start: select prompt (custom if available, else from pool), emit `saRoundStarted` with prompt, round number, and timer
    - Implement `submitAnswer` handler: validate length (1-500), reject duplicates, store answer with target association
    - Implement `submitCustomPrompt` handler: validate custom prompts enabled, validate length (1-300)
    - Start round timer; on expiry or all answers received, end round
    - _Requirements: 4.1–4.8, 5.1–5.9_

  - [x] 7.2 Implement message delivery and reactions phase
    - On round end: deliver anonymous messages to targets in format "💌 Anonymous admirer says... [message]"
    - Record blank for disconnected/non-submitting players; deliver no message for blanks
    - Implement `react` handler: validate emoji in predefined set, reject duplicates, reject if not message recipient, reject if reaction window closed (60s)
    - Emit anonymous reaction counts (no reactor identity)
    - Start 60s reaction timer, then transition to voting
    - _Requirements: 5.6, 5.7, 5.8, 5.9, 6.1–6.6_

  - [x] 7.3 Write property test for answer length validation
    - **Property 10: Answer length validation**
    - **Validates: Requirements 5.2, 5.3**

  - [x] 7.4 Write property test for duplicate answer rejection
    - **Property 11: Duplicate answer rejection (idempotence)**
    - **Validates: Requirements 5.4**

  - [x] 7.5 Write property test for round completion on all submissions
    - **Property 12: Round completion on all submissions**
    - **Validates: Requirements 5.7**

  - [x] 7.6 Write property test for custom prompt length validation
    - **Property 9: Custom prompt length validation**
    - **Validates: Requirements 4.7**

  - [x] 7.7 Write property test for reaction emoji validation
    - **Property 14: Reaction emoji validation**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**

  - [x] 7.8 Write property test for reaction count anonymity
    - **Property 15: Reaction count anonymity**
    - **Validates: Requirements 6.2**

- [x] 8. Implement community voting phase
  - [x] 8.1 Implement voting logic
    - Present all non-blank messages for voting
    - Implement `submitVote` handler: allow one vote per player, reject self-votes
    - Start 30s voting timer; on expiry or all voted, tally and award points
    - Handle ties (all tied authors get 2 pts), no-votes scenario (0 pts)
    - Advance to next round or guessing phase
    - _Requirements: 7.1–7.6_

  - [x] 8.2 Write property test for voting constraints
    - **Property 16: Voting constraints**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 8.3 Write property test for non-blank messages presented for voting
    - **Property 18: Non-blank messages presented for voting**
    - **Validates: Requirements 7.1**

- [x] 9. Implement guessing and reveal phases
  - [x] 9.1 Implement guessing phase
    - Transition to guessing after all rounds complete, start 60s timer
    - Present each player with list of all other players as guess options
    - Implement `submitGuess` handler: validate not self, not non-existent, reject duplicates
    - On all guessed or timer expiry: calculate guess scores, transition to reveal
    - _Requirements: 8.1–8.8_

  - [x] 9.2 Implement reveal phase
    - Emit full reveal data: cycle assignments, guesses with correctness, all messages by round, statistics (most reactions, longest/shortest/fastest)
    - Calculate final scores, build leaderboard, calculate awards
    - Emit leaderboard and awards, signal game over to platform
    - _Requirements: 9.1–9.6, 10.1–10.6, 11.1–11.3, 12.1_

  - [x] 9.3 Write property test for guess validation
    - **Property 19: Guess validation**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

- [x] 10. Implement information hiding and state management
  - [x] 10.1 Implement `getState(socketId)` method
    - Return personalized state based on current phase
    - Never expose: other players' assignments, message authorship, other players' guesses (before reveal)
    - Include: own target name, current prompt, submission status, messages received, scores
    - _Requirements: 3.5, 5.6, 8.8_

  - [x] 10.2 Write property test for information hiding before reveal
    - **Property 7: Information hiding before reveal**
    - **Validates: Requirements 3.5, 5.6, 8.8**

- [x] 11. Implement disconnect handling and game cleanup
  - [x] 11.1 Implement disconnect and early termination logic
    - On disconnect mid-round: record blank submission, continue game
    - If connected players drop below 3: end game early, emit leaderboard with current scores
    - Implement `handlePlayerRemoval`: remove from cycle awareness, adjust timers
    - Implement `end()`: clear all timers, null out context
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

  - [x] 11.2 Write property test for prompt non-repetition and consistency
    - **Property 8: Prompt non-repetition and consistency**
    - **Validates: Requirements 4.2, 4.3**

- [x] 12. Checkpoint — Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create prompts.json data file
  - [x] 13.1 Create `server/src/games/secret-admirer/prompts.json`
    - Include at least 100 prompts per spice level ("mild", "medium", "hot")
    - Each prompt 1-280 characters, non-empty strings
    - Prompts should use `{target}` placeholder where applicable
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 14. Register the game module on the server
  - [x] 14.1 Register in server entry point
    - Import `SecretAdmirerModule` and register with the platform: `platform.registerGame("secret-admirer", () => new SecretAdmirerModule(), new SecretAdmirerModule().config)`
    - _Requirements: 1.1, 1.3_

- [x] 15. Create client-side types
  - [x] 15.1 Create `client/src/games/secret-admirer/types.ts`
    - Mirror server-side `SecretAdmirerClientState`, `GamePhase`, `SpiceLevel`, `SecretAdmirerConfig`, event payload shapes, `Award`, `RevealData`
    - _Requirements: 1.2_

- [x] 16. Implement client game component — config and round phases
  - [x] 16.1 Create `client/src/games/secret-admirer/SecretAdmirerGame.tsx`
    - Implement top-level component with phase-based rendering
    - Implement `ConfigPhase`: host-only configuration UI (rounds slider 5-20, spice level selector, custom prompts toggle, timer slider 30-120s step 5), "Start Game" button
    - Implement `RoundPhase`: display prompt, text input for answer (max 500 chars), submit button, timer countdown, submission progress indicator
    - If custom prompts enabled, show custom prompt input (max 300 chars)
    - _Requirements: 1.2, 2.1–2.9, 5.1–5.4_

  - [x] 16.2 Implement `MessagePhase` and `ReactionPhase`
    - Display received anonymous messages with "💌 Anonymous admirer says..." format
    - Render predefined reaction emoji buttons (❤️, 😂, 😍, 🔥, 👀, 💀)
    - Show aggregate reaction counts (no identities)
    - Disable reactions after 60s window closes
    - _Requirements: 5.8, 6.1–6.6_

- [x] 17. Implement client game component — voting, guessing, and reveal phases
  - [x] 17.1 Implement `VotingPhase`
    - Display all non-blank anonymous messages for the round
    - Allow one vote selection (disable own message)
    - Show voting timer countdown and vote progress
    - _Requirements: 7.1–7.6_

  - [x] 17.2 Implement `GuessingPhase`
    - Display list of all other players as selectable options
    - Allow one guess submission, show 60s timer
    - Disable after submission
    - _Requirements: 8.1–8.7_

  - [x] 17.3 Implement `RevealPhase`
    - Display cycle assignments with "❤️" connector
    - Show each player's guess with correct/incorrect indicator
    - Display all messages grouped by round with author revealed
    - Show statistics (most reactions, longest, shortest, fastest)
    - Display final leaderboard and awards
    - _Requirements: 9.1–9.6, 10.6, 11.1–11.3_

- [x] 18. Wire client socket events and register game UI
  - [x] 18.1 Wire socket events in `SecretAdmirerGame.tsx`
    - Register listeners for all `sa`-prefixed events: `saPhaseChanged`, `saAssignment`, `saRoundStarted`, `saAnswerReceived`, `saMessageDelivered`, `saReactionUpdated`, `saVotingStarted`, `saVoteReceived`, `saRoundResults`, `saGuessingStarted`, `saRevealData`
    - Emit game events: `configure`, `startGame`, `submitCustomPrompt`, `submitAnswer`, `react`, `submitVote`, `submitGuess`
    - Request initial state on mount for reconnection support
    - Clean up listeners on unmount
    - _Requirements: 1.2, 12.3_

  - [x] 18.2 Register in client game registry
    - In `client/src/games/registry.tsx`, import `SecretAdmirerGame` and add `{ id: "secret-admirer", component: SecretAdmirerGame, icon: "💌" }` to `gameUIModules` array
    - _Requirements: 1.2_

- [x] 19. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` and `vitest` following the pattern in `TwoTruthsOneLieModule.test.ts`
- All socket events use the `sa` prefix to avoid collisions with the platform's events
- The client should use the existing CSS variables and platform store patterns
- Prompts.json requires manual authoring of 300+ prompts — consider generating with AI assistance
- The `{target}` placeholder in prompts gets replaced with the target player's name at display time

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "15.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "3.2", "4.1", "4.2"] },
    { "id": 2, "tasks": ["4.3", "4.4", "4.5", "4.6", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 5, "tasks": ["7.7", "7.8", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 8, "tasks": ["10.2", "11.1"] },
    { "id": 9, "tasks": ["11.2", "13.1", "14.1"] },
    { "id": 10, "tasks": ["16.1", "16.2"] },
    { "id": 11, "tasks": ["17.1", "17.2", "17.3"] },
    { "id": 12, "tasks": ["18.1", "18.2"] }
  ]
}
```
