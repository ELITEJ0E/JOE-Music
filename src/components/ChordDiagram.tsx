import React from "react";

export interface ChordDiagramProps {
  frets: (number | "x")[];
  fingers?: (number | 0)[];
  barre?: {
    fret: number;
    fromString: number;
    toString: number;
  };
  position?: number;
  size?: "sm" | "md" | "lg";
  cagedShape?: "C" | "A" | "G" | "E" | "D";
  title?: string;
  showPositionLabel?: boolean;
  onPluck?: (stringIdx: number, fret: number) => void;
  className?: string;
  capo?: number;
}

/**
 * Calculates the display starting fret for any chord voicing.
 * For open-position chords (where frets fit in 1..5 and no high barre), returns 1 (nut position).
 * For higher-position chords (e.g. 8th fret C Major barre [8,10,10,9,8,8]), returns 8.
 */
export function calculateStartFret(
  frets: (number | "x")[],
  barre?: { fret: number; fromString: number; toString: number },
  position?: number
): number {
  if (position && position >= 1) {
    return position;
  }

  const numericFrets = frets.filter((f): f is number => typeof f === "number" && f > 0);
  if (numericFrets.length === 0) {
    return 1;
  }

  const minFret = Math.min(...numericFrets);
  const maxFret = Math.max(...numericFrets);

  // If all frets are within frets 1..5 and no higher barre exists, use open position (startFret = 1)
  if (maxFret <= 5 && (!barre || barre.fret <= 1)) {
    return 1;
  }

  // If a barre exists at a higher fret, use the barre fret as the base
  if (barre && barre.fret > 0) {
    return barre.fret;
  }

  // Otherwise, start from the lowest fretted note
  // Ensure the 5-fret span can cover the highest note if possible
  if (maxFret - minFret >= 5) {
    return Math.max(1, maxFret - 4);
  }

  return Math.max(1, minFret);
}

export const ChordDiagram: React.FC<ChordDiagramProps> = ({
  frets,
  fingers,
  barre,
  position,
  size = "md",
  cagedShape,
  title,
  showPositionLabel = true,
  onPluck,
  className = "",
  capo = 0,
}) => {
  // Calculate automatic display starting fret
  const startFret = calculateStartFret(frets, barre, position);
  const isOpenPosition = startFret === 1;

  // Geometry Constants
  const startX = 46; // Left margin for strings
  const stringSpacing = 30; // Horizontal distance between strings
  const numStrings = 6;
  const gridWidth = (numStrings - 1) * stringSpacing; // 150px
  const endX = startX + gridWidth; // 196px

  const topY = 44; // Y coordinate of Nut / Fret line 0
  const fretSpacing = 36; // Vertical distance between fret wires
  const numVisibleFrets = 5;
  const gridHeight = numVisibleFrets * fretSpacing; // 180px
  const bottomY = topY + gridHeight; // 224px

  // Sizing styles
  const sizeClasses = {
    sm: "w-36 max-w-full",
    md: "w-56 max-w-full",
    lg: "w-64 sm:w-72 max-w-full",
  }[size];

  // String index to X coordinate
  const getStringX = (sIdx: number) => startX + sIdx * stringSpacing;

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <svg
        viewBox="0 0 240 260"
        className={`${sizeClasses} h-auto filter drop-shadow-md`}
        role="img"
        aria-label={title || `Guitar chord diagram starting at fret ${startFret}`}
      >
        {/* Nut (Open Position) or Top Fret Wire (Higher Position) */}
        {isOpenPosition ? (
          <g>
            <rect
              x={capo > 0 ? startX - 4 : startX - 1}
              y={topY - 5}
              width={capo > 0 ? gridWidth + 8 : gridWidth + 2}
              height={capo > 0 ? 8 : 6}
              fill={capo > 0 ? "#38bdf8" : "#a3ff12"}
              rx={capo > 0 ? "4" : "3"}
              filter={capo > 0 ? "drop-shadow(0 0 6px rgba(56,189,248,0.6))" : undefined}
            />
            {capo > 0 && showPositionLabel && (
              <text
                x={startX - 8}
                y={topY + 1}
                fill="#38bdf8"
                fontSize="10"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="end"
              >
                Capo {capo}
              </text>
            )}
          </g>
        ) : (
          <line
            x1={startX}
            y1={topY}
            x2={endX}
            y2={topY}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="2.5"
          />
        )}

        {/* Position Label for Higher Positions (e.g. "8fr") */}
        {!isOpenPosition && showPositionLabel && (
          <text
            x={startX - 10}
            y={topY + fretSpacing / 2 + 5}
            fill="#a3ff12"
            fontSize="13"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="end"
          >
            {startFret}fr
          </text>
        )}

        {/* 5 Fret Horizontal Wire Lines */}
        {[0, 1, 2, 3, 4, 5].map((f) => {
          const y = topY + f * fretSpacing;
          return (
            <line
              key={`fret-${f}`}
              x1={startX}
              y1={y}
              x2={endX}
              y2={y}
              stroke={f === 0 && isOpenPosition ? "transparent" : "rgba(255,255,255,0.18)"}
              strokeWidth={f === 0 ? "2" : "1.5"}
            />
          );
        })}

        {/* 6 Strings Vertical Lines (Low E thicker on left, High E thinner on right) */}
        {[0, 1, 2, 3, 4, 5].map((s) => {
          const x = getStringX(s);
          // String gauge: 6th string (s=0) is thickest (~2.6px), 1st string (s=5) is thinnest (~1.0px)
          const gauge = 1.0 + (5 - s) * 0.32;
          return (
            <line
              key={`string-${s}`}
              x1={x}
              y1={topY}
              x2={x}
              y2={bottomY}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={gauge}
            />
          );
        })}

        {/* Barre Rendering (if present and in view) */}
        {barre && (() => {
          const relFret = barre.fret - startFret + 1;
          if (relFret >= 1 && relFret <= numVisibleFrets) {
            const y = topY + (relFret - 0.5) * fretSpacing;
            const x1 = getStringX(barre.fromString);
            const x2 = getStringX(barre.toString);
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const pillWidth = maxX - minX + 22;

            // Barre finger number from fingers array or default 1 (index finger)
            const barreFinger = fingers ? fingers[barre.fromString] || 1 : 1;

            return (
              <g
                key="barre-indicator"
                className={onPluck ? "cursor-pointer" : ""}
                onClick={() => onPluck?.(5 - barre.fromString, barre.fret)}
              >
                {/* Horizontal Rounded Barre Pill */}
                <rect
                  x={minX - 11}
                  y={y - 11}
                  width={pillWidth}
                  height={22}
                  rx={11}
                  fill="#a3ff12"
                  fillOpacity={0.92}
                  filter="drop-shadow(0 0 6px rgba(163,255,18,0.5))"
                />
                {/* Barre Finger Label */}
                <text
                  x={minX}
                  y={y + 4}
                  fill="#000"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {barreFinger}
                </text>
              </g>
            );
          }
          return null;
        })()}

        {/* Finger Dots, Open Circles ('O'), and Muted Markers ('✕') */}
        {frets.map((fret, sIdx) => {
          const x = getStringX(sIdx);

          // 1. Muted String "✕"
          if (fret === "x") {
            return (
              <text
                key={`mute-${sIdx}`}
                x={x}
                y="26"
                fill="#ff4d4d"
                fontSize="14"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                ✕
              </text>
            );
          }

          // 2. Open String "O"
          if (fret === 0) {
            return (
              <circle
                key={`open-${sIdx}`}
                cx={x}
                cy="22"
                r="6"
                fill="none"
                stroke={capo > 0 ? "#38bdf8" : "#a3ff12"}
                strokeWidth="2"
                className={onPluck ? "cursor-pointer hover:fill-[#a3ff12]/30 transition-all" : ""}
                onClick={() => onPluck?.(5 - sIdx, 0)}
              />
            );
          }

          // 3. Fretted Note Dot (1..24+)
          if (typeof fret === "number" && fret > 0) {
            const relFret = fret - startFret + 1;

            // Render only if within visible 5-fret window
            if (relFret >= 1 && relFret <= numVisibleFrets) {
              // Check if note is already visually represented by the barre pill at the same fret
              const isCoveredByBarre =
                barre &&
                barre.fret === fret &&
                sIdx >= barre.fromString &&
                sIdx <= barre.toString;

              // If covered by the barre at the exact same fret, don't draw duplicate dot
              if (isCoveredByBarre) {
                return null;
              }

              const y = topY + (relFret - 0.5) * fretSpacing;
              const fingerNumber = fingers ? fingers[sIdx] : 0;

              return (
                <g
                  key={`dot-${sIdx}`}
                  className={onPluck ? "cursor-pointer" : ""}
                  onClick={() => onPluck?.(5 - sIdx, fret)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="11"
                    fill="#a3ff12"
                    filter="drop-shadow(0 0 6px #a3ff12)"
                  />
                  {fingerNumber > 0 ? (
                    <text
                      x={x}
                      y={y + 4}
                      fill="#000"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {fingerNumber}
                    </text>
                  ) : null}
                </g>
              );
            }
          }

          return null;
        })}

        {/* Optional CAGED Shape Subtitle Badge in SVG */}
        {(cagedShape || capo > 0) && (
          <text
            x="120"
            y="248"
            fill={capo > 0 ? "#38bdf8" : "#a3ff12"}
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
            opacity={0.9}
          >
            {cagedShape ? `${cagedShape}-SHAPE • ` : ""}{capo > 0 ? `CAPO FRET ${capo}` : isOpenPosition ? "OPEN POSITION" : `${startFret}TH FRET`}
          </text>
        )}
      </svg>
    </div>
  );
};
