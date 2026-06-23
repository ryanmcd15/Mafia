# Mafia

This is a new repo I want to use for a new Kiro project for a game called mafia. I want to make this initially an online webpage game with possibly the addition of adding it to an app store


Mafia Companion Web App

Build a mobile-first web application for a real-life social deduction game inspired by Mafia.

Core Concept

Players are physically together in the same room and each use their own phone.

The application replaces the traditional narrator/host and automates the game flow.

The game should feel cinematic and guided, with the application acting as the narrator.

There should be no requirement for a dedicated host player. Everyone participates.



Technical Requirements

Frontend

Mobile-first responsive design
Works in mobile browsers
Clean modern UI
Dark theme
Large touch-friendly controls
Backend

Node.js
Socket.io for real-time communication
Server-authoritative architecture
Clients are presentation/input only
All game state managed on server
Architecture

The server must be the single source of truth.

Clients should never determine:

game phase
player deaths
vote outcomes
win conditions
Clients only:

display state
send player actions


Game Flow

1. Lobby Phase

Players can:

Create room
Join room using room code
See connected players
Host can:

Start game
Minimum players:

4


2. Role Assignment

Randomly assign roles:

Required roles:

Killer
Medic
Civilians
Each player sees only their own role.

Role reveal should be private.



3. Night Phase

All players initially see:

“Night falls…”

Role actions:

Killer:

Select player to kill
Medic:

Select player to save
Everyone else:

Sleeping screen
Server waits for required actions or timer expiry.



4. Morning Narration

Server resolves actions.

Examples:

“Everyone wakes up…”

“Jamie was attacked…”

“But they were saved by the medic.”

OR

“Alex has been killed.”

Narration should be displayed to all players simultaneously.

Add support for delayed text reveals to create dramatic pacing.



5. Discussion Phase

Display:

Discussion timer
Remaining players
Players discuss in real life.

No chat functionality required.



6. Voting Phase

Display all living players.

Each player votes for one player.

After all votes are submitted or timer expires:

Reveal:

“Player X has been eliminated.”

“They were the Killer.”

or

“They were a Civilian.”



7. Win Conditions

Civilians win:

Killer eliminated
Killer wins:

Killer count equals or exceeds remaining non-killer players
Display game over screen.

Allow replay.



Real-Time Requirements

Use Socket.io.

Events should include:

Client -> Server

createRoom
joinRoom
startGame
submitKill
submitSave
submitVote
Server -> Client

roomUpdated
gameStarted
phaseChanged
morningNarration
votingOpened
voteResults
playerEliminated
gameOver
All players must remain synchronised.



Domain Model

Create classes/modules for:

Game

game state
phase management
win conditions
Player

id
name
role
alive status
GameManager

manages multiple rooms
VoteManager

voting logic
NightActions

kill/save actions
Role enum

Killer
Medic
Civilian
GamePhase enum

Lobby
RoleReveal
Night
Morning
Discussion
Voting
Results
GameOver


MVP Scope

Build a fully playable MVP.

Do not over-engineer.

No authentication.

No database initially.

Store game state in memory.

Focus on:

room creation
role assignment
night actions
narration
voting
win conditions
real-time synchronisation
Generate:

Project structure
Backend implementation
Frontend implementation
Socket.io integration
Instructions for running locally
The result should be playable locally with multiple browser tabs simulating multiple players.
