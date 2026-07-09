# Requirements Document

## Introduction

Secret Admirer is a party game module for the existing web-based party games platform. Players are secretly assigned to admire one other player through a random cycle (guaranteeing everyone has exactly one admirer and is admired by exactly one person). Over multiple rounds, players anonymously answer prompts about their assigned person. At the end, players guess who their admirer was, and scores are tallied based on correct guesses and community votes.

## Glossary

- **Game_Module**: A server-side class implementing the GameModule interface, registered in the platform to handle game-specific logic via socket events.
- **Host**: The player who created the room and has permission to configure and start the game.
- **Admirer_Cycle**: A single Hamiltonian cycle through all players such that each player is assigned exactly one other player to admire, and each player is admired by exactly one other player. No self-assignments exist.
- **Prompt**: A question or statement template that all players answer about their assigned person during a round.
- **Spice_Level**: A host-configurable setting (Mild, Medium, or Hot) that determines which category of prompts is used.
- **Round**: One iteration of the prompt-answer phase where all players submit one anonymous answer about their assigned person.
- **Guessing_Phase**: The phase after all rounds where each player privately guesses which other player was their admirer.
- **Reveal_Phase**: The phase after guessing where all assignments, messages, and guess results are shown.
- **Reaction**: An emoji response that players can attach to anonymous messages they receive.
- **Community_Vote**: A vote cast by players to select the funniest answer in a round.
- **Prompt_Pool**: A JSON file containing 100 prompts per spice level category (Mild, Medium, Hot).
- **Round_Timer**: A configurable countdown that limits the time available for submitting answers each round.

## Requirements

### Requirement 1: Game Registration

**User Story:** As a player, I want Secret Admirer to appear in the game selection screen, so that I can choose to play it with my group.

#### Acceptance Criteria

1. THE Game_Module SHALL register with the platform using the identifier "secret-admirer", the display name "Secret Admirer", a minimum of 3 players, a maximum of 20 players, and a description of no more than 200 characters summarizing the game's premise.
2. THE Game_Module SHALL appear in the client game registry with the identifier "secret-admirer", the display name "Secret Admirer", and the icon "💌".
3. WHEN the platform emits the list of available games to connected clients, THE Game_Module SHALL be included with its identifier, display name, player count range, and description.

### Requirement 2: Host Configuration

**User Story:** As a host, I want to configure game settings before starting, so that I can tailor the experience to my group.

#### Acceptance Criteria

1. WHEN the game is selected, THE Game_Module SHALL present the host with configuration options for number of rounds, spice level, custom prompts toggle, and round timer duration.
2. THE Game_Module SHALL allow the host to set the number of rounds to a whole number between 5 and 20 inclusive.
3. IF the host attempts to set the number of rounds to a value outside 5 to 20, THEN THE Game_Module SHALL reject the input and retain the previous valid value.
4. THE Game_Module SHALL allow the host to select a spice level of Mild, Medium, or Hot.
5. THE Game_Module SHALL allow the host to enable or disable custom prompts.
6. THE Game_Module SHALL set default configuration values of 10 rounds, Mild spice level, custom prompts disabled, and a round timer of 60 seconds.
7. WHEN the host sets a round timer, THE Game_Module SHALL allow a timer duration between 30 and 120 seconds inclusive, adjustable in increments of 5 seconds.
8. IF a non-host player attempts to modify configuration settings, THEN THE Game_Module SHALL reject the change and preserve the current configuration.
9. WHEN the host confirms the configuration, THE Game_Module SHALL apply the selected settings and allow the game to be started.

### Requirement 3: Game Start and Assignment

**User Story:** As a host, I want to start the game and have secret assignments made automatically, so that the game begins fairly and randomly.

#### Acceptance Criteria

1. WHEN the host submits a start game event and the Room contains between 3 and 20 connected players inclusive, THE Game_Module SHALL generate a single random Admirer_Cycle containing all connected players and transition the game out of the Lobby phase.
2. THE Game_Module SHALL ensure each player appears exactly once as an admirer and exactly once as an admired person in the Admirer_Cycle, forming a single Hamiltonian cycle with no sub-cycles.
3. THE Game_Module SHALL ensure no player is assigned to admire themselves within the Admirer_Cycle.
4. WHEN the Admirer_Cycle is generated, THE Game_Module SHALL send each player the name of the person they are admiring exclusively via that player's individual Socket connection, without broadcasting assignment data to any other player.
5. THE Game_Module SHALL not reveal any player's admirer or admired assignment to any other player from the moment of assignment until the GamePhase transitions to Reveal_Phase.
6. IF the host attempts to start the game with fewer than 3 connected players, THEN THE Game_Module SHALL reject the start request and return an error message indicating the minimum player requirement of 3.
7. IF a non-host player submits a start game event, THEN THE Game_Module SHALL reject the request and return an error message indicating insufficient permissions.
8. IF a start game event is received when the game has already started, THEN THE Game_Module SHALL reject the request and return an error message indicating the game is already in progress.

### Requirement 4: Prompt Selection

**User Story:** As a player, I want interesting and varied prompts each round, so that the game stays entertaining.

#### Acceptance Criteria

1. WHEN a new round begins, THE Game_Module SHALL randomly select one prompt from the Prompt_Pool matching the configured spice level.
2. THE Game_Module SHALL not repeat a prompt within the same game session (from game start to game end).
3. THE Game_Module SHALL send the same prompt to all players in a given round.
4. WHERE custom prompts are enabled, WHEN a round begins and a custom prompt has been submitted, THE Game_Module SHALL use the submitted custom prompt instead of selecting from the Prompt_Pool for that round.
5. IF the Prompt_Pool for the configured spice level is exhausted, THEN THE Game_Module SHALL select prompts from the next available spice level (Mild falls back to Medium, Medium falls back to Hot, Hot falls back to Mild).
6. IF all Prompt_Pool spice levels are exhausted and no custom prompt is available, THEN THE Game_Module SHALL end the game early and emit the results accumulated so far.
7. WHERE custom prompts are enabled, WHEN a player submits a custom prompt, THE Game_Module SHALL accept the submission only if it is between 1 and 300 characters in length, and SHALL reject submissions outside this range with an error message indicating the length constraint.
8. WHERE custom prompts are enabled, IF multiple players submit custom prompts for the same round, THEN THE Game_Module SHALL randomly select one of the submitted custom prompts for use and discard the others.

### Requirement 5: Round Gameplay

**User Story:** As a player, I want to submit anonymous answers about my assigned person each round, so that I can express my admiration without being identified.

#### Acceptance Criteria

1. WHEN a round starts, THE Game_Module SHALL emit the current prompt and round number to all players.
2. THE Game_Module SHALL accept one text answer per player per round, with a length between 1 and 500 characters.
3. IF a player submits an answer that is empty or exceeds 500 characters, THEN THE Game_Module SHALL reject the submission and emit an error message indicating the length constraint.
4. IF a player attempts to submit a second answer in the same round, THEN THE Game_Module SHALL reject the submission and emit an error message indicating that an answer has already been submitted.
5. WHEN a player submits a valid answer, THE Game_Module SHALL store the answer associated with the submitting player and their assigned target.
6. THE Game_Module SHALL not reveal the identity of the submitter to the target player or any other player during the game rounds.
7. WHEN all connected players have submitted answers or the Round_Timer expires, THE Game_Module SHALL end the current round and advance to message delivery.
8. WHEN a round ends, THE Game_Module SHALL deliver each player the anonymous message written about them, displayed as "💌 Anonymous admirer says... [message]".
9. IF a player does not submit an answer before the Round_Timer expires, THEN THE Game_Module SHALL record an empty string as that player's submission and deliver no message to their target for that round.

### Requirement 6: Reactions on Messages

**User Story:** As a player, I want to react to anonymous messages I receive, so that I can express how the message made me feel.

#### Acceptance Criteria

1. WHEN a player receives an anonymous message, THE Game_Module SHALL display the predefined set of reaction emojis (❤️, 😂, 😍, 🔥, 👀, 💀) and allow the player to select up to one of each emoji type per message.
2. WHEN a player selects a reaction emoji on a message, THE Game_Module SHALL emit the updated reaction counts for that message to all players without including the identity of the player who reacted.
3. IF a player submits a reaction emoji that is not in the predefined set (❤️, 😂, 😍, 🔥, 👀, 💀), THEN THE Game_Module SHALL reject the reaction and return an error message indicating an invalid emoji.
4. IF a player submits the same emoji reaction to the same message more than once, THEN THE Game_Module SHALL reject the duplicate reaction and return an error message indicating the reaction has already been recorded.
5. IF a player attempts to react to a message that was not addressed to them, THEN THE Game_Module SHALL reject the reaction and return an error message indicating insufficient permissions.
6. THE Game_Module SHALL accept reactions only during the reaction phase following message delivery; reactions submitted after 60 seconds of message delivery SHALL be rejected with an error message indicating the reaction window has closed.

### Requirement 7: Community Voting

**User Story:** As a player, I want to vote for the funniest answer each round, so that creative responses are rewarded.

#### Acceptance Criteria

1. WHEN a round ends and all messages are delivered, THE Game_Module SHALL present all non-blank anonymous messages from the round to all players for Community_Vote.
2. WHILE the Community_Vote phase is active, THE Game_Module SHALL allow each player to cast exactly one vote for any message other than their own.
3. IF a player attempts to vote for their own message, THEN THE Game_Module SHALL reject the vote and indicate that self-voting is not permitted.
4. WHEN all connected players have voted or a 30-second voting timer expires, THE Game_Module SHALL tally votes and award 2 points to the author of the message with the most votes.
5. IF two or more messages are tied for the most votes, THEN THE Game_Module SHALL award 2 points to each tied author.
6. IF the voting timer expires and no player has cast a vote, THEN THE Game_Module SHALL award no points for Community_Vote that round and proceed to the next round.

### Requirement 8: Guessing Phase

**User Story:** As a player, I want to guess who my secret admirer was, so that I can test my intuition and earn points.

#### Acceptance Criteria

1. WHEN all rounds are complete, THE Game_Module SHALL transition to the Guessing_Phase and start a 60-second timer.
2. WHEN the Guessing_Phase begins, THE Game_Module SHALL present each player with a list of all other players (excluding themselves) to select from as their guess.
3. WHEN a player submits a guess selecting another player, THE Game_Module SHALL accept exactly one guess per player, identifying who they believe their admirer was.
4. IF a player submits a guess selecting themselves or a player not in the game, THEN THE Game_Module SHALL reject the guess and return an error message indicating an invalid selection.
5. IF a player submits a guess after already having submitted one in the current Guessing_Phase, THEN THE Game_Module SHALL reject the duplicate submission and return an error message indicating a guess has already been recorded.
6. IF a player does not submit a guess before the 60-second timer expires, THEN THE Game_Module SHALL record no guess for that player and they SHALL receive 0 points for the guessing portion.
7. WHEN all connected players have submitted guesses or the 60-second timer expires, THE Game_Module SHALL end the Guessing_Phase.
8. WHILE the Guessing_Phase is active, THE Game_Module SHALL not reveal any player's guess to any other player.

### Requirement 9: Reveal Phase

**User Story:** As a player, I want to see the full reveal of who admired whom, so that the mystery is resolved dramatically.

#### Acceptance Criteria

1. WHEN the Guessing_Phase ends, THE Game_Module SHALL transition to the Reveal_Phase and emit all reveal data to all connected players.
2. WHEN the Reveal_Phase begins, THE Game_Module SHALL emit the complete Admirer_Cycle as an ordered list of assignments, each showing the admirer and their target (e.g., "Alice ❤️ Bob"), in cycle order starting from a random player.
3. WHEN the Reveal_Phase begins, THE Game_Module SHALL emit each player's guess alongside their actual admirer and a boolean indicating whether the guess was correct.
4. WHEN the Reveal_Phase begins, THE Game_Module SHALL emit all messages grouped by round in round order, showing the author, their target, and the message text for each submission, including blank submissions recorded due to timer expiry.
5. WHEN the Reveal_Phase begins, THE Game_Module SHALL emit statistics including: the message with the most total reactions across all rounds, the longest answer by character count, the shortest non-blank answer by character count, and the fastest submission measured in seconds from round start to submission time.
6. IF two or more messages are tied for a statistic, THEN THE Game_Module SHALL select the one submitted earliest.

### Requirement 10: Scoring

**User Story:** As a player, I want a clear scoring system, so that good guesses and creative answers are rewarded.

#### Acceptance Criteria

1. WHEN a player correctly guesses their admirer during the Guessing_Phase, THE Game_Module SHALL award 5 points to that player.
2. WHEN a player's message receives the most emoji reactions in a round and no other player's message in that round has an equal number of reactions, THE Game_Module SHALL award 2 points to that player.
3. IF two or more players tie for the most emoji reactions in a round, THEN THE Game_Module SHALL award 2 points to each tied player.
4. WHEN a player wins the Community_Vote in a round, THE Game_Module SHALL award 2 points to that player.
5. THE Game_Module SHALL initialize each player's cumulative score to 0 at game start and maintain a cumulative score for each player across all rounds.
6. WHEN the Reveal_Phase completes, THE Game_Module SHALL emit a sorted leaderboard with player names and scores in descending order, with ties ordered alphabetically by player name.

### Requirement 11: End-of-Game Awards

**User Story:** As a player, I want to see fun awards at the end of the game, so that memorable moments are celebrated.

#### Acceptance Criteria

1. WHEN the Reveal_Phase completes, THE Game_Module SHALL calculate and emit the following awards: Biggest Flirt (player who received the highest total number of emoji reactions across all rounds), Most Mysterious (player whose admirer was not correctly guessed by their target), Best Compliment (single message that received the highest number of emoji reactions in any round), and Chaos Agent (player whose messages had the highest standard deviation of reaction counts across rounds, requiring at least 2 rounds of submissions to calculate).
2. IF two or more players tie for an award, THEN THE Game_Module SHALL award it to all tied players.
3. IF all players' admirers were correctly guessed, THEN THE Game_Module SHALL omit the Most Mysterious award from the results.

### Requirement 12: Game End and Cleanup

**User Story:** As a player, I want the game to conclude cleanly and allow the group to return to game selection.

#### Acceptance Criteria

1. WHEN the leaderboard and awards are emitted, THE Game_Module SHALL signal game over to the platform with the final scoreboard data.
2. THE Game_Module SHALL clear all game state (assignments, messages, scores, timers) when the game ends.
3. WHEN a player disconnects during the game, THE Game_Module SHALL continue the game with remaining connected players and retain the disconnected player's previously submitted messages and scores in the game state.
4. IF the number of connected players drops below 3 during any game phase (Round Gameplay, Guessing_Phase, or Reveal_Phase), THEN THE Game_Module SHALL end the game early, emit the leaderboard with scores accumulated up to that point, and signal game over to the platform.
5. WHEN a player disconnects during a round before submitting an answer, THE Game_Module SHALL record a blank submission for that player for the current round.

### Requirement 13: Prompt Pool Data

**User Story:** As a developer, I want prompts stored in a structured JSON file, so that they are easy to maintain and extend.

#### Acceptance Criteria

1. THE Game_Module SHALL load prompts from a JSON file containing exactly three arrays keyed by spice level: "mild", "medium", and "hot".
2. THE Game_Module SHALL contain at least 100 prompts per spice level category, where each prompt is a non-empty string of 1 to 280 characters.
3. THE Game_Module SHALL validate the prompt file structure on module initialization, verifying that the file exists, is valid JSON, contains all three required keys ("mild", "medium", "hot"), each key maps to an array of at least 100 strings, and each string is between 1 and 280 characters.
4. IF the prompt file is missing or fails any validation check, THEN THE Game_Module SHALL emit an error indicating which validation check failed and SHALL NOT allow the game to start.

### Requirement 14: Admirer Cycle Generation (Round-Trip Property)

**User Story:** As a developer, I want the cycle generation algorithm to be verifiably correct, so that game fairness is guaranteed.

#### Acceptance Criteria

1. FOR ALL sets of 3 to 20 unique player identifiers, THE Game_Module SHALL produce an Admirer_Cycle where serializing the cycle to an assignment map and reconstructing the cycle from that map produces an equivalent cycle (round-trip property).
2. FOR ALL generated Admirer_Cycles, THE Game_Module SHALL produce a cycle where the number of assignments equals the number of players, every player appears exactly once as source, every player appears exactly once as target, and no player is assigned to themselves.
3. FOR ALL generated Admirer_Cycles with the same player set but different random seeds, THE Game_Module SHALL produce cycles that are not always identical, verified by generating 10 cycles with distinct seeds and confirming that at least 2 of the 10 are distinct permutations.
