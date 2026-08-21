import React from "react";
import { ChordDefinition } from "../music/chordTheory";
import { getStringPitchClass, getMidiNote, STANDARD_TUNING } from "../music/fretboard";

export interface FretboardViewProps {
  chord?: ChordDefinition;
  fretsCount?: number;
  showMode?: "chord" | "scale" | "notes";
}

export const FretboardView: React.FC<FretboardViewProps> = ({ 
  chord, 
  fretsCount = 12,
  showMode = "chord" 
}) => {
  const strings = [0, 1, 2, 3, 4, 5]; // 6th to 1st

  const getDotLabel = (stringIdx: number, fret: number) => {
    if (!chord) return null;
    const pc = getStringPitchClass(stringIdx, fret);
    
    // Check if it's in the chord
    let isRoot = pc === chord.root;
    
    // Find interval
    let iv = (pc - chord.root + 12) % 12;
    
    // We can show interval or note name depending on mode
    if (showMode === "chord") {
      let ivText = "";
      if (iv === 0) ivText = "R";
      else if (iv === 3 || iv === 4) ivText = "3";
      else if (iv === 7) ivText = "5";
      else if (iv === 10 || iv === 11) ivText = "7";
      else if (iv === 2) ivText = "9";
      else if (iv === 5) ivText = "11";
      else if (iv === 9) ivText = "13";
      
      const inChord = chord.intervals.includes(iv) || isRoot || (chord.bass !== undefined && pc === chord.bass);
      
      if (inChord) {
         return {
           label: ivText,
           color: isRoot ? "bg-[#a3ff12] text-black" : 
                  (iv === 3 || iv === 4) ? "bg-sky-400 text-black" : 
                  (iv === 7) ? "bg-amber-400 text-black" : "bg-white text-black"
         };
      }
    }
    
    return null;
  };

  return (
    <div className="w-full overflow-x-auto custom-scrollbar pb-4">
      <div className="relative min-w-[600px] h-48 bg-[#1c1c1c] rounded-lg border border-zinc-700 flex flex-col justify-between py-2 px-4">
        {/* Fret markers */}
        <div className="absolute inset-0 flex">
           {Array.from({length: fretsCount + 1}).map((_, i) => (
             <div key={i} className="flex-1 border-r border-zinc-600/50 relative">
               {(i === 3 || i === 5 || i === 7 || i === 9) && (
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-zinc-700/50" />
               )}
               {i === 12 && (
                 <>
                   <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-zinc-700/50" />
                   <div className="absolute top-2/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-zinc-700/50" />
                 </>
               )}
               <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full mt-1 text-[10px] text-zinc-500 font-mono">
                 {i > 0 ? i : ''}
               </div>
             </div>
           ))}
        </div>
        
        {/* Strings */}
        {strings.map((s, i) => (
          <div key={s} className="relative w-full flex items-center h-6 z-10">
            {/* String line */}
            <div className={`absolute left-0 right-0 bg-zinc-400 shadow-sm shadow-black/50`} style={{ height: `${2 + (5-i)*0.5}px` }} />
            
            {/* Frets for this string */}
            <div className="absolute inset-0 flex">
               {Array.from({length: fretsCount + 1}).map((_, f) => {
                 const dot = getDotLabel(s, f);
                 return (
                   <div key={f} className="flex-1 flex justify-center items-center relative">
                     {f === 0 && dot && (
                       <div className={`absolute -left-2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold z-20 shadow-md ${dot.color}`}>
                         {dot.label}
                       </div>
                     )}
                     {f > 0 && dot && (
                       <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold z-20 shadow-md ${dot.color}`}>
                         {dot.label}
                       </div>
                     )}
                   </div>
                 );
               })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
