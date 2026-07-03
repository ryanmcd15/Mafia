import React, { useState, useEffect, useCallback, useRef } from "react";
import socket from "../../socket";
import type { GameUIProps } from "../registry";
import type { FAPhase, FAPoint, FAStroke, FAPlayer } from "./types";

// ---------- Styles ----------

const containerStyle: React.CSSProperties = {
  padding: "16px",
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

const canvasContainerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "300px",
  margin: "0 auto 16px",
  aspectRatio: "1",
  borderRadius: "12px",
  overflow: "hidden",
  border: "3px solid var(--bg-tertiary)",
  background: "#ffffff",
  touchAction: "none",
};

// ---------- Component ----------

export const FakeArtistGame: React.FC<GameUIProps> = ({ players, myPlayerId }) => {
  const [phase, setPhase] = useState<FAPhase>("roleAssignment");
  const [word, setWord] = useState<string | null>(null);
  const [isFakeArtist, setIsFakeArtist] = useState(false);
  const [myColor, setMyColor] = useState("#3b82f6");
  const [faPlayers, setFaPlayers] = useState<FAPlayer[]>([]);
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [currentPlayerId, setCurrentPlayerId] = useState("");
  const [strokes, setStrokes] = useState<FAStroke[]>([]);
  const [round, setRound] = useState<1 | 2>(1);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [accusedId, setAccusedId] = useState<string | null>(null);
  const [fakeArtistId, setFakeArtistId] = useState<string | null>(null);
  const [fakeArtistWon, setFakeArtistWon] = useState<boolean | null>(null);
  const [fakeArtistGuess, setFakeArtistGuess] = useState<string | null>(null);
  const [revealedWord, setRevealedWord] = useState<string | null>(null);
  const [waitingForGuess, setWaitingForGuess] = useState(false);
  const [wordGuessInput, setWordGuessInput] = useState("");
  const [guessSubmitted, setGuessSubmitted] = useState(false);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentPoints = useRef<FAPoint[]>([]);
  const liveStrokeRef = useRef<{ playerId: string; color: string; points: FAPoint[] } | null>(null);

  // Timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isMyTurn = currentPlayerId === myPlayerId;

  const getPlayerName = useCallback(
    (id: string): string => {
      const fp = faPlayers.find((p) => p.id === id);
      if (fp) return fp.name;
      const p = players.find((pl) => pl.id === id);
      return p?.name ?? "Unknown";
    },
    [faPlayers, players]
  );

  const getPlayerColor = useCallback(
    (id: string): string => {
      const fp = faPlayers.find((p) => p.id === id);
      return fp?.color ?? "#3b82f6";
    },
    [faPlayers]
  );

  // ---------- Canvas Drawing ----------

  const drawAllStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw completed strokes
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
      }
      ctx.stroke();
    }

    // Draw live stroke (from another player currently drawing)
    const live = liveStrokeRef.current;
    if (live && live.points.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = live.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(live.points[0].x * canvas.width, live.points[0].y * canvas.height);
      for (let i = 1; i < live.points.length; i++) {
        ctx.lineTo(live.points[i].x * canvas.width, live.points[i].y * canvas.height);
      }
      ctx.stroke();
    }

    // Draw my current stroke
    const myPoints = currentPoints.current;
    if (myPoints.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = myColor;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(myPoints[0].x * canvas.width, myPoints[0].y * canvas.height);
      for (let i = 1; i < myPoints.length; i++) {
        ctx.lineTo(myPoints[i].x * canvas.width, myPoints[i].y * canvas.height);
      }
      ctx.stroke();
    }
  }, [strokes, myColor]);

  useEffect(() => {
    drawAllStrokes();
  }, [strokes, drawAllStrokes]);

  // ---------- Timer ----------

  useEffect(() => {
    if (phase === "drawing1" || phase === "drawing2" || phase === "voting") {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeRemaining(30);
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 0) return 0;
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, currentTurnIndex]);

  // ---------- Socket Listeners ----------

  useEffect(() => {
    // Request state on mount
    socket.emit("gameEvent", { type: "getState" }, (response: { success: boolean; state?: any }) => {
      if (response?.success && response.state) {
        const s = response.state;
        setPhase(s.phase);
        setWord(s.word);
        setIsFakeArtist(s.isFakeArtist);
        setMyColor(s.myColor);
        if (s.players) setFaPlayers(s.players);
        if (s.turnOrder) setTurnOrder(s.turnOrder);
        setCurrentTurnIndex(s.currentTurnIndex ?? 0);
        setCurrentPlayerId(s.currentPlayerId ?? "");
        if (s.strokes) setStrokes(s.strokes);
        setRound(s.round ?? 1);
        setTimeRemaining(s.turnTimeRemaining ?? 30);
        if (s.accusedId) setAccusedId(s.accusedId);
        if (s.fakeArtistId) setFakeArtistId(s.fakeArtistId);
        if (s.fakeArtistWon !== null) setFakeArtistWon(s.fakeArtistWon);
        if (s.fakeArtistGuess) setFakeArtistGuess(s.fakeArtistGuess);
      }
    });

    function handleRoleAssigned(data: any) {
      setWord(data.word);
      setIsFakeArtist(data.isFakeArtist);
      setMyColor(data.color);
      if (data.players) setFaPlayers(data.players);
      if (data.turnOrder) setTurnOrder(data.turnOrder);
      setPhase("roleAssignment");
    }

    function handlePhaseChanged(data: any) {
      setPhase(data.phase);
      if (data.round) setRound(data.round);
      if (data.currentTurnIndex !== undefined) setCurrentTurnIndex(data.currentTurnIndex);
      if (data.currentPlayerId) setCurrentPlayerId(data.currentPlayerId);
      if (data.turnOrder) setTurnOrder(data.turnOrder);
      if (data.fakeArtistId) setFakeArtistId(data.fakeArtistId);
      if (data.fakeArtistWon !== undefined) setFakeArtistWon(data.fakeArtistWon);
      if (data.waitingForGuess !== undefined) setWaitingForGuess(data.waitingForGuess);
      if (data.phase === "voting") {
        setVotedFor(null);
      }
    }

    function handleTurnStarted(data: any) {
      setCurrentTurnIndex(data.currentTurnIndex);
      setCurrentPlayerId(data.currentPlayerId);
      setRound(data.round);
      setTimeRemaining(30);
      liveStrokeRef.current = null;
      currentPoints.current = [];
    }

    function handleStrokePoint(data: { playerId: string; color: string; point: FAPoint }) {
      if (data.playerId === myPlayerId) return; // Already drawing locally
      if (!liveStrokeRef.current || liveStrokeRef.current.playerId !== data.playerId) {
        liveStrokeRef.current = { playerId: data.playerId, color: data.color, points: [] };
      }
      liveStrokeRef.current.points.push(data.point);
      drawAllStrokes();
    }

    function handleStrokeComplete(data: { playerId: string; color: string; points: FAPoint[]; round: 1 | 2 }) {
      if (data.points.length > 0) {
        setStrokes((prev) => [...prev, {
          playerId: data.playerId,
          color: data.color,
          points: data.points,
          round: data.round,
        }]);
      }
      liveStrokeRef.current = null;
    }

    function handleVoteResult(data: any) {
      setAccusedId(data.accusedId);
      if (data.accusedId === null) {
        // Not caught
        setFakeArtistWon(true);
      }
    }

    function handleGuessResult(data: any) {
      setFakeArtistId(data.fakeArtistId);
      setFakeArtistWon(data.fakeArtistWon);
      setFakeArtistGuess(data.fakeArtistGuess);
      setRevealedWord(data.word);
      setWaitingForGuess(false);
      setPhase("result");
    }

    socket.on("faRoleAssigned", handleRoleAssigned);
    socket.on("faPhaseChanged", handlePhaseChanged);
    socket.on("faTurnStarted", handleTurnStarted);
    socket.on("faStrokePoint", handleStrokePoint);
    socket.on("faStrokeComplete", handleStrokeComplete);
    socket.on("faVoteResult", handleVoteResult);
    socket.on("faGuessResult", handleGuessResult);

    return () => {
      socket.off("faRoleAssigned", handleRoleAssigned);
      socket.off("faPhaseChanged", handlePhaseChanged);
      socket.off("faTurnStarted", handleTurnStarted);
      socket.off("faStrokePoint", handleStrokePoint);
      socket.off("faStrokeComplete", handleStrokeComplete);
      socket.off("faVoteResult", handleVoteResult);
      socket.off("faGuessResult", handleGuessResult);
    };
  }, [myPlayerId, drawAllStrokes]);

  // ---------- Canvas Event Handlers ----------

  function getCanvasPoint(e: React.MouseEvent | React.TouchEvent): FAPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!isMyTurn) return;
    if (phase !== "drawing1" && phase !== "drawing2") return;
    e.preventDefault();
    isDrawing.current = true;
    const point = getCanvasPoint(e);
    if (point) {
      currentPoints.current = [point];
      socket.emit("gameEvent", { type: "drawPoint", payload: point });
      drawAllStrokes();
    }
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current || !isMyTurn) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    if (point) {
      currentPoints.current.push(point);
      socket.emit("gameEvent", { type: "drawPoint", payload: point });
      drawAllStrokes();
    }
  }

  function handlePointerUp(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    e.preventDefault();
    isDrawing.current = false;
  }

  function handleDone() {
    isDrawing.current = false;
    currentPoints.current = [];
    socket.emit("gameEvent", { type: "strokeDone", payload: {} });
  }

  function handleVote(accusedId: string) {
    socket.emit("gameEvent", { type: "submitVote", payload: { accusedId } });
    setVotedFor(accusedId);
  }

  function handleSubmitGuess() {
    if (!wordGuessInput.trim()) return;
    socket.emit("gameEvent", { type: "submitWordGuess", payload: { word: wordGuessInput.trim() } });
    setGuessSubmitted(true);
  }

  // ---------- Render: Role Assignment ----------

  if (phase === "roleAssignment") {
    return (
      <div style={containerStyle}>
        <h2 style={headingStyle}>🎨 Fake Artist</h2>
        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: "16px",
            padding: "24px",
            textAlign: "center",
            marginBottom: "16px",
          }}
        >
          {isFakeArtist ? (
            <>
              <p style={{ fontSize: "16px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                You are the...
              </p>
              <p style={{ fontSize: "28px", fontWeight: "bold", color: "var(--danger)" }}>
                🕵️ Fake Artist!
              </p>
              <p style={{ fontSize: "40px", marginTop: "12px" }}>???</p>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Try to blend in without knowing the word!
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "16px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                The word is...
              </p>
              <p style={{ fontSize: "32px", fontWeight: "bold", color: "var(--accent)" }}>
                {word}
              </p>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Draw it — but don't make it too obvious!
              </p>
            </>
          )}
          <div
            style={{
              display: "inline-block",
              marginTop: "16px",
              padding: "8px 16px",
              borderRadius: "20px",
              background: myColor,
              color: "#fff",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            Your color
          </div>
        </div>
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
          Drawing starts in a few seconds...
        </p>
      </div>
    );
  }

  // ---------- Render: Drawing Phase ----------

  if (phase === "drawing1" || phase === "drawing2") {
    const timerColor = timeRemaining <= 10 ? "var(--danger)" : "var(--text-primary)";

    return (
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            Round {round}/2
          </span>
          <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            {isFakeArtist ? "???" : word}
          </span>
          <span style={{ fontSize: "18px", fontWeight: "bold", color: timerColor, fontVariantNumeric: "tabular-nums" }}>
            {timeRemaining}s
          </span>
        </div>

        {/* Turn indicator */}
        <div
          style={{
            background: isMyTurn ? "rgba(34, 197, 94, 0.15)" : "var(--bg-secondary)",
            border: isMyTurn ? "2px solid var(--success)" : "2px solid transparent",
            borderRadius: "10px",
            padding: "10px 16px",
            marginBottom: "12px",
            textAlign: "center",
          }}
        >
          <span style={{ fontWeight: "bold", fontSize: "14px" }}>
            {isMyTurn ? "✏️ Your turn to draw!" : `${getPlayerName(currentPlayerId)}'s turn`}
          </span>
          <span
            style={{
              display: "inline-block",
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: getPlayerColor(currentPlayerId),
              marginLeft: "8px",
              verticalAlign: "middle",
            }}
          />
        </div>

        {/* Canvas */}
        <div style={canvasContainerStyle}>
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            style={{ width: "100%", height: "100%", display: "block" }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        </div>

        {/* Done button */}
        {isMyTurn && (
          <button
            onClick={handleDone}
            style={{
              ...buttonBase,
              background: "var(--success)",
              color: "#ffffff",
            }}
          >
            Done ✓
          </button>
        )}

        {/* Turn order */}
        <div style={{ marginTop: "12px" }}>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px" }}>Turn order:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {turnOrder.map((pid, idx) => (
              <div
                key={pid}
                style={{
                  padding: "4px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: idx === currentTurnIndex ? "bold" : "normal",
                  background: idx === currentTurnIndex ? getPlayerColor(pid) : "var(--bg-secondary)",
                  color: idx === currentTurnIndex ? "#fff" : "var(--text-secondary)",
                  opacity: idx < currentTurnIndex ? 0.5 : 1,
                }}
              >
                {getPlayerName(pid)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Render: Voting Phase ----------

  if (phase === "voting") {
    const timerColor = timeRemaining <= 10 ? "var(--danger)" : "var(--text-primary)";

    return (
      <div style={containerStyle}>
        <h2 style={headingStyle}>🗳️ Who is the Fake Artist?</h2>

        {/* Timer */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "24px", fontWeight: "bold", color: timerColor, fontVariantNumeric: "tabular-nums" }}>
            {timeRemaining}s
          </span>
        </div>

        {/* Canvas preview */}
        <div style={{ ...canvasContainerStyle, marginBottom: "16px", pointerEvents: "none" }}>
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>

        {votedFor ? (
          <div
            style={{
              textAlign: "center",
              padding: "24px",
              background: "var(--bg-secondary)",
              borderRadius: "12px",
            }}
          >
            <p style={{ fontSize: "18px", fontWeight: "bold", color: "var(--success)" }}>
              Vote submitted!
            </p>
            <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
              Waiting for others...
            </p>
          </div>
        ) : (
          <div>
            {faPlayers
              .filter((p) => p.id !== myPlayerId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleVote(p.id)}
                  style={{
                    ...buttonBase,
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "2px solid var(--bg-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: p.color,
                      display: "inline-block",
                    }}
                  />
                  {p.name}
                </button>
              ))}
            <button
              onClick={() => handleVote("skip")}
              style={{
                ...buttonBase,
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--bg-tertiary)",
              }}
            >
              Skip
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- Render: Result Phase ----------

  if (phase === "result") {
    const caught = accusedId === fakeArtistId;
    const displayWord = revealedWord ?? word;

    // Waiting for fake artist to guess
    if (waitingForGuess && isFakeArtist && !guessSubmitted) {
      return (
        <div style={containerStyle}>
          <h2 style={{ ...headingStyle, color: "var(--danger)" }}>
            🕵️ You've been caught!
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-secondary)", marginBottom: "16px" }}>
            Guess the word to still win!
          </p>
          <input
            type="text"
            value={wordGuessInput}
            onChange={(e) => setWordGuessInput(e.target.value)}
            placeholder="Type the word..."
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: "18px",
              borderRadius: "8px",
              border: "2px solid var(--bg-tertiary)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              marginBottom: "12px",
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmitGuess()}
            autoFocus
          />
          <button
            onClick={handleSubmitGuess}
            style={{ ...buttonBase, background: "var(--accent)", color: "#fff" }}
          >
            Submit Guess
          </button>
        </div>
      );
    }

    if (waitingForGuess && !isFakeArtist) {
      return (
        <div style={containerStyle}>
          <h2 style={headingStyle}>🎯 Fake Artist Caught!</h2>
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            Waiting for the Fake Artist to guess the word...
          </p>
        </div>
      );
    }

    if (waitingForGuess && guessSubmitted) {
      return (
        <div style={containerStyle}>
          <h2 style={headingStyle}>Guess submitted!</h2>
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            Waiting for result...
          </p>
        </div>
      );
    }

    // Final result
    return (
      <div style={containerStyle}>
        <h2
          style={{
            ...headingStyle,
            fontSize: "24px",
            color: fakeArtistWon ? "var(--danger)" : "var(--success)",
          }}
        >
          {fakeArtistWon ? "🕵️ Fake Artist Wins!" : "🎉 Artists Win!"}
        </h2>

        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "16px",
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>The Fake Artist was</p>
            <p style={{ fontSize: "20px", fontWeight: "bold", color: "var(--danger)" }}>
              {fakeArtistId ? getPlayerName(fakeArtistId) : "Unknown"}{" "}
              <span
                style={{
                  display: "inline-block",
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: fakeArtistId ? getPlayerColor(fakeArtistId) : "#999",
                  verticalAlign: "middle",
                }}
              />
            </p>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>The word was</p>
            <p style={{ fontSize: "20px", fontWeight: "bold", color: "var(--accent)" }}>
              {displayWord}
            </p>
          </div>
          {caught && fakeArtistGuess && (
            <div>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                Fake Artist guessed
              </p>
              <p
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: fakeArtistWon ? "var(--success)" : "var(--danger)",
                }}
              >
                "{fakeArtistGuess}" {fakeArtistWon ? "✓ Correct!" : "✗ Wrong!"}
              </p>
            </div>
          )}
          {!caught && (
            <div>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                The group accused the wrong person (or no majority)
              </p>
            </div>
          )}
        </div>

        {/* Final canvas */}
        <div style={{ ...canvasContainerStyle, pointerEvents: "none" }}>
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>
      </div>
    );
  }

  // ---------- Fallback ----------

  return (
    <div style={{ ...containerStyle, textAlign: "center" }}>
      <p style={{ color: "var(--text-secondary)" }}>Waiting for game to start...</p>
    </div>
  );
};

export default FakeArtistGame;
