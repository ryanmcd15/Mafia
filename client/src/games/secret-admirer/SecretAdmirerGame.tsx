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

// ---------- CSS Keyframes Injection ----------

const SA_KF_ID = "sa-keyframes";
function injectKeyframes() {
  if (document.getElementById(SA_KF_ID)) return;
  const s = document.createElement("style");
  s.id = SA_KF_ID;
  s.textContent = `
    @keyframes sa-fadeIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes sa-pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
    @keyframes sa-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
    @keyframes sa-glow { 0%,100% { box-shadow:0 0 12px rgba(255,107,157,0.3); } 50% { box-shadow:0 0 24px rgba(255,107,157,0.6); } }
    @keyframes sa-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    @keyframes sa-heartbeat { 0%,100% { transform:scale(1); } 14% { transform:scale(1.3); } 28% { transform:scale(1); } 42% { transform:scale(1.3); } 70% { transform:scale(1); } }
    @keyframes sa-slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
    @keyframes sa-confetti { 0% { transform:translateY(0) rotate(0deg); opacity:1; } 100% { transform:translateY(-40px) rotate(360deg); opacity:0; } }
    @keyframes sa-scaleIn { from { opacity:0; transform:scale(0.5); } to { opacity:1; transform:scale(1); } }
    @keyframes sa-waitPulse { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
    @keyframes sa-bgFloat1 { 0%,100% { transform:translate(0,0) rotate(0deg); opacity:0.06; } 50% { transform:translate(20px,-30px) rotate(15deg); opacity:0.12; } }
    @keyframes sa-bgFloat2 { 0%,100% { transform:translate(0,0) rotate(0deg); opacity:0.04; } 50% { transform:translate(-15px,20px) rotate(-10deg); opacity:0.09; } }
    @keyframes sa-bgFloat3 { 0%,100% { transform:translate(0,0); opacity:0.05; } 50% { transform:translate(10px,15px); opacity:0.1; } }
    .sa-bg-wrapper { position:relative; min-height:100vh; overflow:hidden; }
    .sa-bg-wrapper::before { content:'\\1F48C  \\2764  \\1F525  \\2728  \\1F48B'; position:absolute; top:10%; left:5%; font-size:40px; opacity:0.06; animation:sa-bgFloat1 8s ease-in-out infinite; pointer-events:none; z-index:0; letter-spacing:20px; }
    .sa-bg-wrapper::after { content:'\\2728  \\1F48C  \\1F46B  \\1F48B  \\2764'; position:absolute; bottom:15%; right:5%; font-size:36px; opacity:0.05; animation:sa-bgFloat2 10s ease-in-out infinite; pointer-events:none; z-index:0; letter-spacing:16px; }
  `;
  document.head.appendChild(s);
}

// ---------- Transition Types ----------

type TransitionScreen =
  | null
  | "assignmentReveal"
  | "roundResults"
  | "tallyingReactions"
  | "guessingIntro";

// ---------- Encouraging Messages ----------

const WAITING_MESSAGES = [
  "Good things come to those who wait... 💭",
  "Your message is out there making someone smile 😊",
  "The suspense is part of the fun ✨",
  "Secret admirers are hard at work... 💌",
  "Almost there, hang tight! 🌟",
  "Great minds write alike... or do they? 🤔",
  "Patience is a virtue, especially in love 💕",
  "The best messages take time 🎨",
];

// ---------- Styles ----------

const containerStyle: React.CSSProperties = {
  padding: "24px 16px",
  maxWidth: "480px",
  margin: "0 auto",
  color: "var(--text-primary)",
  animation: "sa-fadeIn 0.4s ease-out",
  minHeight: "100vh",
  position: "relative",
  zIndex: 1,
  background: "radial-gradient(ellipse at 20% 20%, rgba(108, 99, 255, 0.1) 0%, transparent 40%), radial-gradient(ellipse at 80% 80%, rgba(255, 107, 157, 0.08) 0%, transparent 40%), radial-gradient(circle at 50% 50%, rgba(196, 77, 255, 0.04) 0%, transparent 60%)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "16px",
};

const buttonBase: React.CSSProperties = {
  width: "100%",
  minHeight: "48px",
  padding: "14px 16px",
  fontSize: "16px",
  fontWeight: "bold",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  marginBottom: "8px",
  transition: "all 0.2s ease",
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
  accentColor: "#ff6b9d",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-secondary)",
  borderRadius: "16px",
  padding: "16px",
  marginBottom: "16px",
  border: "1px solid rgba(255, 107, 157, 0.1)",
};

const timerStyle: React.CSSProperties = {
  fontSize: "36px",
  fontWeight: "bold",
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
  marginBottom: "16px",
  background: "linear-gradient(135deg, #ff6b9d, #c44dff)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
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
  const spiceLevels: SpiceLevel[] = ["mild", "hot", "explicit"];
  const spiceLabels: Record<SpiceLevel, string> = {
    mild: "😂 Funny",
    medium: "🌶️ Medium",
    hot: "😏 Cheeky",
    explicit: "🔞 18+",
  };

  useEffect(() => { injectKeyframes(); }, []);

  return (
    <div style={containerStyle}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: "28px", animation: "sa-slideUp 0.5s ease-out" }}>
        <div style={{ fontSize: "48px", marginBottom: "8px", animation: "sa-heartbeat 2s ease-in-out infinite" }}>💌</div>
        <h2
          style={{
            fontSize: "26px",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #ff6b9d, #c44dff, #6c63ff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "8px",
          }}
        >
          Secret Admirer
        </h2>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          {isHost
            ? "Set up the game for your group ✨"
            : "Waiting for the host to configure..."}
        </p>
      </div>

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
          {spiceLevels.map((level) => {
            const isActive = config.spiceLevel === level;
            const bgMap: Record<SpiceLevel, string> = {
              mild: isActive ? "rgba(46, 213, 115, 0.15)" : "var(--bg-secondary)",
              medium: isActive ? "rgba(255, 165, 2, 0.15)" : "var(--bg-secondary)",
              hot: isActive ? "rgba(255, 71, 87, 0.15)" : "var(--bg-secondary)",
              explicit: isActive ? "rgba(156, 39, 176, 0.15)" : "var(--bg-secondary)",
            };
            const borderMap: Record<SpiceLevel, string> = {
              mild: isActive ? "#2ed573" : "var(--bg-tertiary)",
              medium: isActive ? "#ffa502" : "var(--bg-tertiary)",
              hot: isActive ? "#ff4757" : "var(--bg-tertiary)",
              explicit: isActive ? "#9c27b0" : "var(--bg-tertiary)",
            };
            const colorMap: Record<SpiceLevel, string> = {
              mild: isActive ? "#2ed573" : "var(--text-primary)",
              medium: isActive ? "#ffa502" : "var(--text-primary)",
              hot: isActive ? "#ff4757" : "var(--text-primary)",
              explicit: isActive ? "#9c27b0" : "var(--text-primary)",
            };
            return (
              <button
                key={level}
                onClick={() => onConfigChange({ spiceLevel: level })}
                disabled={!isHost}
                style={{
                  flex: 1,
                  padding: "12px 8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  border: `2px solid ${borderMap[level]}`,
                  borderRadius: "12px",
                  background: bgMap[level],
                  color: colorMap[level],
                  cursor: isHost ? "pointer" : "default",
                  opacity: !isHost ? 0.7 : 1,
                  transition: "all 0.2s ease",
                  transform: isActive ? "scale(1.02)" : "scale(1)",
                }}
                aria-pressed={isActive}
                aria-label={`Spice level: ${level}`}
              >
                {spiceLabels[level]}
              </button>
            );
          })}
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
            background: "linear-gradient(135deg, #6c63ff, #c44dff)",
            color: "#ffffff",
            marginTop: "16px",
            borderRadius: "12px",
            minHeight: "48px",
            boxShadow: "0 4px 12px rgba(108, 99, 255, 0.3)",
          }}
        >
          💌 Start Game
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

  useEffect(() => { injectKeyframes(); }, []);

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
      {/* Round Counter - prominent */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "8px",
        }}
      >
        <span style={{
          display: "inline-block",
          padding: "4px 14px",
          borderRadius: "20px",
          fontSize: "13px",
          fontWeight: "600",
          background: "linear-gradient(135deg, rgba(108, 99, 255, 0.12), rgba(196, 77, 255, 0.08))",
          border: "1px solid rgba(108, 99, 255, 0.25)",
          color: "var(--text-primary)",
          letterSpacing: "0.5px",
        }}>
          Round {currentRound} of {totalRounds}
        </span>
      </div>

      {/* Timer - big and dramatic */}
      <div style={{ ...timerStyle, color: timeRemaining <= 10 ? "#ff4757" : undefined }} aria-live="polite">
        {formatTime(timeRemaining)}
      </div>

      {/* Target Info - the star of the show */}
      {targetName && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(255, 107, 157, 0.12), rgba(196, 77, 255, 0.08))",
            border: "2px solid rgba(255, 107, 157, 0.4)",
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "16px",
            textAlign: "center",
            animation: "sa-glow 3s ease-in-out infinite",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              color: "var(--text-secondary)",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
            }}
          >
            You're writing about
          </p>
          <p style={{
            fontSize: "22px",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #ff6b9d, #c44dff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {targetName}
          </p>
        </div>
      )}

      {/* Prompt Display */}
      {prompt && (
        <div style={{
          ...cardStyle,
          background: "linear-gradient(135deg, var(--bg-secondary), rgba(108, 99, 255, 0.05))",
          border: "1px solid rgba(108, 99, 255, 0.15)",
        }}>
          <p
            style={{
              fontSize: "11px",
              color: "var(--text-secondary)",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            ✨ Prompt
          </p>
          <p style={{ fontSize: "17px", fontWeight: "500", color: "var(--text-primary)", lineHeight: "1.5" }}>
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
            placeholder="Write your anonymous message... ✍️"
            maxLength={MAX_ANSWER_LENGTH}
            rows={3}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "15px",
              borderRadius: "12px",
              border: "2px solid var(--bg-tertiary)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              resize: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
              transition: "border-color 0.2s ease",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#ff6b9d"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--bg-tertiary)"; }}
            aria-label="Your anonymous answer"
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              fontSize: "12px",
              color:
                answerText.length > MAX_ANSWER_LENGTH * 0.9
                  ? "#ff4757"
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
                answerText.trim().length > 0
                  ? "linear-gradient(135deg, #ff6b9d, #c44dff)"
                  : "var(--bg-tertiary)",
              color: answerText.trim().length > 0 ? "#ffffff" : "var(--text-secondary)",
              cursor: answerText.trim().length > 0 ? "pointer" : "not-allowed",
              marginTop: "8px",
              boxShadow: answerText.trim().length > 0 ? "0 4px 16px rgba(255, 107, 157, 0.3)" : "none",
            }}
          >
            {answerText.trim().length > 0 ? "💌 Send Message" : "Write something..."}
          </button>
        </div>
      ) : (
        <div
          style={{
            textAlign: "center",
            padding: "28px 16px",
            background: "linear-gradient(135deg, rgba(46, 213, 115, 0.08), rgba(108, 99, 255, 0.05))",
            borderRadius: "16px",
            marginBottom: "16px",
            border: "1px solid rgba(46, 213, 115, 0.25)",
            animation: "sa-fadeIn 0.3s ease-out",
          }}
        >
          <p style={{ fontSize: "28px", marginBottom: "6px" }}>✨</p>
          <p style={{ fontSize: "16px", fontWeight: "bold", color: "var(--success)" }}>
            Message sent!
          </p>
          <p style={{
            color: "var(--text-secondary)",
            marginTop: "10px",
            fontSize: "13px",
            fontStyle: "italic",
            animation: "sa-waitPulse 2s ease-in-out infinite",
          }}>
            {WAITING_MESSAGES[currentRound % WAITING_MESSAGES.length]}
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        <span style={{ fontSize: "14px" }}>✍️</span>
        {submittedCount} / {totalPlayers} submitted
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

  // Transition state
  const [transition, setTransition] = useState<TransitionScreen>(null);
  const [roundResultsData, setRoundResultsData] = useState<{
    winningMessageId: string | null;
    winningText: string | null;
    scores: Record<string, number>;
  } | null>(null);
  const [waitingMessage] = useState(() =>
    WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)]
  );

  // Ref to keep voting messages accessible in socket handler without stale closure
  const votingMessagesRef = React.useRef(votingMessages);
  React.useEffect(() => {
    votingMessagesRef.current = votingMessages;
  }, [votingMessages]);

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
      // Show the dramatic assignment reveal for 3 seconds
      setTransition("assignmentReveal");
      setTimeout(() => {
        setTransition(null);
      }, 3000);
    }

    function handleTimerUpdate(data: { timeRemaining: number }) {
      setTimeRemaining(data.timeRemaining);
    }

    function handleGuessingStarted(data: SaGuessingStartedPayload) {
      setGuessOptions(data.players);
      setTimeRemaining(data.timeRemaining);
      setHasGuessed(false);
      // Show guessing intro transition for 2 seconds
      setTransition("guessingIntro");
      setTimeout(() => {
        setTransition(null);
        setPhase("guessing");
      }, 2000);
    }

    function handleVotingStarted(data: SaVotingStartedPayload & { myMessageId?: string; totalEligible?: number }) {
      setVotingMessages(data.messages);
      setTimeRemaining(data.timeRemaining);
      setHasVoted(false);
      setVotesIn(0);
      setTotalEligible(data.totalEligible ?? 0);
      setMyMessageId(data.myMessageId ?? null);
      // Show "tallying reactions" transition for 1 second before voting
      setTransition("tallyingReactions");
      setTimeout(() => {
        setTransition(null);
        setPhase("voting");
      }, 1000);
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
      // Find the winning message text from current voting messages
      const winningText = data.winningMessageId
        ? votingMessagesRef.current.find((m) => m.id === data.winningMessageId)?.text ?? null
        : null;
      setRoundResultsData({
        winningMessageId: data.winningMessageId,
        winningText,
        scores: data.scores,
      });
      // Show round results transition for 3 seconds
      setTransition("roundResults");
      setTimeout(() => {
        setTransition(null);
      }, 3000);
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

  // Transition screens take priority over phase rendering
  if (transition === "assignmentReveal" && targetName) {
    return (
      <div style={{ ...containerStyle, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ animation: "sa-scaleIn 0.5s ease-out", marginBottom: "24px" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px", animation: "sa-heartbeat 1.5s ease-in-out infinite" }}>💌</div>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}>
            Your secret target is...
          </p>
          <p style={{
            fontSize: "32px",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #ff6b9d, #c44dff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "sa-slideUp 0.6s ease-out 0.3s both",
          }}>
            {targetName}
          </p>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", animation: "sa-fadeIn 0.5s ease-out 0.8s both" }}>
          Write anonymous messages about them... 🤫
        </p>
      </div>
    );
  }

  if (transition === "roundResults" && roundResultsData) {
    return (
      <div style={{ ...containerStyle, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ animation: "sa-scaleIn 0.4s ease-out" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px", animation: "sa-confetti 2s ease-out infinite" }}>🏆</div>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text-primary)", marginBottom: "16px" }}>
            Round {currentRound} Results
          </p>
          {roundResultsData.winningText ? (
            <div style={{
              background: "linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 107, 157, 0.08))",
              border: "2px solid rgba(255, 215, 0, 0.3)",
              borderRadius: "16px",
              padding: "16px",
              marginBottom: "16px",
              maxWidth: "320px",
              animation: "sa-slideUp 0.4s ease-out 0.2s both",
            }}>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>
                ⭐ Community Favorite
              </p>
              <p style={{ fontSize: "15px", color: "var(--text-primary)", fontStyle: "italic", lineHeight: "1.5" }}>
                &ldquo;{roundResultsData.winningText}&rdquo;
              </p>
            </div>
          ) : (
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              No votes this round — on to the next! 🚀
            </p>
          )}
        </div>
      </div>
    );
  }

  if (transition === "tallyingReactions") {
    return (
      <div style={{ ...containerStyle, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ animation: "sa-pulse 1s ease-in-out infinite" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>💫</div>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text-primary)" }}>
            Tallying reactions...
          </p>
        </div>
      </div>
    );
  }

  if (transition === "guessingIntro") {
    return (
      <div style={{ ...containerStyle, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ animation: "sa-scaleIn 0.5s ease-out" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px", animation: "sa-float 2s ease-in-out infinite" }}>🕵️</div>
          <p style={{
            fontSize: "22px",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #6c63ff, #c44dff)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "8px",
          }}>
            Time to guess your admirer!
          </p>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            Who&apos;s been writing about you? 🤔
          </p>
        </div>
      </div>
    );
  }

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
      return <RevealPhase revealData={revealData} isHost={isHost} />;
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
