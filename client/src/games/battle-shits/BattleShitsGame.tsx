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

/* ─── SVG Poop Segment ─────────────────────────────────────────── */
// Renders an inline SVG poop "segment" for a single cell of a poop model.
// pos: "start" | "middle" | "end" | "single" (for tiny)
function PoopSegment({
  poopType,
  pos,
  orientation,
  isHit,
  isSunk,
  cellSize = 28,
}: {
  poopType: PoopType;
  pos: "start" | "middle" | "end" | "single";
  orientation: "horizontal" | "vertical";
  isHit: boolean;
  isSunk: boolean;
  cellSize?: number;
}) {
  const colors = POOP_COLORS[poopType];
  const fill = isSunk ? "#7f1d1d" : isHit ? "#b45309" : colors.fill;
  const stroke = isSunk ? "#991b1b" : isHit ? "#92400e" : colors.stroke;
  const s = cellSize;
  const pad = 3;

  // Draw a rounded rectangle filling the cell, with slight rounding at ends
  const isH = orientation === "horizontal";
  const rx = pos === "single" ? 8
    : pos === "start" ? (isH ? "8 0 0 8" : "8 8 0 0")
    : pos === "end"   ? (isH ? "0 8 8 0" : "0 0 8 8")
    : "0";

  // For start/end use asymmetric border radius via path
  let path = "";
  const x = pad, y = pad, w = s - pad * 2, h = s - pad * 2;

  if (pos === "single") {
    path = `M${x+8},${y} h${w-16} q8,0 8,8 v${h-16} q0,8 -8,8 h${w-16} q-8,0 -8,-8 v${h-16} q0,-8 8,-8 z`;
  } else if (isH) {
    if (pos === "start")  path = `M${x+8},${y} h${w-8} v${h} h${-(w-8)} q-8,0 -8,-8 v${h-16} q0,-8 8,-8 z`;
    else if (pos === "end") path = `M${x},${y} h${w-8} q8,0 8,8 v${h-16} q0,8 -8,8 h${-(w-8)} v${-h} z`;
    else path = `M${x},${y} h${w} v${h} h${-w} z`;
  } else {
    if (pos === "start")  path = `M${x},${y+8} q0,-8 8,-8 h${w-16} q8,0 8,8 v${h-8} h${-w} z`;
    else if (pos === "end") path = `M${x},${y} h${w} v${h-8} q0,8 -8,8 h${w-16} q-8,0 -8,-8 v${-(h-8)} z`;
    else path = `M${x},${y} h${w} v${h} h${-w} z`;
  }

  return (
    <svg width={s} height={s} style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={`pg-${poopType}-${pos}`} x1="0" y1="0" x2={isH ? "0" : "1"} y2={isH ? "1" : "0"}>
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor={stroke} />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#pg-${poopType}-${pos})`} stroke={stroke} strokeWidth="1.5" />
      {/* Hit marker */}
      {isHit && !isSunk && (
        <text x={s/2} y={s/2+5} textAnchor="middle" fontSize="14" fill="#fef08a">✕</text>
      )}
      {/* Sunk marker */}
      {isSunk && (
        <text x={s/2} y={s/2+5} textAnchor="middle" fontSize="12" fill="#fca5a5">💨</text>
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
    !cellsOverlap(previewCells, placedPoops.flatMap((p) => p.cells)) &&
    !hasAdjacencyConflict(previewCells, existingGroups);

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
              return (
                <div
                  key={col}
                  style={getCellStyle(cell)}
                  onClick={() => handleCellClick(cell)}
                  onMouseEnter={() => setHoverCell(cell)}
                  onMouseLeave={() => setHoverCell(null)}
                  role={selectedType ? "button" : undefined}
                  aria-label={`Cell ${col}${row}`}
                >
                  {poop && !isPreview ? (
                    <PoopSegment
                      poopType={poop.type}
                      pos={getSegmentPos(poop, cellIdx)}
                      orientation={poop.orientation}
                      isHit={false}
                      isSunk={poop.sunk}
                      cellSize={28}
                    />
                  ) : isPreview && isPreviewValid ? (
                    <div style={{ width: 22, height: 22, borderRadius: 4, background: "rgba(34,197,94,.5)" }} />
                  ) : isPreview ? (
                    <div style={{ width: 22, height: 22, borderRadius: 4, background: "rgba(239,68,68,.5)" }} />
                  ) : null}
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

    if (poop) {
      const pos = cellIdx === 0 ? "start" : cellIdx === poop.cells.length - 1 ? "end" : poop.cells.length === 1 ? "single" : "middle";
      return (
        <PoopSegment
          poopType={poop.type}
          pos={pos as "start" | "middle" | "end" | "single"}
          orientation={poop.orientation}
          isHit={marker === "hit"}
          isSunk={poop.sunk}
          cellSize={26}
        />
      );
    }
    if (marker === "miss") return <span style={{ fontSize: "14px" }}>🌊</span>;
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
