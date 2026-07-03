import React, { useCallback, useEffect, useRef, useState } from "react";
import socket from "../../socket";
import type { GameUIProps } from "../registry";
import {
  ALL_POOP_TYPES,
  BattleShitsClientState,
  Cell,
  cellKey,
  COLUMNS,
  FlushMarker,
  GamePhase,
  Orientation,
  POOP_SIZES,
  PoopType,
  ROWS,
} from "./types";

/* ─── CSS keyframes ───────────────────────────────────────────── */
const KF_ID = "bs-keyframes";
function injectKeyframes() {
  if (document.getElementById(KF_ID)) return;
  const s = document.createElement("style");
  s.id = KF_ID;
  s.textContent = `
    @keyframes bs-fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes bs-pulse  { 0%,100% { box-shadow:0 0 8px rgba(99,102,241,.4); } 50% { box-shadow:0 0 20px rgba(99,102,241,.8); } }
    @keyframes bs-sunk   { 0% { transform:scale(1); } 50% { transform:scale(1.15); } 100% { transform:scale(1); } }
    @keyframes bs-bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
    @keyframes bs-splash { 0% { opacity:1; transform:scale(0.5); } 100% { opacity:0.7; transform:scale(1); } }
    @keyframes bs-sunk-banner { 0% { opacity:0; transform:scale(0.7) translateY(-20px); } 50% { opacity:1; transform:scale(1.05) translateY(0); } 80% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(0.95) translateY(10px); } }
    @keyframes bs-cell-flash { 0%,100% { opacity:1; } 25%,75% { opacity:0.4; } 50% { opacity:1; } }
  `;
  document.head.appendChild(s);
}

/* ─── Poop color palette per type ─────────────────────────────── */
const POOP_COLORS: Record<PoopType, { fill: string; stroke: string; dark: string }> = {
  tiny:    { fill: "#a16207", stroke: "#78350f", dark: "#451a03" },
  regular: { fill: "#b45309", stroke: "#92400e", dark: "#451a03" },
  big:     { fill: "#854d0e", stroke: "#713f12", dark: "#3c1f05" },
  mega:    { fill: "#78350f", stroke: "#5c2d0a", dark: "#2e1207" },
};

/* ─── Full-poop SVG ───────────────────────────────────────────── */
function PoopModel({
  poopType,
  cells,
  orientation,
  isHit,
  isSunk,
  cellSize = 28,
  gap = 2,
}: {
  poopType: PoopType;
  cells: Cell[];
  orientation: "horizontal" | "vertical";
  isHit: boolean;
  isSunk: boolean;
  hitCells?: string[];
  cellSize?: number;
  gap?: number;
}) {
  const n = cells.length;
  const stride = cellSize + gap;
  const isH = orientation === "horizontal";
  const totalW = isH ? n * stride - gap : cellSize;
  const totalH = isH ? cellSize : n * stride - gap;
  const id = `pm-${poopType}-${n}-${isH ? "h" : "v"}`;

  // Sizing helpers
  const W = totalW;
  const H = totalH;

  // Build a bumpy organic poop silhouette using SVG paths
  // The poop is a low-lying elongated shape with lumps on top
  // We model it as a base ellipse + overlapping bump circles

  // Base: flat-bottomed ellipse spanning the full length
  const baseRx = isH ? W * 0.48 : W * 0.38;
  const baseRy = isH ? H * 0.32 : H * 0.48;
  const baseCx = W / 2;
  const baseCy = isH ? H * 0.72 : H / 2;

  // Generate bumps along the top surface
  // Number of bumps scales with poop size
  const numBumps = Math.max(n, 2);
  const bumps: Array<{ cx: number; cy: number; rx: number; ry: number; rotate?: number }> = [];

  for (let i = 0; i < numBumps; i++) {
    const t = numBumps === 1 ? 0.5 : i / (numBumps - 1);
    if (isH) {
      const bx = W * 0.1 + t * W * 0.8;
      const by = H * 0.45;
      const rx = (W / numBumps) * 0.52;
      const ry = H * 0.38;
      bumps.push({ cx: bx, cy: by, rx, ry });
    } else {
      const bx = W * 0.5;
      const by = H * 0.1 + t * H * 0.8;
      const rx = W * 0.38;
      const ry = (H / numBumps) * 0.52;
      bumps.push({ cx: bx, cy: by, rx, ry });
    }
  }

  const fillId = `${id}-fill`;
  const shadowId = `${id}-shadow`;
  const shineId = `${id}-shine`;

  // Sunk/hit overlay colors
  const overlayOpacity = isSunk ? 0.55 : isHit ? 0.3 : 0;

  return (
    <svg
      width={W}
      height={H}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 2,
        overflow: "visible",
        filter: isSunk ? "saturate(0.3) brightness(0.5)" : undefined,
      }}
      aria-hidden="true"
    >
      <defs>
        {/* Main brown gradient - mimics the 3D render */}
        <radialGradient id={fillId} cx="38%" cy="30%" r="72%" fx="32%" fy="25%">
          <stop offset="0%"   stopColor="#c4822a" />
          <stop offset="25%"  stopColor="#a0541a" />
          <stop offset="55%"  stopColor="#7a3210" />
          <stop offset="80%"  stopColor="#5a1e08" />
          <stop offset="100%" stopColor="#3d1205" />
        </radialGradient>
        {/* Bottom shadow gradient */}
        <radialGradient id={shadowId} cx="50%" cy="90%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* Top shine */}
        <radialGradient id={shineId} cx="35%" cy="25%" r="45%">
          <stop offset="0%" stopColor="rgba(255,220,150,0.55)" />
          <stop offset="60%" stopColor="rgba(255,180,80,0.15)" />
          <stop offset="100%" stopColor="rgba(255,120,30,0)" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <rect x="-4" y="-4" width={W + 8} height={H + 8} />
        </clipPath>
      </defs>

      {/* Drop shadow */}
      <ellipse
        cx={baseCx} cy={isH ? H * 0.92 : H / 2}
        rx={isH ? W * 0.44 : W * 0.35}
        ry={isH ? H * 0.12 : H * 0.44}
        fill={`url(#${shadowId})`}
        opacity={0.6}
      />

      {/* Base body */}
      <ellipse
        cx={baseCx} cy={baseCy}
        rx={baseRx} ry={baseRy}
        fill={`url(#${fillId})`}
      />

      {/* Bumps on top — creates the lumpy segmented look */}
      {bumps.map((b, i) => (
        <ellipse
          key={i}
          cx={b.cx} cy={b.cy}
          rx={b.rx} ry={b.ry}
          fill={`url(#${fillId})`}
        />
      ))}

      {/* Texture overlay — subtle darker veins */}
      {bumps.map((b, i) => (
        <ellipse
          key={`t${i}`}
          cx={b.cx + (isH ? 0 : b.rx * 0.1)} cy={b.cy + (isH ? b.ry * 0.2 : 0)}
          rx={b.rx * 0.6} ry={b.ry * 0.55}
          fill="none"
          stroke="rgba(60,15,5,0.25)"
          strokeWidth={isH ? H * 0.08 : W * 0.08}
        />
      ))}

      {/* Specular highlight */}
      <ellipse
        cx={isH ? W * 0.28 : W * 0.35}
        cy={isH ? H * 0.28 : H * 0.22}
        rx={isH ? W * 0.14 : W * 0.18}
        ry={isH ? H * 0.12 : H * 0.1}
        fill={`url(#${shineId})`}
        opacity={0.85}
      />
      {/* Secondary smaller highlight */}
      <ellipse
        cx={isH ? W * 0.55 : W * 0.6}
        cy={isH ? H * 0.22 : H * 0.42}
        rx={isH ? W * 0.06 : W * 0.09}
        ry={isH ? H * 0.07 : H * 0.06}
        fill="rgba(255,230,160,0.35)"
      />

      {/* Hit/sunk overlay */}
      {(isHit || isSunk) && (
        <rect
          x={0} y={0} width={W} height={H}
          fill={isSunk ? "rgba(150,20,20,0.5)" : "rgba(220,50,50,0.3)"}
          rx={4}
          clipPath={`url(#${id}-clip)`}
        />
      )}

      {/* Sunk marker */}
      {isSunk && (
        <text
          x={W / 2} y={H / 2 + 6}
          textAnchor="middle"
          fontSize={Math.min(W, H) * 0.55}
          fill="rgba(255,200,200,0.9)"
          style={{ pointerEvents: "none" }}
        >
          💨
        </text>
      )}
    </svg>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */
const POOP_LABELS: Record<PoopType, string> = {
  tiny: "Mini",
  regular: "Regular",
  big: "Big",
  mega: "Mega",
};

const POOP_NAMES: Record<PoopType, string> = {
  tiny: "Mini Poop (2)",
  regular: "Regular Poop (3)",
  big: "Big Poop (4)",
  mega: "Mega Poop (5)",
};

function getCellsForPlacement(
  startCell: Cell,
  orientation: Orientation,
  size: number
): Cell[] | null {
  const colIdx = COLUMNS.indexOf(startCell.col);
  const rowIdx = ROWS.indexOf(startCell.row);
  const cells: Cell[] = [];
  for (let i = 0; i < size; i++) {
    if (orientation === "horizontal") {
      const ci = colIdx + i;
      if (ci >= COLUMNS.length) return null;
      cells.push({ col: COLUMNS[ci], row: startCell.row });
    } else {
      const ri = rowIdx + i;
      if (ri >= ROWS.length) return null;
      cells.push({ col: startCell.col, row: ROWS[ri] });
    }
  }
  return cells;
}

function cellsOverlap(a: Cell[], b: Cell[]): boolean {
  const setA = new Set(a.map(cellKey));
  return b.some((c) => setA.has(cellKey(c)));
}

function isAdjacent(c1: Cell, c2: Cell): boolean {
  const dc = Math.abs(COLUMNS.indexOf(c1.col) - COLUMNS.indexOf(c2.col));
  const dr = Math.abs(c1.row - c2.row);
  return dc <= 1 && dr <= 1;
}

function hasAdjacencyConflict(newCells: Cell[], existing: Cell[][]): boolean {
  return newCells.some((nc) =>
    existing.some((group) => group.some((ec) => isAdjacent(nc, ec)))
  );
}

/* ─── Main Component ──────────────────────────────────────────── */
export const BattleShitsGame: React.FC<GameUIProps> = ({
  players,
  myPlayerId,
}) => {
  const [phase, setPhase] = useState<GamePhase>("placement");
  const [gameState, setGameState] = useState<BattleShitsClientState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sunkAnnouncement, setSunkAnnouncement] = useState<{ type: PoopType; byMe: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sunkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { injectKeyframes(); }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Socket wiring ─────────────────────────────────────────── */
  useEffect(() => {
    // Reconnect / initial state fetch
    socket.emit("gameEvent", { type: "getState" }, (response: { success: boolean; state?: BattleShitsClientState }) => {
      const state = response?.state;
      if (state) {
        setGameState(state);
        setPhase(state.phase);
      }
    });

    function onPhaseChanged(data: { phase: GamePhase; mode?: string; activeShooter?: string }) {
      setPhase(data.phase);
      // When entering a phase, re-request state to sync
      socket.emit("gameEvent", { type: "getState" }, (response: { success: boolean; state?: BattleShitsClientState }) => {
        const state = response?.state;
        if (state) {
          setGameState(state);
          setPhase(state.phase);
        }
      });
    }

    function onPoopPlaced(data: { type: PoopType; cells: Cell[] }) {
      setGameState((prev) => {
        if (!prev) return prev;
        const newPoop = {
          type: data.type,
          cells: data.cells,
          orientation: (data.cells.length > 1 && data.cells[0].col === data.cells[1].col
            ? "vertical" : "horizontal") as Orientation,
          sunk: false,
          hitCells: [] as string[],
        };
        return {
          ...prev,
          myPoops: [...prev.myPoops, newPoop],
          remainingPoopTypes: prev.remainingPoopTypes.filter((t) => t !== data.type),
        };
      });
    }

    // bsReadyStatus is handled locally inside PlacementPhase

    function onFlushResult(data: { cell: Cell; result: FlushMarker; sunk: PoopType | null }) {
      setGameState((prev) => {
        if (!prev) return prev;
        const key = cellKey(data.cell);
        const iAmShooter = prev.activeShooter === myPlayerId;

        if (iAmShooter) {
          // I fired — update my outgoing markers (what I see on opponent grid)
          return {
            ...prev,
            opponentFlushMarkers: { ...prev.opponentFlushMarkers, [key]: data.result },
          };
        } else {
          // Someone else fired at my grid — update my incoming markers
          return {
            ...prev,
            myFlushMarkers: { ...prev.myFlushMarkers, [key]: data.result },
          };
        }
      });
    }

    function onPoopSunk(data: { poopType: PoopType; sideId: string }) {
      setGameState((prev) => {
        if (!prev) return prev;
        if (prev.mySideId === data.sideId) {
          return {
            ...prev,
            myPoops: prev.myPoops.map((p) =>
              p.type === data.poopType ? { ...p, sunk: true } : p
            ),
          };
        }
        return prev;
      });
      // Show sunk announcement
      const byMe = (gameState?.activeShooter === myPlayerId);
      setSunkAnnouncement({ type: data.poopType, byMe });
      if (sunkTimer.current) clearTimeout(sunkTimer.current);
      sunkTimer.current = setTimeout(() => setSunkAnnouncement(null), 2500);
    }

    function onBsTurnStarted(data: { activeShooter: string; timeRemaining: number }) {
      setGameState((prev) =>
        prev
          ? { ...prev, activeShooter: data.activeShooter, turnTimeRemaining: data.timeRemaining }
          : prev
      );
    }

    function onBsTurnTimerUpdate(data: { timeRemaining: number }) {
      setGameState((prev) =>
        prev ? { ...prev, turnTimeRemaining: data.timeRemaining } : prev
      );
    }

    function onTurnSkipped(data: { playerId: string; reason: string }) {
      const name = players.find((p) => p.id === data.playerId)?.name ?? data.playerId;
      showToast(`⏭️ ${name}'s turn was skipped (${data.reason})`);
    }

    function onMyFlushReceived(data: { cell: Cell; result: FlushMarker }) {
      setGameState((prev) => {
        if (!prev) return prev;
        const key = cellKey(data.cell);
        return {
          ...prev,
          myFlushMarkers: { ...prev.myFlushMarkers, [key]: data.result },
        };
      });
    }

    function onError(data: { message: string }) {
      showToast(`❌ ${data.message}`);
    }

    socket.on("bsPhaseChanged", onPhaseChanged);
    socket.on("poopPlaced", onPoopPlaced);
    socket.on("flushResult", onFlushResult);
    socket.on("poopSunk", onPoopSunk);
    socket.on("bsTurnStarted", onBsTurnStarted);
    socket.on("bsTurnTimerUpdate", onBsTurnTimerUpdate);
    socket.on("turnSkipped", onTurnSkipped);
    socket.on("myFlushReceived", onMyFlushReceived);
    socket.on("error", onError);

    return () => {
      socket.off("bsPhaseChanged", onPhaseChanged);
      socket.off("poopPlaced", onPoopPlaced);
      socket.off("flushResult", onFlushResult);
      socket.off("poopSunk", onPoopSunk);
      socket.off("bsTurnStarted", onBsTurnStarted);
      socket.off("bsTurnTimerUpdate", onBsTurnTimerUpdate);
      socket.off("turnSkipped", onTurnSkipped);
      socket.off("myFlushReceived", onMyFlushReceived);
      socket.off("error", onError);
    };
  }, [myPlayerId, players, showToast]);

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <div style={S.root}>
      {/* Toast notification */}
      {toast && (
        <div style={S.toast} role="alert" aria-live="assertive">
          {toast}
        </div>
      )}

      {/* Sunk announcement overlay */}
      {sunkAnnouncement && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 8000,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            background: sunkAnnouncement.byMe
              ? "linear-gradient(135deg, rgba(22,163,74,.95), rgba(15,118,54,.95))"
              : "linear-gradient(135deg, rgba(220,38,38,.95), rgba(153,27,27,.95))",
            borderRadius: "20px",
            padding: "28px 40px",
            textAlign: "center",
            boxShadow: "0 24px 60px rgba(0,0,0,.6)",
            animation: "bs-sunk-banner 2.5s ease-in-out forwards",
            border: `2px solid ${sunkAnnouncement.byMe ? "#4ade80" : "#f87171"}`,
          }}>
            <div style={{ fontSize: "3rem", marginBottom: "8px" }}>
              {sunkAnnouncement.byMe ? "💨" : "💥"}
            </div>
            <p style={{ color: "#fff", fontWeight: 900, fontSize: "1.6rem", margin: 0, letterSpacing: "-0.02em" }}>
              {sunkAnnouncement.byMe ? "FLUSHED!" : "POOP SUNK!"}
            </p>
            <p style={{ color: "rgba(255,255,255,.8)", fontSize: "1rem", margin: "6px 0 0", fontWeight: 600 }}>
              {POOP_NAMES[sunkAnnouncement.type]}
            </p>
          </div>
        </div>
      )}

      {phase === "placement" && (
        <PlacementPhase
          gameState={gameState}
          players={players}
          myPlayerId={myPlayerId}
          onToast={showToast}
        />
      )}
      {phase === "battle" && gameState && (
        <BattlePhase
          gameState={gameState}
          players={players}
          myPlayerId={myPlayerId}
          onToast={showToast}
        />
      )}
      {phase === "gameOver" && gameState && (
        <GameOverScreen gameState={gameState} players={players} />
      )}
      {!gameState && phase === "placement" && (
        <div style={S.loading}>
          <span style={{ fontSize: "3rem", animation: "bs-bounce 1s ease-in-out infinite" }}>💩</span>
          <p style={{ color: "#94a3b8" }}>Loading game...</p>
        </div>
      )}
    </div>
  );
};

/* ─── Placement Phase ─────────────────────────────────────────── */
interface PlacementPhaseProps {
  gameState: BattleShitsClientState | null;
  players: GameUIProps["players"];
  myPlayerId: string;
  onToast: (msg: string) => void;
}

const PlacementPhase: React.FC<PlacementPhaseProps> = ({
  gameState,
  players,
  myPlayerId,
  onToast,
}) => {
  const [selectedType, setSelectedType] = useState<PoopType | null>(null);
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [readySides, setReadySides] = useState<Array<{ sideId: string; ready: boolean }>>([]);
  const [markedReady, setMarkedReady] = useState(false);

  const placedPoops = gameState?.myPoops ?? [];
  const remaining = gameState?.remainingPoopTypes ?? ALL_POOP_TYPES;

  useEffect(() => {
    function onBsReadyStatus(data: { sides: Array<{ sideId: string; ready: boolean }> }) {
      setReadySides(data.sides);
    }
    socket.on("bsReadyStatus", onBsReadyStatus);
    return () => { socket.off("bsReadyStatus", onBsReadyStatus); };
  }, []);

  // Cells occupied by placed poops
  const occupiedKeys = new Set<string>(
    placedPoops.flatMap((p) => p.cells.map(cellKey))
  );

  // Preview cells for hover
  const previewCells: Cell[] | null =
    selectedType && hoverCell
      ? getCellsForPlacement(hoverCell, orientation, POOP_SIZES[selectedType])
      : null;

  const previewKeys = new Set<string>(previewCells?.map(cellKey) ?? []);
  const existingGroups = placedPoops.map((p) => p.cells);
  const isPreviewValid =
    previewCells !== null &&
    !cellsOverlap(previewCells, placedPoops.flatMap((p) => p.cells));

  function handleCellClick(cell: Cell) {
    if (!selectedType) return;
    const cells = getCellsForPlacement(cell, orientation, POOP_SIZES[selectedType]);
    if (!cells) {
      onToast("❌ Poop won't fit there!");
      return;
    }
    socket.emit("gameEvent", {
      type: "placePoop",
      payload: { type: selectedType, startCell: { col: cell.col, row: cell.row }, orientation },
    });
    setSelectedType(null);
  }

  function handleReadyForBattle() {
    socket.emit("gameEvent", { type: "readyForBattle", payload: {} });
    setMarkedReady(true);
  }

  const allPlaced = remaining.length === 0;

  function getCellStyle(cell: Cell): React.CSSProperties {
    const key = cellKey(cell);
    const isPreview = previewKeys.has(key);

    let bg = "rgba(30, 41, 59, 0.7)";
    let border = "1px solid rgba(148,163,184,.15)";
    if (isPreview) {
      bg = isPreviewValid ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)";
      border = isPreviewValid ? "1px solid #4ade80" : "1px solid #f87171";
    }

    return {
      width: "28px", height: "28px",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: selectedType ? "pointer" : "default",
      backgroundColor: bg, border,
      borderRadius: "3px",
      transition: "background-color .1s",
      userSelect: "none",
      position: "relative",
      overflow: "visible",
    };
  }

  // Determine position of a cell within its poop
  function getSegmentPos(poop: typeof placedPoops[0], cellIdx: number): "start" | "middle" | "end" | "single" {
    if (poop.cells.length === 1) return "single";
    if (cellIdx === 0) return "start";
    if (cellIdx === poop.cells.length - 1) return "end";
    return "middle";
  }
  return (
    <div style={S.container}>
      <div style={{ textAlign: "center", animation: "bs-fadeIn .5s ease-out" }}>
        <h1 style={S.title}>💩 Battle Shits</h1>
        <p style={S.subtitle}>Place your poops</p>
      </div>

      {/* Piece tray */}
      <div style={S.card}>
        <p style={S.sectionLabel}>PIECE TRAY</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {ALL_POOP_TYPES.map((type) => {
            const isPlaced = !remaining.includes(type);
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                disabled={isPlaced}
                onClick={() => setSelectedType(isSelected ? null : type)}
                aria-pressed={isSelected}
                style={{
                  ...S.pieceBtn,
                  opacity: isPlaced ? 0.35 : 1,
                  background: isSelected
                    ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                    : "rgba(30,41,59,.8)",
                  border: isSelected ? "2px solid #818cf8" : "2px solid rgba(148,163,184,.2)",
                  cursor: isPlaced ? "default" : "pointer",
                  textDecoration: isPlaced ? "line-through" : "none",
                }}
              >
                {POOP_LABELS[type]} ×{POOP_SIZES[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Orientation toggle */}
      <div style={{ display: "flex", gap: "10px", width: "100%" }}>
        {(["horizontal", "vertical"] as Orientation[]).map((o) => (
          <button
            key={o}
            onClick={() => setOrientation(o)}
            aria-pressed={orientation === o}
            style={{
              ...S.orientBtn,
              background: orientation === o
                ? "linear-gradient(135deg,#0284c7,#0ea5e9)"
                : "rgba(30,41,59,.8)",
              border: orientation === o ? "2px solid #38bdf8" : "2px solid rgba(148,163,184,.2)",
            }}
          >
            {o === "horizontal" ? "↔ Horizontal" : "↕ Vertical"}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={S.card}>
        {/* Column labels */}
        <div style={{ display: "flex", gap: "2px", marginBottom: "2px", marginLeft: "26px" }}>
          {COLUMNS.map((col) => (
            <div key={col} style={S.gridLabel}>{col}</div>
          ))}
        </div>
        {/* Rows */}
        {ROWS.map((row) => (
          <div key={row} style={{ display: "flex", gap: "2px", marginBottom: "2px" }}>
            <div style={{ ...S.gridLabel, width: "22px", flexShrink: 0 }}>{row}</div>
            {COLUMNS.map((col) => {
              const cell: Cell = { col, row };
              const poop = placedPoops.find((p) => p.cells.some((c) => cellKey(c) === cellKey(cell)));
              const cellIdx = poop ? poop.cells.findIndex((c) => cellKey(c) === cellKey(cell)) : -1;
              const isPreview = previewKeys.has(cellKey(cell));
              const isAnchor = cellIdx === 0; // render the model on the first cell only
              return (
                <div
                  key={col}
                  style={{ ...getCellStyle(cell), position: "relative" }}
                  onClick={() => handleCellClick(cell)}
                  onMouseEnter={() => setHoverCell(cell)}
                  onMouseLeave={() => setHoverCell(null)}
                  role={selectedType ? "button" : undefined}
                  aria-label={`Cell ${col}${row}`}
                >
                  {/* Preview indicator */}
                  {isPreview && !poop && (
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: isPreviewValid ? "rgba(34,197,94,.5)" : "rgba(239,68,68,.5)" }} />
                  )}
                  {/* Poop model renders once on the anchor cell, spans all cells */}
                  {poop && isAnchor && (
                    <PoopModel
                      poopType={poop.type}
                      cells={poop.cells}
                      orientation={poop.orientation}
                      isHit={false}
                      isSunk={poop.sunk}
                      cellSize={28}
                      gap={2}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Ready for Battle */}
      <button
        onClick={handleReadyForBattle}
        disabled={!allPlaced || markedReady}
        style={{
          ...S.bigBtn,
          background: allPlaced && !markedReady
            ? "linear-gradient(135deg,#15803d,#22c55e)"
            : "rgba(30,41,59,.5)",
          opacity: allPlaced && !markedReady ? 1 : 0.5,
          cursor: allPlaced && !markedReady ? "pointer" : "not-allowed",
          animation: allPlaced && !markedReady ? "bs-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        {markedReady ? "✅ Waiting for others..." : "🚽 Ready for Battle!"}
      </button>

      {/* Ready status */}
      {readySides.length > 0 && (
        <div style={S.card}>
          <p style={S.sectionLabel}>READY STATUS</p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {readySides.map((s) => {
              const sidePlayer = players.find((p) => p.id === s.sideId);
              const label = sidePlayer?.name ?? s.sideId;
              return (
                <span key={s.sideId} style={{
                  padding: "4px 12px", borderRadius: "20px", fontSize: "13px",
                  background: s.ready ? "rgba(34,197,94,.2)" : "rgba(30,41,59,.8)",
                  border: `1px solid ${s.ready ? "#22c55e" : "rgba(148,163,184,.2)"}`,
                  color: s.ready ? "#4ade80" : "#94a3b8",
                }}>
                  {label} {s.ready ? "✓" : "…"}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Battle Phase ────────────────────────────────────────────── */
interface BattlePhaseProps {
  gameState: BattleShitsClientState;
  players: GameUIProps["players"];
  myPlayerId: string;
  onToast: (msg: string) => void;
}

const BattlePhase: React.FC<BattlePhaseProps> = ({
  gameState,
  players,
  myPlayerId,
  onToast: _onToast,
}) => {
  const isMyTurn = gameState.activeShooter === myPlayerId;
  const activePlayer = players.find((p) => p.id === gameState.activeShooter);
  const activeName = activePlayer?.name ?? gameState.activeShooter;
  const timeLeft = gameState.turnTimeRemaining;
  const timerColor = timeLeft <= 10 ? "#ef4444" : "#e2e8f0";

  function handleFlush(cell: Cell) {
    if (!isMyTurn) return;
    const key = cellKey(cell);
    if (gameState.opponentFlushMarkers[key]) return;
    socket.emit("gameEvent", { type: "flush", payload: { cell: { col: cell.col, row: cell.row } } });
  }

  function myGridCellContent(cell: Cell) {
    const key = cellKey(cell);
    const poop = gameState.myPoops.find((p) => p.cells.some((c) => cellKey(c) === key));
    const marker = gameState.myFlushMarkers[key];
    const cellIdx = poop ? poop.cells.findIndex((c) => cellKey(c) === key) : -1;
    const isAnchor = cellIdx === 0;

    if (poop && isAnchor) {
      return (
        <PoopModel
          poopType={poop.type}
          cells={poop.cells}
          orientation={poop.orientation}
          isHit={!!marker}
          isSunk={poop.sunk}
          hitCells={poop.hitCells}
          cellSize={26}
          gap={2}
        />
      );
    }
    if (marker === "miss" && !poop) return <span style={{ fontSize: "13px" }}>🌊</span>;
    if (marker === "hit" && !poop) return <span style={{ fontSize: "13px" }}>💥</span>;
    return null;
  }

  function myGridCellStyle(cell: Cell): React.CSSProperties {
    const key = cellKey(cell);
    const poop = gameState.myPoops.find((p) => p.cells.some((c) => cellKey(c) === key));
    const marker = gameState.myFlushMarkers[key];
    let bg = "rgba(15,23,42,.8)";
    let border = "1px solid rgba(148,163,184,.12)";
    if (poop && !marker) { bg = "transparent"; border = "1px solid rgba(148,163,184,.08)"; }
    if (marker === "hit") { bg = "rgba(220,38,38,.25)"; border = "1px solid #ef4444"; }
    if (marker === "miss") { bg = "rgba(30,58,138,.4)"; border = "1px solid rgba(59,130,246,.4)"; }
    return {
      width: "26px", height: "26px",
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: bg, border,
      borderRadius: "3px", userSelect: "none",
      position: "relative" as const,
    };
  }

  function opponentGridCellContent(cell: Cell) {
    const marker = gameState.opponentFlushMarkers[cellKey(cell)];
    if (marker === "hit") return <span style={{ fontSize: "16px" }}>💥</span>;
    if (marker === "miss") return <span style={{ fontSize: "14px" }}>🌊</span>;
    return null;
  }

  function opponentGridCellStyle(cell: Cell): React.CSSProperties {
    const key = cellKey(cell);
    const marker = gameState.opponentFlushMarkers[key];
    const alreadyFlushed = !!marker;
    let bg = "rgba(15,23,42,.8)";
    let border = "1px solid rgba(148,163,184,.12)";
    if (marker === "hit") { bg = "rgba(220,38,38,.3)"; border = "1px solid #f87171"; }
    else if (marker === "miss") { bg = "rgba(30,58,138,.4)"; border = "1px solid rgba(59,130,246,.4)"; }
    else if (isMyTurn && !alreadyFlushed) { bg = "rgba(49,58,97,.5)"; border = "1px solid rgba(99,102,241,.4)"; }
    return {
      width: "26px", height: "26px",
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: bg, border,
      borderRadius: "3px", userSelect: "none",
      cursor: isMyTurn && !alreadyFlushed ? "pointer" : "default",
      transition: "background-color .1s",
    };
  }

  return (
    <div style={S.container}>
      <div style={{ textAlign: "center" }}>
        <h1 style={S.title}>💩 Battle Shits</h1>
        {/* Turn status */}
        <div style={{ ...S.card, padding: "12px 20px", marginBottom: "12px" }}>
          {isMyTurn ? (
            <p style={{ color: "#4ade80", fontWeight: 700, margin: 0, fontSize: "1rem" }}>
              🎯 Your turn — tap the opponent grid!
            </p>
          ) : (
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "0.95rem" }}>
              ⏳ Waiting for {activeName}…
            </p>
          )}
          <div style={{ marginTop: "6px" }}>
            <span style={{
              fontSize: "2rem", fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
              color: timerColor,
              transition: "color .5s",
            }} aria-live="polite">
              {timeLeft}s
            </span>
          </div>
        </div>
      </div>

      {/* Grids */}
      <div style={{ display: "flex", gap: "12px", width: "100%", flexWrap: "wrap", justifyContent: "center" }}>
        {/* Your grid */}
        <div style={S.gridCard}>
          <p style={{ ...S.sectionLabel, textAlign: "center", marginBottom: "6px" }}>YOUR GRID 🛡️</p>
          <div style={{ display: "flex", gap: "2px", marginBottom: "2px", marginLeft: "22px" }}>
            {COLUMNS.map((col) => <div key={col} style={S.gridLabelSm}>{col}</div>)}
          </div>
          {ROWS.map((row) => (
            <div key={row} style={{ display: "flex", gap: "2px", marginBottom: "2px" }}>
              <div style={{ ...S.gridLabelSm, width: "18px", flexShrink: 0 }}>{row}</div>
              {COLUMNS.map((col) => {
                const cell: Cell = { col, row };
                return (
                  <div key={col} style={myGridCellStyle(cell)} aria-label={`Your cell ${col}${row}`}>
                    {myGridCellContent(cell)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Opponent grid */}
        <div style={S.gridCard}>
          <p style={{ ...S.sectionLabel, textAlign: "center", marginBottom: "6px" }}>
            {isMyTurn ? "OPPONENT 🎯" : "OPPONENT ⛔"}
          </p>
          <div style={{ display: "flex", gap: "2px", marginBottom: "2px", marginLeft: "22px" }}>
            {COLUMNS.map((col) => <div key={col} style={S.gridLabelSm}>{col}</div>)}
          </div>
          {ROWS.map((row) => (
            <div key={row} style={{ display: "flex", gap: "2px", marginBottom: "2px" }}>
              <div style={{ ...S.gridLabelSm, width: "18px", flexShrink: 0 }}>{row}</div>
              {COLUMNS.map((col) => {
                const cell: Cell = { col, row };
                return (
                  <div
                    key={col}
                    style={opponentGridCellStyle(cell)}
                    onClick={() => handleFlush(cell)}
                    role={isMyTurn && !gameState.opponentFlushMarkers[cellKey(cell)] ? "button" : undefined}
                    aria-label={`Opponent cell ${col}${row}`}
                  >
                    {opponentGridCellContent(cell)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Poop status legend */}
      <div style={S.card}>
        <p style={S.sectionLabel}>YOUR POOPS</p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {ALL_POOP_TYPES.map((type) => {
            const poop = gameState.myPoops.find((p) => p.type === type);
            const placed = !!poop;
            const sunk = poop?.sunk ?? false;
            return (
              <span key={type} style={{
                padding: "4px 10px", borderRadius: "20px", fontSize: "12px",
                background: sunk ? "rgba(127,29,29,.3)" : placed ? "rgba(21,128,61,.2)" : "rgba(30,41,59,.5)",
                border: `1px solid ${sunk ? "#ef4444" : placed ? "#22c55e" : "rgba(148,163,184,.2)"}`,
                color: sunk ? "#fca5a5" : placed ? "#4ade80" : "#64748b",
                textDecoration: sunk ? "line-through" : "none",
              }}>
                {POOP_NAMES[type]} {sunk ? "💨 SUNK" : placed ? "✓ OK" : "?"}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ─── Game Over Screen ────────────────────────────────────────── */
interface GameOverScreenProps {
  gameState: BattleShitsClientState;
  players: GameUIProps["players"];
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ gameState, players }) => {
  const isWinner = gameState.winnerPlayerIds.includes(
    players.find((p) => gameState.winnerPlayerIds.includes(p.id))?.id ?? ""
  );
  const winnerNames = gameState.winnerPlayerIds
    .map((id) => players.find((p) => p.id === id)?.name ?? id)
    .join(", ");

  return (
    <div style={{ ...S.container, textAlign: "center" }}>
      <div style={{ animation: "bs-fadeIn .6s ease-out" }}>
        <div style={{ fontSize: "5rem", marginBottom: "12px", animation: "bs-bounce 1s ease-in-out infinite" }}>
          {isWinner ? "🏆" : "💀"}
        </div>
        <h1 style={{ ...S.title, fontSize: "2.5rem" }}>
          {isWinner ? "You Won! 🎉" : "Game Over 💩"}
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "1rem", marginTop: "8px" }}>
          {isWinner ? "You flushed the enemy!" : "Better luck next time!"}
        </p>
      </div>

      <div style={{ ...S.card, marginTop: "24px" }}>
        <p style={S.sectionLabel}>WINNERS 🏆</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
          {gameState.winnerPlayerIds.map((id) => {
            const player = players.find((p) => p.id === id);
            return (
              <div key={id} style={{
                padding: "10px 16px", borderRadius: "10px",
                background: "linear-gradient(135deg,rgba(234,179,8,.15),rgba(234,179,8,.05))",
                border: "1px solid rgba(234,179,8,.35)",
                color: "#fbbf24", fontWeight: 700, fontSize: "1rem",
              }}>
                👑 {player?.name ?? id}
              </div>
            );
          })}
        </div>
        {winnerNames && (
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "12px" }}>
            Winning side: {gameState.winner}
          </p>
        )}
      </div>

      <div style={{ ...S.card, marginTop: "16px" }}>
        <p style={S.sectionLabel}>ALL PLAYERS</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
          {players.map((p) => {
            const won = gameState.winnerPlayerIds.includes(p.id);
            return (
              <div key={p.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 14px", borderRadius: "8px",
                background: won ? "rgba(34,197,94,.08)" : "rgba(30,41,59,.5)",
                border: `1px solid ${won ? "rgba(34,197,94,.2)" : "rgba(148,163,184,.08)"}`,
              }}>
                <span style={{ color: won ? "#4ade80" : "#94a3b8", fontWeight: won ? 700 : 400 }}>
                  {p.name}
                </span>
                <span>{won ? "🏆 Winner" : "💀"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ─── Styles ──────────────────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(160deg,#0f0c29 0%,#1a1a2e 30%,#16213e 60%,#0f3460 100%)",
    fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 0 40px",
    position: "relative",
  },
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 16px",
    width: "100%",
    maxWidth: "520px",
    gap: "14px",
    boxSizing: "border-box",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    minHeight: "60vh",
  },
  title: {
    fontSize: "2rem",
    fontWeight: 800,
    margin: 0,
    background: "linear-gradient(135deg,#e0e7ff 0%,#a5b4fc 50%,#c4b5fd 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    filter: "drop-shadow(0 2px 8px rgba(99,102,241,.3))",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: "1rem",
    color: "#94a3b8",
    margin: "6px 0 0",
    fontWeight: 400,
  },
  card: {
    width: "100%",
    padding: "16px",
    backgroundColor: "rgba(30,41,59,.85)",
    borderRadius: "16px",
    border: "1px solid rgba(148,163,184,.12)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 8px 32px rgba(0,0,0,.35)",
    boxSizing: "border-box",
  },
  gridCard: {
    padding: "12px",
    backgroundColor: "rgba(30,41,59,.85)",
    borderRadius: "12px",
    border: "1px solid rgba(148,163,184,.12)",
    backdropFilter: "blur(8px)",
    overflowX: "auto",
  },
  sectionLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.1em",
    margin: "0 0 10px",
    textTransform: "uppercase" as const,
  },
  gridLabel: {
    width: "28px",
    height: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    color: "#64748b",
    fontWeight: 600,
    userSelect: "none",
  },
  gridLabelSm: {
    width: "26px",
    height: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "9px",
    color: "#64748b",
    fontWeight: 600,
    userSelect: "none",
  },
  pieceBtn: {
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: 600,
    borderRadius: "10px",
    color: "#e2e8f0",
    minHeight: "40px",
    minWidth: "44px",
  },
  orientBtn: {
    flex: 1,
    padding: "10px 12px",
    fontSize: "13px",
    fontWeight: 600,
    borderRadius: "10px",
    color: "#e2e8f0",
    minHeight: "44px",
    cursor: "pointer",
  },
  bigBtn: {
    width: "100%",
    minHeight: "56px",
    padding: "16px 24px",
    fontSize: "1.1rem",
    fontWeight: 800,
    borderRadius: "14px",
    border: "none",
    color: "#fff",
    letterSpacing: "0.02em",
  },
  toast: {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 20px",
    borderRadius: "12px",
    background: "rgba(15,23,42,.95)",
    border: "1px solid rgba(148,163,184,.2)",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    fontWeight: 600,
    zIndex: 9999,
    backdropFilter: "blur(12px)",
    boxShadow: "0 8px 32px rgba(0,0,0,.4)",
    animation: "bs-fadeIn .3s ease-out",
    maxWidth: "90vw",
    textAlign: "center",
  },
};
