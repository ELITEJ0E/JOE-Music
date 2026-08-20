import React from "react";

export interface ChordDiagramProps {
  frets: (number | "x")[];
  fingers?: number[];
  size?: "sm" | "md" | "lg";
  onPluck?: (stringIdx: number, fret: number) => void;
}

export const ChordDiagram: React.FC<ChordDiagramProps> = ({ frets, fingers, size = "md", onPluck }) => {
  // We can scale it later if needed for size prop, but for now we keep the exact SVG logic
  return (
    <svg width="240" height="260" viewBox="0 0 240 260" className="select-none">
      {/* Nut / Base Fret */}
      <rect x="30" y="30" width="180" height="6" fill="#a3ff12" rx="3" />

      {/* 5 Frets Horizontal Lines */}
      {[0, 1, 2, 3, 4].map((f) => (
        <line
          key={f}
          x1="30"
          y1={30 + f * 42}
          x2="210"
          y2={30 + f * 42}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
        />
      ))}

      {/* 6 Strings Vertical Lines */}
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <line
          key={s}
          x1={30 + s * 36}
          y1="30"
          x2={30 + s * 36}
          y2="198"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1 + (5 - s) * 0.4}
        />
      ))}

      {/* Finger Dots and Mute/Open Markers */}
      {frets.map((fret, sIdx) => {
        const x = 30 + sIdx * 36;
        if (fret === "x") {
          return (
            <text
              key={sIdx}
              x={x}
              y="20"
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
        if (fret === 0) {
          return (
            <circle
              key={sIdx}
              cx={x}
              cy="18"
              r="6"
              fill="none"
              stroke="#a3ff12"
              strokeWidth="2"
              className={onPluck ? "cursor-pointer hover:fill-[#a3ff12]/30 transition-all" : ""}
              onClick={() => onPluck?.(5 - sIdx, 0)}
            />
          );
        }
        if (typeof fret === "number" && fret > 0 && fret <= 5) {
          const y = 30 + fret * 42 - 21;
          const fingerNumber = fingers ? fingers[sIdx] : 0;
          return (
            <g
              key={sIdx}
              className={onPluck ? "cursor-pointer" : ""}
              onClick={() => onPluck?.(5 - sIdx, fret)}
            >
              <circle
                cx={x}
                cy={y}
                r="12"
                fill="#a3ff12"
                filter="drop-shadow(0 0 6px #a3ff12)"
              />
              {fingerNumber ? (
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
        return null;
      })}
    </svg>
  );
};
