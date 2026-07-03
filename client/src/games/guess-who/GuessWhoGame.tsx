import React, { useCallback, useEffect, useRef, useState } from "react";
import socket from "../../socket";
import type { GameUIProps } from "../registry";
import type { GWClientState, GWPhoto, GWPhase } from "./types";

const REQUIRED_PHOTOS = 24;

/* ─── Photo compression utility ──────────────────────────────── */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 300;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas context failed")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

/* ─── CSS keyframes ───────────────────────────────────────────── */
const KF_ID = "gw-keyframes";
function injectKeyframes() {
  if (document.getElementById(KF_ID)) return;
  const s = document.createElement("style");
  s.id = KF_ID;
  s.textContent = `
    @keyframes gw-fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes gw-pulse  { 0%,100% { box-shadow:0 0 8px rgba(99,102,241,.4); } 50% { box-shadow:0 0 20px rgba(99,102,241,.8); } }
    @keyframes gw-bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
    @keyframes gw-pop    { 0% { transform:scale(0.8); opacity:0; } 100% { transform:scale(1); opacity:1; } }
    @keyframes gw-glow   { 0%,100% { box-shadow:0 0 6px rgba(251,191,36,.3); } 50% { box-shadow:0 0 18px rgba(251,191,36,.7); } }
    @keyframes gw-pillPulse { 0%,100% { box-shadow:0 0 4px rgba(251,191,36,.2); } 50% { box-shadow:0 0 14px rgba(251,191,36,.6); } }
    @keyframes gw-btnPulse { 0%,100% { box-shadow:0 0 8px rgba(34,197,94,.3); } 50% { box-shadow:0 0 24px rgba(34,197,94,.7); } }
    @keyframes gw-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @keyframes gw-shimmer { 0% { background-position:200% center; } 100% { background-position:-200% center; } }
    @keyframes gw-float1 { 0%,100% { transform:translate(0,0) rotate(0deg); } 50% { transform:translate(15px,-25px) rotate(15deg); } }
    @keyframes gw-float2 { 0%,100% { transform:translate(0,0) rotate(0deg); } 50% { transform:translate(-12px,-20px) rotate(-10deg); } }
    @keyframes gw-float3 { 0%,100% { transform:translate(0,0) rotate(0deg); } 50% { transform:translate(10px,-30px) rotate(8deg); } }
    @keyframes gw-float4 { 0%,100% { transform:translate(0,0) rotate(0deg); } 50% { transform:translate(-8px,-18px) rotate(-12deg); } }
    @keyframes gw-float5 { 0%,100% { transform:translate(0,0) rotate(0deg); } 50% { transform:translate(12px,-22px) rotate(6deg); } }
  `;
  document.head.appendChild(s);
}

/* ─── Styles ──────────────────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px 16px",
    background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    position: "relative" as const,
    overflow: "hidden",
  },
  container: {
    width: "100%",
    maxWidth: "480px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  },
  title: {
    fontSize: "1.8rem",
    fontWeight: 900,
    color: "#e2e8f0",
    margin: "0 0 4px",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "0.95rem",
    color: "#94a3b8",
    margin: 0,
  },
  card: {
    width: "100%",
    background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    padding: "16px",
  },
  sectionLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#64748b",
    margin: "0 0 10px",
    textTransform: "uppercase" as const,
  },
  bigBtn: {
    width: "100%",
    padding: "16px",
    borderRadius: "14px",
    border: "none",
    fontSize: "1.05rem",
    fontWeight: 800,
    color: "#fff",
    cursor: "pointer",
    letterSpacing: "-0.01em",
  },
  toast: {
    position: "fixed" as const,
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(15,23,42,.95)",
    border: "1px solid rgba(148,163,184,.2)",
    borderRadius: "12px",
    padding: "10px 20px",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    fontWeight: 600,
    zIndex: 9999,
    backdropFilter: "blur(8px)",
    animation: "gw-fadeIn .3s ease-out",
  },
  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "4px",
    width: "100%",
  },
  photoCell: {
    position: "relative" as const,
    aspectRatio: "1",
    borderRadius: "8px",
    overflow: "hidden",
    cursor: "pointer",
    border: "2px solid transparent",
    transition: "all .15s ease",
  },
  photoImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
};

/* ─── Main Component ──────────────────────────────────────────── */
export const GuessWhoGame: React.FC<GameUIProps> = ({
  players,
  myPlayerId,
}) => {
  const [gameState, setGameState] = useState<GWClientState | null>(null);
  const [phase, setPhase] = useState<GWPhase>("upload");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { injectKeyframes(); }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Socket wiring ─────────────────────────────────────────── */
  useEffect(() => {
    socket.emit("gameEvent", { type: "getState" }, (response: { success: boolean; state?: GWClientState }) => {
      const state = response?.state;
      if (state) {
        setGameState(state);
        setPhase(state.phase);
      }
    });

    function onPhaseChanged(data: { phase: GWPhase }) {
      setPhase(data.phase);
      socket.emit("gameEvent", { type: "getState" }, (response: { success: boolean; state?: GWClientState }) => {
        const state = response?.state;
        if (state) {
          setGameState(state);
          setPhase(state.phase);
        }
      });
    }

    function onPhotoUploaded(data: { photo: GWPhoto; count: number }) {
      setGameState((prev) => {
        if (!prev) return prev;
        // Avoid duplicates
        if (prev.photos.some((p) => p.id === data.photo.id)) return prev;
        return { ...prev, photos: [...prev.photos, data.photo] };
      });
    }

    function onPickConfirmed(data: { sideId: string; photoId: string | null }) {
      setGameState((prev) => {
        if (!prev) return prev;
        if (data.sideId === prev.mySideId && data.photoId) {
          return { ...prev, myPick: data.photoId };
        } else if (data.sideId !== prev.mySideId) {
          return { ...prev, opponentHasPicked: true };
        }
        return prev;
      });
    }

    function onTurnStarted(data: { activeSideIndex: number; sideId: string }) {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          activeSideIndex: data.activeSideIndex,
          isMyTurn: prev.mySideId === data.sideId,
        };
      });
    }

    function onError(data: { message: string }) {
      showToast(`❌ ${data.message}`);
    }

    socket.on("gwPhaseChanged", onPhaseChanged);
    socket.on("gwPhotoUploaded", onPhotoUploaded);
    socket.on("gwPickConfirmed", onPickConfirmed);
    socket.on("gwTurnStarted", onTurnStarted);
    socket.on("error", onError);

    return () => {
      socket.off("gwPhaseChanged", onPhaseChanged);
      socket.off("gwPhotoUploaded", onPhotoUploaded);
      socket.off("gwPickConfirmed", onPickConfirmed);
      socket.off("gwTurnStarted", onTurnStarted);
      socket.off("error", onError);
    };
  }, [myPlayerId, showToast]);

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <div style={S.root}>
      {/* Floating question marks background */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} aria-hidden="true">
        <span style={{ position: "absolute", top: "8%", left: "5%", fontSize: "2.5rem", opacity: 0.12, animation: "gw-float1 7s ease-in-out infinite" }}>❓</span>
        <span style={{ position: "absolute", top: "15%", right: "8%", fontSize: "2rem", opacity: 0.1, animation: "gw-float2 9s ease-in-out infinite" }}>❔</span>
        <span style={{ position: "absolute", top: "40%", left: "3%", fontSize: "1.8rem", opacity: 0.08, animation: "gw-float3 8s ease-in-out infinite" }}>❓</span>
        <span style={{ position: "absolute", top: "60%", right: "5%", fontSize: "2.2rem", opacity: 0.1, animation: "gw-float4 10s ease-in-out infinite" }}>❔</span>
        <span style={{ position: "absolute", top: "75%", left: "10%", fontSize: "1.5rem", opacity: 0.09, animation: "gw-float5 11s ease-in-out infinite" }}>❓</span>
        <span style={{ position: "absolute", top: "30%", right: "15%", fontSize: "1.6rem", opacity: 0.07, animation: "gw-float1 12s ease-in-out infinite", animationDelay: "2s" }}>🔍</span>
        <span style={{ position: "absolute", top: "85%", right: "12%", fontSize: "1.4rem", opacity: 0.08, animation: "gw-float3 9s ease-in-out infinite", animationDelay: "3s" }}>🤔</span>
      </div>

      {toast && <div style={S.toast} role="alert" aria-live="assertive">{toast}</div>}

      {phase === "upload" && (
        <UploadPhase
          gameState={gameState}
          onToast={showToast}
        />
      )}
      {phase === "pick" && gameState && (
        <PickPhase
          gameState={gameState}
          onToast={showToast}
        />
      )}
      {phase === "play" && gameState && (
        <PlayPhase
          gameState={gameState}
          players={players}
          myPlayerId={myPlayerId}
          onToast={showToast}
        />
      )}
      {phase === "gameOver" && gameState && (
        <GameOverScreen
          gameState={gameState}
          players={players}
          myPlayerId={myPlayerId}
        />
      )}
      {!gameState && phase === "upload" && (
        <div style={S.container}>
          <span style={{ fontSize: "3rem", animation: "gw-bounce 1s ease-in-out infinite" }}>🔍</span>
          <p style={{ color: "#94a3b8" }}>Loading game...</p>
        </div>
      )}
    </div>
  );
};

/* ─── Upload Phase ────────────────────────────────────────────── */
interface UploadPhaseProps {
  gameState: GWClientState | null;
  onToast: (msg: string) => void;
}

const UploadPhase: React.FC<UploadPhaseProps> = ({ gameState, onToast }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const photoCount = gameState?.photos.length ?? 0;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      if (photoCount + i >= REQUIRED_PHOTOS) break;
      try {
        const dataUrl = await compressImage(files[i]);
        socket.emit("gameEvent", { type: "uploadPhoto", payload: { dataUrl } });
      } catch {
        onToast("❌ Failed to compress image");
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div style={S.container}>
      <div style={{ textAlign: "center", animation: "gw-fadeIn .5s ease-out" }}>
        <h1 style={S.title}>🔍 Guess Who</h1>
        <p style={S.subtitle}>Upload photos to build the board</p>
      </div>

      {/* Progress */}
      <div style={S.card}>
        <p style={S.sectionLabel}>PHOTO POOL</p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            flex: 1,
            height: "8px",
            borderRadius: "4px",
            background: "rgba(30,41,59,.8)",
            overflow: "hidden",
          }}>
            <div style={{
              width: `${(photoCount / REQUIRED_PHOTOS) * 100}%`,
              height: "100%",
              background: photoCount >= REQUIRED_PHOTOS
                ? "linear-gradient(90deg, #22c55e, #4ade80)"
                : "linear-gradient(90deg, #6366f1, #818cf8)",
              borderRadius: "4px",
              transition: "width .3s ease",
            }} />
          </div>
          <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "0.95rem" }}>
            {photoCount}/{REQUIRED_PHOTOS}
          </span>
        </div>
      </div>

      {/* Upload buttons */}
      <div style={{ display: "flex", gap: "10px", width: "100%" }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || photoCount >= REQUIRED_PHOTOS}
          style={{
            ...S.bigBtn,
            flex: 1,
            background: photoCount >= REQUIRED_PHOTOS
              ? "rgba(30,41,59,.5)"
              : "linear-gradient(135deg, #4f46e5, #7c3aed)",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? "Uploading..." : "📷 Upload Photos"}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Photo preview grid */}
      {photoCount > 0 && (
        <div style={S.card}>
          <p style={S.sectionLabel}>UPLOADED PHOTOS</p>
          <div style={S.photoGrid}>
            {gameState?.photos.map((photo) => (
              <div key={photo.id} style={{ ...S.photoCell, animation: "gw-pop .3s ease-out" }}>
                <img src={photo.dataUrl} alt="uploaded" style={S.photoImg} />
              </div>
            ))}
          </div>
        </div>
      )}

      {photoCount >= REQUIRED_PHOTOS && (
        <p style={{ color: "#4ade80", fontWeight: 700, textAlign: "center" }}>
          ✅ All photos uploaded! Moving to pick phase...
        </p>
      )}
    </div>
  );
};

/* ─── Pick Phase ──────────────────────────────────────────────── */
interface PickPhaseProps {
  gameState: GWClientState;
  onToast: (msg: string) => void;
}

const PickPhase: React.FC<PickPhaseProps> = ({ gameState, onToast }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hasPicked = gameState.myPick !== null;

  function handleConfirmPick() {
    if (!selectedId) { onToast("Select a photo first"); return; }
    socket.emit("gameEvent", { type: "pickPerson", payload: { photoId: selectedId } });
  }

  // Find the picked photo for the waiting state
  const pickedPhoto = hasPicked
    ? gameState.photos.find((p) => p.id === gameState.myPick)
    : null;

  return (
    <div style={S.container}>
      {/* Secrecy banner */}
      <div style={{
        width: "100%",
        textAlign: "center",
        padding: "8px 16px",
        borderRadius: "12px",
        background: "rgba(251,191,36,.08)",
        border: "1px solid rgba(251,191,36,.2)",
        animation: "gw-fadeIn .5s ease-out",
      }}>
        <span style={{ fontSize: "0.85rem", color: "#fbbf24", fontWeight: 600 }}>
          🙈 Don't let anyone see your screen!
        </span>
      </div>

      {/* Header */}
      <div style={{ textAlign: "center", animation: "gw-fadeIn .5s ease-out" }}>
        <div style={{ fontSize: "3rem", marginBottom: "8px" }}>🕵️‍♂️</div>
        <h1 style={{
          fontSize: "2rem",
          fontWeight: 900,
          margin: "0 0 6px",
          letterSpacing: "-0.02em",
          background: "linear-gradient(135deg, #e2e8f0, #818cf8, #c084fc)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          Pick Your Person
        </h1>
        <p style={{ fontSize: "0.95rem", color: "#94a3b8", margin: 0 }}>
          {hasPicked
            ? "🎯 Locked in! Now we wait..."
            : "🤫 This is top secret! Choose wisely..."}
        </p>
      </div>

      {/* Status pills */}
      <div style={{ ...S.card, padding: "12px 16px" }}>
        <p style={S.sectionLabel}>STATUS</p>
        <div style={{ display: "flex", gap: "12px" }}>
          <span style={{
            padding: "8px 16px", borderRadius: "24px", fontSize: "14px", fontWeight: 700,
            background: hasPicked ? "rgba(34,197,94,.15)" : "rgba(251,191,36,.1)",
            border: `2px solid ${hasPicked ? "#22c55e" : "rgba(251,191,36,.4)"}`,
            color: hasPicked ? "#4ade80" : "#fbbf24",
            animation: hasPicked ? "none" : "gw-pillPulse 2s ease-in-out infinite",
          }}>
            🙋 You {hasPicked ? "✓" : "…"}
          </span>
          <span style={{
            padding: "8px 16px", borderRadius: "24px", fontSize: "14px", fontWeight: 700,
            background: gameState.opponentHasPicked ? "rgba(34,197,94,.15)" : "rgba(251,191,36,.1)",
            border: `2px solid ${gameState.opponentHasPicked ? "#22c55e" : "rgba(251,191,36,.4)"}`,
            color: gameState.opponentHasPicked ? "#4ade80" : "#fbbf24",
            animation: gameState.opponentHasPicked ? "none" : "gw-pillPulse 2s ease-in-out infinite",
          }}>
            🕵️ Opponent {gameState.opponentHasPicked ? "✓" : "…"}
          </span>
        </div>
      </div>

      {/* Photo grid for picking */}
      {!hasPicked && (
        <>
          <div style={S.card}>
            <p style={S.sectionLabel}>TAP TO SELECT YOUR PERSON</p>
            <div style={S.photoGrid}>
              {gameState.photos.map((photo) => {
                const isSelected = selectedId === photo.id;
                const isHovered = hoveredId === photo.id;
                return (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedId(photo.id)}
                    onMouseEnter={() => setHoveredId(photo.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      ...S.photoCell,
                      transform: isSelected ? "scale(1.05)" : isHovered ? "scale(1.03)" : "scale(1)",
                      border: isSelected
                        ? "2px solid #fbbf24"
                        : "2px solid transparent",
                      boxShadow: isSelected
                        ? "0 0 16px rgba(251,191,36,.6), inset 0 0 4px rgba(251,191,36,.2)"
                        : isHovered
                        ? "0 0 10px rgba(99,102,241,.4)"
                        : "none",
                      animation: isSelected ? "gw-glow 2s ease-in-out infinite" : "none",
                      zIndex: isSelected ? 2 : isHovered ? 1 : 0,
                    }}
                  >
                    <img src={photo.dataUrl} alt="pick option" style={S.photoImg} />
                    {/* Selected badge */}
                    {isSelected && (
                      <div style={{
                        position: "absolute",
                        top: "2px",
                        right: "2px",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        boxShadow: "0 2px 6px rgba(251,191,36,.5)",
                      }}>
                        ✓
                      </div>
                    )}
                    {/* Sparkle overlay for selected */}
                    {isSelected && (
                      <div style={{
                        position: "absolute",
                        top: "2px",
                        left: "2px",
                        fontSize: "12px",
                        filter: "drop-shadow(0 0 2px rgba(251,191,36,.8))",
                      }}>
                        ✨
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleConfirmPick}
            disabled={!selectedId}
            style={{
              ...S.bigBtn,
              padding: "18px 24px",
              fontSize: "1.15rem",
              background: selectedId
                ? "linear-gradient(135deg, #15803d, #22c55e, #4ade80)"
                : "rgba(30,41,59,.5)",
              opacity: selectedId ? 1 : 0.5,
              cursor: selectedId ? "pointer" : "not-allowed",
              animation: selectedId ? "gw-btnPulse 2s ease-in-out infinite" : "none",
              transition: "all .2s ease",
            }}
          >
            🔒 Lock In My Pick
          </button>
        </>
      )}

      {/* Waiting state after picking */}
      {hasPicked && (
        <div style={{
          ...S.card,
          textAlign: "center",
          padding: "24px",
          animation: "gw-fadeIn .5s ease-out",
        }}>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: "0 0 12px" }}>
            Your secret person is...
          </p>
          {pickedPhoto && (
            <div style={{
              width: "120px",
              height: "120px",
              borderRadius: "16px",
              overflow: "hidden",
              margin: "0 auto 16px",
              border: "3px solid #fbbf24",
              boxShadow: "0 0 20px rgba(251,191,36,.4)",
              animation: "gw-glow 2s ease-in-out infinite",
            }}>
              <img src={pickedPhoto.dataUrl} alt="your pick" style={S.photoImg} />
            </div>
          )}
          <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "1rem", margin: "0 0 16px" }}>
            🤫 Keep it secret!
          </p>
          {!gameState.opponentHasPicked && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <div style={{
                width: "16px",
                height: "16px",
                border: "2px solid #818cf8",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "gw-spin 1s linear infinite",
              }} />
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                Waiting for opponent to pick...
              </span>
            </div>
          )}
          {gameState.opponentHasPicked && (
            <p style={{ color: "#4ade80", fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
              ✅ Both players ready! Starting game...
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Play Phase ──────────────────────────────────────────────── */
interface PlayPhaseProps {
  gameState: GWClientState;
  players: GameUIProps["players"];
  myPlayerId: string;
  onToast: (msg: string) => void;
}

const PlayPhase: React.FC<PlayPhaseProps> = ({ gameState, players, myPlayerId, onToast }) => {
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [guessMode, setGuessMode] = useState(false);

  const isMyTurn = gameState.isMyTurn;

  function toggleEliminate(photoId: string) {
    setEliminated((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }

  function handleDone() {
    socket.emit("gameEvent", { type: "endTurn", payload: {} });
  }

  function handleGuessClick(photoId: string) {
    if (!guessMode) return;
    socket.emit("gameEvent", { type: "makeGuess", payload: { photoId } });
    setGuessMode(false);
  }

  function handlePhotoClick(photoId: string) {
    if (guessMode) {
      handleGuessClick(photoId);
    } else {
      toggleEliminate(photoId);
    }
  }

  // Find my pick photo
  const myPickPhoto = gameState.photos.find((p) => p.id === gameState.myPick);

  return (
    <div style={S.container}>
      <div style={{ textAlign: "center", animation: "gw-fadeIn .5s ease-out" }}>
        <h1 style={S.title}>🔍 Guess Who</h1>
        <p style={S.subtitle}>
          {isMyTurn
            ? "Your turn — ask a question, then eliminate!"
            : "Opponent's turn — wait..."}
        </p>
      </div>

      {/* Turn indicator */}
      <div style={{
        ...S.card,
        border: isMyTurn ? "1px solid #4ade80" : "1px solid rgba(148,163,184,.1)",
        background: isMyTurn ? "rgba(34,197,94,.08)" : "rgba(15,23,42,.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            color: isMyTurn ? "#4ade80" : "#94a3b8",
            fontWeight: 700,
            fontSize: "0.95rem",
          }}>
            {isMyTurn ? "🎯 YOUR TURN" : "⏳ OPPONENT'S TURN"}
          </span>
          {myPickPhoto && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Your person:</span>
              <img
                src={myPickPhoto.dataUrl}
                alt="my person"
                style={{ width: "28px", height: "28px", borderRadius: "4px", objectFit: "cover" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Guess mode banner */}
      {guessMode && (
        <div style={{
          width: "100%",
          padding: "10px",
          borderRadius: "10px",
          background: "rgba(239,68,68,.15)",
          border: "1px solid #f87171",
          textAlign: "center",
          color: "#fca5a5",
          fontWeight: 700,
          fontSize: "0.9rem",
        }}>
          ⚠️ GUESS MODE — Tap the photo you think is their person!
        </div>
      )}

      {/* 6×4 Photo grid */}
      <div style={S.card}>
        <p style={S.sectionLabel}>
          {guessMode ? "TAP TO GUESS" : "TAP TO ELIMINATE"}
        </p>
        <div style={S.photoGrid}>
          {gameState.photos.map((photo) => {
            const isEliminated = eliminated.has(photo.id);
            return (
              <div
                key={photo.id}
                onClick={() => handlePhotoClick(photo.id)}
                style={{
                  ...S.photoCell,
                  opacity: isEliminated ? 0.25 : 1,
                  filter: isEliminated ? "grayscale(1)" : "none",
                  border: guessMode ? "2px solid #f87171" : "2px solid transparent",
                }}
              >
                <img src={photo.dataUrl} alt="person" style={S.photoImg} />
                {isEliminated && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,.5)",
                    fontSize: "1.4rem",
                  }}>
                    ✕
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons (only on your turn) */}
      {isMyTurn && (
        <div style={{ display: "flex", gap: "10px", width: "100%" }}>
          <button
            onClick={handleDone}
            style={{
              ...S.bigBtn,
              flex: 1,
              background: "linear-gradient(135deg, #0284c7, #0ea5e9)",
            }}
          >
            ✓ Done
          </button>
          <button
            onClick={() => setGuessMode(!guessMode)}
            style={{
              ...S.bigBtn,
              flex: 1,
              background: guessMode
                ? "linear-gradient(135deg, #dc2626, #ef4444)"
                : "linear-gradient(135deg, #b45309, #f59e0b)",
            }}
          >
            {guessMode ? "✕ Cancel" : "🎯 Guess"}
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── Game Over Screen ────────────────────────────────────────── */
interface GameOverScreenProps {
  gameState: GWClientState;
  players: GameUIProps["players"];
  myPlayerId: string;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ gameState, players, myPlayerId }) => {
  const iWon = gameState.winnerPlayerIds.includes(myPlayerId);
  const winnerNames = gameState.winnerPlayerIds
    .map((id) => players.find((p) => p.id === id)?.name ?? id)
    .join(", ");

  const winnerPhoto = gameState.photos.find((p) => p.id === gameState.winnerPickId);
  const loserPhoto = gameState.photos.find((p) => p.id === gameState.loserPickId);

  return (
    <div style={S.container}>
      <div style={{ textAlign: "center", animation: "gw-fadeIn .5s ease-out" }}>
        <h1 style={{ ...S.title, fontSize: "2.2rem" }}>
          {iWon ? "🎉 You Win!" : "😢 You Lose!"}
        </h1>
        <p style={S.subtitle}>
          {iWon ? "Congratulations!" : `${winnerNames} won!`}
        </p>
      </div>

      {/* Reveal picks */}
      <div style={S.card}>
        <p style={S.sectionLabel}>REVEALED PICKS</p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
          {winnerPhoto && (
            <div style={{ textAlign: "center" }}>
              <img
                src={winnerPhoto.dataUrl}
                alt="winner pick"
                style={{
                  width: "80px", height: "80px",
                  borderRadius: "12px", objectFit: "cover",
                  border: "3px solid #4ade80",
                }}
              />
              <p style={{ color: "#4ade80", fontSize: "12px", marginTop: "6px", fontWeight: 700 }}>
                Winner's Pick
              </p>
            </div>
          )}
          {loserPhoto && (
            <div style={{ textAlign: "center" }}>
              <img
                src={loserPhoto.dataUrl}
                alt="loser pick"
                style={{
                  width: "80px", height: "80px",
                  borderRadius: "12px", objectFit: "cover",
                  border: "3px solid #f87171",
                }}
              />
              <p style={{ color: "#f87171", fontSize: "12px", marginTop: "6px", fontWeight: 700 }}>
                Loser's Pick
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
