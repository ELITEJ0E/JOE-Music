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
  size?: "xxs" | "xs" | "sm" | "md" | "lg" | "xl";
  cagedShape?: "C" | "A" | "G" | "E" | "D";
  title?: string;
  showPositionLabel?: boolean;
  onPluck?: (stringIdx: number, fret: number) => void;
  className?: string;
  capo?: number;
  theme?: "dark" | "light";
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

export const ChordDiagramComponent: React.FC<ChordDiagramProps> = ({
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
  theme = "dark",
}) => {
  // Calculate automatic display starting fret
  const startFret = calculateStartFret(frets, barre, position);
  const isOpenPosition = startFret === 1;

  const isLight = theme === "light";
  const nutFill = capo > 0 ? (isLight ? "#0284c7" : "#38bdf8") : (isLight ? "#0f172a" : "#a3ff12");
  const capoLabelColor = isLight ? "#0284c7" : "#38bdf8";
  const topWireColor = isLight ? "#94a3b8" : "rgba(255,255,255,0.4)";
  const positionLabelColor = isLight ? "#0f172a" : "#a3ff12";
  const fretWireColor = isLight ? "#cbd5e1" : "rgba(255,255,255,0.18)";
  const stringWireColor = isLight ? "#64748b" : "rgba(255,255,255,0.35)";
  const barreFill = isLight ? "#0f172a" : "#a3ff12";
  const barreHaloFill = isLight ? "#0f172a" : "#a3ff12";
  const barreHaloOpacity = isLight ? 0.12 : 0.2;
  const barreTextColor = isLight ? "#ffffff" : "#000000";
  const openCircleStroke = capo > 0 ? (isLight ? "#0284c7" : "#38bdf8") : (isLight ? "#0f172a" : "#a3ff12");
  const dotFill = isLight ? "#0f172a" : "#a3ff12";
  const dotHaloFill = isLight ? "#0f172a" : "#a3ff12";
  const dotHaloOpacity = isLight ? 0.12 : 0.22;
  const dotTextColor = isLight ? "#ffffff" : "#000000";
  const subtitleColor = capo > 0 ? (isLight ? "#0284c7" : "#38bdf8") : (isLight ? "#475569" : "#a3ff12");

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
    xxs: "w-20 sm:w-24 max-w-full",
    xs: "w-24 sm:w-28 max-w-full",
    sm: "w-32 sm:w-36 max-w-full",
    md: "w-40 sm:w-46 max-w-full",
    lg: "w-50 sm:w-56 max-w-full",
    xl: "w-60 sm:w-68 max-w-full",
  }[size];

  // String index to X coordinate
  const getStringX = (sIdx: number) => startX + sIdx * stringSpacing;

  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 240 260"
        className={`${sizeClasses} max-h-full h-auto select-none ${onPluck ? "" : "pointer-events-none"}`}
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
              fill={nutFill}
              rx={capo > 0 ? "4" : "3"}
            />
            {capo > 0 && showPositionLabel && (
              <text
                x={startX - 8}
                y={topY + 1}
                fill={capoLabelColor}
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
            stroke={topWireColor}
            strokeWidth="2.5"
          />
        )}

        {/* Position Label for Higher Positions (e.g. "8fr") */}
        {!isOpenPosition && showPositionLabel && (
          <text
            x={startX - 10}
            y={topY + fretSpacing / 2 + 5}
            fill={positionLabelColor}
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
              stroke={f === 0 && isOpenPosition ? "transparent" : fretWireColor}
              strokeWidth={f === 0 ? "2" : "1.5"}
            />
          );
        })}

        {/* 6 Strings Vertical Lines (Low E thicker on left, High E thinner on right) */}
        {[0, 1, 2, 3, 4, 5].map((s) => {
          const x = getStringX(s);
          const gauge = 1.0 + (5 - s) * 0.32;
          return (
            <line
              key={`string-${s}`}
              x1={x}
              y1={topY}
              x2={x}
              y2={bottomY}
              stroke={stringWireColor}
              strokeWidth={gauge}
            />
          );
        })}

        {/* Barre Rendering - High-performance GPU geometry with halo */}
        {barre && (() => {
          const relFret = barre.fret - startFret + 1;
          if (relFret >= 1 && relFret <= numVisibleFrets) {
            const y = topY + (relFret - 0.5) * fretSpacing;
            const x1 = getStringX(barre.fromString);
            const x2 = getStringX(barre.toString);
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const pillWidth = maxX - minX + 22;
            const barreFinger = fingers ? fingers[barre.fromString] || 1 : 1;

            return (
              <g
                key="barre-indicator"
                className={onPluck ? "cursor-pointer" : ""}
                onClick={() => onPluck?.(5 - barre.fromString, barre.fret)}
              >
                {/* Soft outer glow halo */}
                <rect
                  x={minX - 13}
                  y={y - 13}
                  width={pillWidth + 4}
                  height={26}
                  rx={13}
                  fill={barreHaloFill}
                  fillOpacity={barreHaloOpacity}
                />
                {/* Horizontal Rounded Barre Pill */}
                <rect
                  x={minX - 11}
                  y={y - 11}
                  width={pillWidth}
                  height={22}
                  rx={11}
                  fill={barreFill}
                  fillOpacity={0.95}
                />
                {/* Barre Finger Label */}
                <text
                  x={minX}
                  y={y + 4}
                  fill={barreTextColor}
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
                fill="#ef4444"
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
                stroke={openCircleStroke}
                strokeWidth="2"
                className={onPluck ? "cursor-pointer hover:fill-zinc-500/20" : ""}
                onClick={() => onPluck?.(5 - sIdx, 0)}
              />
            );
          }

          // 3. Fretted Note Dot (1..24+)
          if (typeof fret === "number" && fret > 0) {
            const relFret = fret - startFret + 1;

            if (relFret >= 1 && relFret <= numVisibleFrets) {
              const isCoveredByBarre =
                barre &&
                barre.fret === fret &&
                sIdx >= barre.fromString &&
                sIdx <= barre.toString;

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
                  {/* Subtle vector glow halo (hardware accelerated, 0ms raster overhead) */}
                  <circle
                    cx={x}
                    cy={y}
                    r="14"
                    fill={dotHaloFill}
                    fillOpacity={dotHaloOpacity}
                  />
                  {/* Crisp primary finger dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r="11"
                    fill={dotFill}
                  />
                  {fingerNumber > 0 ? (
                    <text
                      x={x}
                      y={y + 4}
                      fill={dotTextColor}
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
            fill={subtitleColor}
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

export const ChordDiagram = React.memo(ChordDiagramComponent);
