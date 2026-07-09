import React, { useState, useEffect, useCallback } from "react";
import socket from "../../socket";
import type { GameUIProps } from "../registry";
import type {
  GamePhase,
  SecretAdmirerConfig,
  SpiceLevel,
  SaPhaseChangedPayload,
  SaRoundStartedPayload,
  SaAnswerReceivedPayload,
  SaAssignmentPayload,
  SaMessageDeliveredPayload,
  SaRoundResultsPayload,
  SaGuessingStartedPayload,
  SaVotingStartedPayload,
  SaVoteReceivedPayload,
  RevealData,
  SaRevealDataPayload,
} from "./types";
import { RevealPhase } from "./RevealPhase";
import { GuessingPhase } from "./GuessingPhase";
import { VotingPhase } from "./VotingPhase";
import { MessagePhase } from "./MessagePhase";
import { ReactionPhase } from "./ReactionPhase";
import {
  DEFAULT_CONFIG,
  MIN_ROUNDS,
  MAX_ROUNDS,
  MIN_TIMER,
  MAX_TIMER,
  TIMER_STEP,
  MAX_ANSWER_LENGTH,
  MAX_CUSTOM_PROMPT_LENGTH,
} from "./types";

// ---------- Helpers ----------

function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------- Styles ----------

const containerStyle: React.CSSProperties = {
  padding: "24px 16px",
  maxWidth: "480px",
  margin: "0 auto",
  color: "var(--text-primary)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "16px",
};

const buttonBase: React.CSSProperties = {
  width: "100%",
  minHeight: "44px",
  padding: "12px 16px",
  fontSize: "16px",
  fontWeight: "bold",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  marginBottom: "8px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "14px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

const sliderContainerStyle: React.CSSProperties = {
  marginBottom: "20px",
};

const sliderStyle: React.CSSProperties = {
  width: "100%",
  accentColor: "var(--accent)",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-secondary)",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "16px",
};

const timerStyle: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: "bold",
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
  marginBottom: "16px",
};

// ---------- ConfigPhase ----------

interface ConfigPhaseProps {
  config: SecretAdmirerConfig;
  isHost: boolean;
  onConfigChange: (config: Partial<SecretAdmirerConfig>) => void;
  onStartGame: () => void;
}

const ConfigPhase: React.FC<ConfigPhaseProps> = ({
  config,
  isHost,
  onConfigChange,
  onStartGame,
}) => {
  const spiceLevels: SpiceLevel[] = ["mild", "medium", "hot"];
  const spiceLabels: Record<SpiceLevel, string> = {
    mild: "🌿 Mild",
    medium: "🌶️ Medium",
    hot: "🔥 Hot",
  };

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>💌 Secret Admirer</h2>
      <p
        style={{
          textAlign: "center",
          color: "var(--text-secondary)",
          marginBottom: "24px",
          fontSize: "14px",
        }}
      >
        {isHost
          ? "Configure the game settings below"
          : "Waiting for the host to configure the game..."}
      </p>

      {/* Rounds Slider */}
      <div style={sliderContainerStyle}>
        <label style={labelStyle}>
          Rounds: {config.rounds}
        </label>
        <input
          type="range"
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          step={1}
          value={config.rounds}
          onChange={(e) => onConfigChange({ rounds: Number(e.target.value) })}
          disabled={!isHost}
          style={sliderStyle}
          aria-label="Number of rounds"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "var(--text-secondary)",
          }}
        >
          <span>{MIN_ROUNDS}</span>
          <span>{MAX_ROUNDS}</span>
        </div>
      </div>

      {/* Spice Level Selector */}
      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Spice Level</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {spiceLevels.map((level) => (
            <button
              key={level}
              onClick={() => onConfigChange({ spiceLevel: level })}
              disabled={!isHost}
              style={{
                flex: 1,
                padding: "10px 8px",
                fontSize: "14px",
                fontWeight: "600",
                border:
                  config.spiceLevel === level
                    ? "2px solid var(--accent)"
                    : "2px solid var(--bg-tertiary)",
                borderRadius: "8px",
                background:
                  config.spiceLevel === level
                    ? "rgba(108, 99, 255, 0.15)"
                    : "var(--bg-secondary)",
                color:
                  config.spiceLevel === level
                    ? "var(--accent)"
                    : "var(--text-primary)",
                cursor: isHost ? "pointer" : "default",
                opacity: !isHost ? 0.7 : 1,
              }}
              aria-pressed={config.spiceLevel === level}
              aria-label={`Spice level: ${level}`}
            >
              {spiceLabels[level]}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Prompts Toggle */}
      <div style={{ marginBottom: "20px" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            cursor: isHost ? "pointer" : "default",
          }}
        >
          <input
            type="checkbox"
            checked={config.customPrompts}
            onChange={(e) =>
              onConfigChange({ customPrompts: e.target.checked })
            }
            disabled={!isHost}
            style={{ width: "20px", height: "20px", accentColor: "var(--accent)" }}
            aria-label="Enable custom prompts"
          />
          <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-primary)" }}>
            Custom Prompts
          </span>
        </label>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            marginTop: "4px",
            marginLeft: "32px",
          }}
        >
          Allow players to submit their own prompts each round
        </p>
      </div>

      {/* Timer Slider */}
      <div style={sliderContainerStyle}>
        <label style={labelStyle}>
          Round Timer: {config.roundTimer}s
        </label>
        <input
          type="range"
          min={MIN_TIMER}
          max={MAX_TIMER}
          step={TIMER_STEP}
          value={config.roundTimer}
          onChange={(e) =>
            onConfigChange({ roundTimer: Number(e.target.value) })
          }
          disabled={!isHost}
          style={sliderStyle}
          aria-label="Round timer duration in seconds"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "var(--text-secondary)",
          }}
        >
          <span>{MIN_TIMER}s</span>
          <span>{MAX_TIMER}s</span>
        </div>
      </div>

      {/* Start Game Button (host only) */}
      {isHost && (
        <button
          onClick={onStartGame}
          style={{
            ...buttonBase,
            background: "var(--accent)",
            color: "#ffffff",
            marginTop: "16px",
          }}
        >
          Start Game
        </button>
      )}
    </div>
  );
};

// ---------- RoundPhase ----------

interface RoundPhaseProps {
  currentRound: number;
  totalRounds: number;
  prompt: string | null;
  timeRemaining: number;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  targetName: string | null;
  customPromptsEnabled: boolean;
  onSubmitAnswer: (text: string) => void;
  onSubmitCustomPrompt: (prompt: string) => void;
}

const RoundPhase: React.FC<RoundPhaseProps> = ({
  currentRound,
  totalRounds,
  prompt,
  timeRemaining,
  hasSubmitted,
  submittedCount,
  totalPlayers,
  targetName,
  customPromptsEnabled,
  onSubmitAnswer,
  onSubmitCustomPrompt,
}) => {
  const [answerText, setAnswerText] = useState("");
  const [customPromptText, setCustomPromptText] = useState("");
  const [customPromptSubmitted, setCustomPromptSubmitted] = useState(false);

  const timerColor = timeRemaining <= 10 ? "var(--danger)" : "var(--text-primary)";

  // Reset local state when a new round starts
  useEffect(() => {
    setAnswerText("");
    setCustomPromptText("");
    setCustomPromptSubmitted(false);
  }, [currentRound]);

  function handleSubmitAnswer() {
    const trimmed = answerText.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_ANSWER_LENGTH) {
      onSubmitAnswer(trimmed);
    }
  }

  function handleSubmitCustomPrompt() {
    const trimmed = customPromptText.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_CUSTOM_PROMPT_LENGTH) {
      onSubmitCustomPrompt(trimmed);
      setCustomPromptSubmitted(true);
    }
  }

  return (
    <div style={containerStyle}>
      {/* Round Counter */}
      <div
        style={{
          textAlign: "center",
          fontSize: "14px",
          color: "var(--text-secondary)",
          marginBottom: "8px",
        }}
      >
        Round {currentRound} of {totalRounds}
      </div>

      {/* Timer */}
      <div style={{ ...timerStyle, color: timerColor }} aria-live="polite">
        {formatTime(timeRemaining)}
      </div>

      {/* Target Info */}
      {targetName && (
        <div
          style={{
            background: "rgba(108, 99, 255, 0.15)",
            border: "2px solid var(--accent)",
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              marginBottom: "4px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            You're writing about
          </p>
          <p style={{ fontSize: "20px", fontWeight: "bold", color: "var(--accent)" }}>
            {targetName}
          </p>
        </div>
      )}

      {/* Prompt Display */}
      {prompt && (
        <div style={cardStyle}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Prompt
          </p>
          <p style={{ fontSize: "16px", fontWeight: "500", color: "var(--text-primary)" }}>
            {prompt}
          </p>
        </div>
      )}

      {/* Answer Input */}
      {!hasSubmitted ? (
        <div style={{ marginBottom: "16px" }}>
          <textarea
            value={answerText}
            onChange={(e) => {
              if (e.target.value.length <= MAX_ANSWER_LENGTH) {
                setAnswerText(e.target.value);
              }
            }}
            placeholder="Write your anonymous answer..."
            maxLength={MAX_ANSWER_LENGTH}
            rows={4}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "15px",
              borderRadius: "8px",
              border: "2px solid var(--bg-tertiary)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
            aria-label="Your anonymous answer"
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              fontSize: "12px",
              color:
                answerText.length > MAX_ANSWER_LENGTH * 0.9
                  ? "var(--danger)"
                  : "var(--text-secondary)",
              marginTop: "4px",
            }}
          >
            {answerText.length}/{MAX_ANSWER_LENGTH}
          </div>
          <button
            onClick={handleSubmitAnswer}
            disabled={answerText.trim().length === 0}
            style={{
              ...buttonBase,
              background:
                answerText.trim().length > 0 ? "var(--accent)" : "var(--bg-tertiary)",
              color: answerText.trim().length > 0 ? "#ffffff" : "var(--text-secondary)",
              cursor: answerText.trim().length > 0 ? "pointer" : "not-allowed",
              marginTop: "8px",
            }}
          >
            Submit Answer
          </button>
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "24px 16px",
            background: "var(--bg-secondary)",
            borderRadius: "12px",
            marginBottom: "16px",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>
            ✓ Answer submitted!
          </p>
          <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
            Waiting for others...
          </p>
        </div>
      )}

      {/* Submission Progress */}
      <div
        style={{
          textAlign: "center",
          fontSize: "13px",
          color: "var(--text-secondary)",
          marginBottom: "16px",
        }}
      >
        {submittedCount} / {totalPlayers} players submitted
      </div>

      {/* Custom Prompt Input */}
      {customPromptsEnabled && !customPromptSubmitted && (
        <div style={{ ...cardStyle, borderTop: "1px solid var(--bg-tertiary)" }}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Suggest a prompt for next round
          </p>
          <input
            type="text"
            value={customPromptText}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CUSTOM_PROMPT_LENGTH) {
                setCustomPromptText(e.target.value);
              }
            }}
            placeholder="Write a custom prompt..."
            maxLength={MAX_CUSTOM_PROMPT_LENGTH}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: "14px",
              borderRadius: "8px",
              border: "2px solid var(--bg-tertiary)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
            aria-label="Custom prompt suggestion"
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "8px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              {customPromptText.length}/{MAX_CUSTOM_PROMPT_LENGTH}
            </span>
            <button
              onClick={handleSubmitCustomPrompt}
              disabled={customPromptText.trim().length === 0}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: "600",
                border: "none",
                borderRadius: "6px",
                background:
                  customPromptText.trim().length > 0
                    ? "var(--accent)"
                    : "var(--bg-tertiary)",
                color:
                  customPromptText.trim().length > 0
                    ? "#ffffff"
                    : "var(--text-secondary)",
                cursor:
                  customPromptText.trim().length > 0 ? "pointer" : "not-allowed",
              }}
            >
              Submit Prompt
            </button>
          </div>
        </div>
      )}

      {customPromptsEnabled && customPromptSubmitted && (
        <p
          style={{
            textAlign: "center",
            fontSize: "13px",
            color: "var(--success)",
            marginTop: "8px",
          }}
        >
          ✓ Custom prompt submitted for next round
        </p>
      )}
    </div>
  );
};

// ---------- Main Component ----------

export const SecretAdmirerGame: React.FC<GameUIProps> = ({
  roomCode,
  players,
  myPlayerId,
  isHost,
}) => {
  const [phase, setPhase] = useState<GamePhase>("config");
  const [config, setConfig] = useState<SecretAdmirerConfig>({ ...DEFAULT_CONFIG });
  const [targetName, setTargetName] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(players.length);
  const [guessOptions, setGuessOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [hasGuessed, setHasGuessed] = useState(false);
  const [votingMessages, setVotingMessages] = useState<Array<{ id: string; text: string }>>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [votesIn, setVotesIn] = useState(0);
  const [totalEligible, setTotalEligible] = useState(0);
  const [myMessageId, setMyMessageId] = useState<string | null>(null);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [myMessages, setMyMessages] = useState<
    Array<{ id: string; roundNumber: number; text: string; reactions: Record<string, number>; myReactions: string[] }>
  >([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [messagesDeliveredAt, setMessagesDeliveredAt] = useState<number>(Date.now());

  // ---------- Socket listeners ----------

  useEffect(() => {
    function handlePhaseChanged(data: SaPhaseChangedPayload) {
      setPhase(data.phase);
      if (data.config) {
        setConfig(data.config);
      }
      // Reset round-specific state on phase change
      if (data.phase === "roundActive") {
        setHasSubmitted(false);
        setSubmittedCount(0);
      }
    }

    function handleRoundStarted(data: SaRoundStartedPayload) {
      setCurrentRound(data.roundNumber);
      setTotalRounds(data.totalRounds);
      setCurrentPrompt(data.prompt);
      setTimeRemaining(data.timeRemaining);
      setHasSubmitted(false);
      setSubmittedCount(0);
      setPhase("roundActive");
    }

    function handleAnswerReceived(data: SaAnswerReceivedPayload) {
      setSubmittedCount(data.submittedCount);
      setTotalPlayers(data.totalPlayers);
      if (data.playerId === myPlayerId) {
        setHasSubmitted(true);
      }
    }

    function handleAssignment(data: SaAssignmentPayload) {
      setTargetName(data.targetName);
    }

    function handleTimerUpdate(data: { timeRemaining: number }) {
      setTimeRemaining(data.timeRemaining);
    }

    function handleGuessingStarted(data: SaGuessingStartedPayload) {
      setGuessOptions(data.players);
      setTimeRemaining(data.timeRemaining);
      setHasGuessed(false);
      setPhase("guessing");
    }

    function handleVotingStarted(data: SaVotingStartedPayload & { myMessageId?: string }) {
      setVotingMessages(data.messages);
      setTimeRemaining(data.timeRemaining);
      setHasVoted(false);
      setVotesIn(0);
      setTotalEligible(0);
      setMyMessageId(data.myMessageId ?? null);
      setPhase("voting");
    }

    function handleVoteReceived(data: SaVoteReceivedPayload) {
      setVotesIn(data.votesIn);
      setTotalEligible(data.totalEligible);
    }

    function handleRevealData(data: SaRevealDataPayload) {
      setRevealData(data);
    }

    function handleMessageDelivered(data: SaMessageDeliveredPayload) {
      const newMessage = {
        id: `msg-${data.roundNumber}-${Date.now()}`,
        roundNumber: data.roundNumber,
        text: data.message,
        reactions: {},
        myReactions: [],
      };
      setMyMessages((prev) => [...prev, newMessage]);
      setMessagesDeliveredAt(Date.now());
    }

    function handleRoundResults(data: SaRoundResultsPayload) {
      setScores(data.scores);
    }

    socket.on("saPhaseChanged", handlePhaseChanged);
    socket.on("saRoundStarted", handleRoundStarted);
    socket.on("saAnswerReceived", handleAnswerReceived);
    socket.on("saAssignment", handleAssignment);
    socket.on("timerUpdate", handleTimerUpdate);
    socket.on("saGuessingStarted", handleGuessingStarted);
    socket.on("saVotingStarted", handleVotingStarted);
    socket.on("saVoteReceived", handleVoteReceived);
    socket.on("saRevealData", handleRevealData);
    socket.on("saMessageDelivered", handleMessageDelivered);
    socket.on("saRoundResults", handleRoundResults);

    // Request current state on mount for reconnection support
    socket.emit("gameEvent", { type: "getState", payload: {} });

    return () => {
      socket.off("saPhaseChanged", handlePhaseChanged);
      socket.off("saRoundStarted", handleRoundStarted);
      socket.off("saAnswerReceived", handleAnswerReceived);
      socket.off("saAssignment", handleAssignment);
      socket.off("timerUpdate", handleTimerUpdate);
      socket.off("saGuessingStarted", handleGuessingStarted);
      socket.off("saVotingStarted", handleVotingStarted);
      socket.off("saVoteReceived", handleVoteReceived);
      socket.off("saRevealData", handleRevealData);
      socket.off("saMessageDelivered", handleMessageDelivered);
      socket.off("saRoundResults", handleRoundResults);
    };
  }, [myPlayerId]);

  // ---------- Actions ----------

  const handleConfigChange = useCallback(
    (changes: Partial<SecretAdmirerConfig>) => {
      if (!isHost) return;
      const newConfig = { ...config, ...changes };
      setConfig(newConfig);
      socket.emit("gameEvent", {
        type: "configure",
        payload: changes,
      });
    },
    [isHost, config]
  );

  const handleStartGame = useCallback(() => {
    if (!isHost) return;
    socket.emit("gameEvent", { type: "startGame", payload: {} });
  }, [isHost]);

  const handleSubmitAnswer = useCallback((text: string) => {
    socket.emit("gameEvent", { type: "submitAnswer", payload: { text } });
    setHasSubmitted(true);
  }, []);

  const handleSubmitCustomPrompt = useCallback((prompt: string) => {
    socket.emit("gameEvent", {
      type: "submitCustomPrompt",
      payload: { prompt },
    });
  }, []);

  const handleSubmitGuess = useCallback((playerId: string) => {
    socket.emit("gameEvent", { type: "submitGuess", payload: { playerId } });
    setHasGuessed(true);
  }, []);

  const handleSubmitVote = useCallback((messageId: string) => {
    socket.emit("gameEvent", { type: "submitVote", payload: { messageId } });
    setHasVoted(true);
  }, []);

  // ---------- Phase Rendering ----------

  if (phase === "config") {
    return (
      <ConfigPhase
        config={config}
        isHost={isHost}
        onConfigChange={handleConfigChange}
        onStartGame={handleStartGame}
      />
    );
  }

  if (phase === "roundActive") {
    return (
      <RoundPhase
        currentRound={currentRound}
        totalRounds={totalRounds}
        prompt={currentPrompt}
        timeRemaining={timeRemaining}
        hasSubmitted={hasSubmitted}
        submittedCount={submittedCount}
        totalPlayers={totalPlayers}
        targetName={targetName}
        customPromptsEnabled={config.customPrompts}
        onSubmitAnswer={handleSubmitAnswer}
        onSubmitCustomPrompt={handleSubmitCustomPrompt}
      />
    );
  }

  if (phase === "guessing") {
    return (
      <GuessingPhase
        guessOptions={guessOptions}
        timeRemaining={timeRemaining}
        hasGuessed={hasGuessed}
        onGuess={handleSubmitGuess}
      />
    );
  }

  // Voting phase
  if (phase === "voting") {
    return (
      <VotingPhase
        messages={votingMessages}
        timeRemaining={timeRemaining}
        hasVoted={hasVoted}
        votesIn={votesIn}
        totalEligible={totalEligible}
        myMessageId={myMessageId}
        onVote={handleSubmitVote}
      />
    );
  }

  // Reveal phase
  if (phase === "reveal") {
    if (revealData) {
      return <RevealPhase revealData={revealData} />;
    }
    return (
      <div style={{ ...containerStyle, textAlign: "center" }}>
        <h2 style={headingStyle}>💌 Secret Admirer</h2>
        <p style={{ color: "var(--text-secondary)" }}>The big reveal! 🎉</p>
      </div>
    );
  }

  // Placeholder for phases handled by later tasks
  if (phase === "messageDelivery") {
    return (
      <MessagePhase
        messages={myMessages}
        currentRound={currentRound}
      />
    );
  }

  if (phase === "reactions") {
    return (
      <ReactionPhase
        messages={myMessages}
        currentRound={currentRound}
        deliveredAt={messagesDeliveredAt}
      />
    );
  }

  // Fallback
  return (
    <div style={{ ...containerStyle, textAlign: "center" }}>
      <p style={{ color: "var(--text-secondary)" }}>Waiting for game to start...</p>
    </div>
  );
};

export default SecretAdmirerGame;
