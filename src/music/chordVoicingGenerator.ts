import { 
  ChordDefinition, 
  getRequiredPitchClasses, 
  getDefiningPitchClasses, 
  getNoteName, 
  PitchClass 
} from "./chordTheory";
export { getRequiredPitchClasses, getDefiningPitchClasses };
import { STANDARD_TUNING, getStringPitchClass, getMidiNote } from "./fretboard";
export { STANDARD_TUNING, getStringPitchClass, getMidiNote };

export type PlayabilityMode = "standard" | "easy" | "open" | "barre" | "fingerstyle" | "high";

export interface GeneratedVoicing {
  frets: (number | "x")[]; // 6 strings
  fingers: (number | 0)[];
  barre?: { fret: number; fromString: number; toString: number };
  baseFret: number;
  notes: string[];
  intervals: string[];
  cagedShape?: "C" | "A" | "G" | "E" | "D";
  type: "exact" | "simplified" | "none";
  score: number;
  description?: string;
}

export interface VoicingConstraints {
  maxFretSpan?: number;
  maxFret?: number;
  playabilityMode?: PlayabilityMode;
  capo?: number;
}

// Canonical shape templates for common guitar chords (fret string representations)
const CANONICAL_SHAPES: Record<string, { key: string; bonus: number }[]> = {
  // Major Triads
  "C-maj": [
    { key: "x,3,2,0,1,0", bonus: -5000 },
    { key: "x,3,5,5,5,3", bonus: -4000 },
    { key: "8,10,10,9,8,8", bonus: -3500 },
  ],
  "C#-maj": [
    { key: "x,4,6,6,6,4", bonus: -5000 },
    { key: "9,11,11,10,9,9", bonus: -4000 },
  ],
  "Db-maj": [
    { key: "x,4,6,6,6,4", bonus: -5000 },
    { key: "9,11,11,10,9,9", bonus: -4000 },
  ],
  "D-maj": [
    { key: "x,x,0,2,3,2", bonus: -5000 },
    { key: "x,5,7,7,7,5", bonus: -4000 },
    { key: "10,12,12,11,10,10", bonus: -3500 },
  ],
  "D#-maj": [
    { key: "x,6,8,8,8,6", bonus: -5000 },
    { key: "x,x,1,3,4,3", bonus: -4500 },
    { key: "11,13,13,12,11,11", bonus: -3500 },
  ],
  "Eb-maj": [
    { key: "x,6,8,8,8,6", bonus: -5000 },
    { key: "x,x,1,3,4,3", bonus: -4500 },
    { key: "11,13,13,12,11,11", bonus: -3500 },
  ],
  "E-maj": [
    { key: "0,2,2,1,0,0", bonus: -5000 },
    { key: "x,7,9,9,9,7", bonus: -4000 },
  ],
  "F-maj": [
    { key: "1,3,3,2,1,1", bonus: -5000 },
    { key: "x,8,10,10,10,8", bonus: -4000 },
  ],
  "F#-maj": [
    { key: "2,4,4,3,2,2", bonus: -5000 },
    { key: "x,9,11,11,11,9", bonus: -4000 },
  ],
  "Gb-maj": [
    { key: "2,4,4,3,2,2", bonus: -5000 },
    { key: "x,9,11,11,11,9", bonus: -4000 },
  ],
  "G-maj": [
    { key: "3,2,0,0,0,3", bonus: -5000 },
    { key: "3,2,0,0,3,3", bonus: -5000 },
    { key: "3,5,5,4,3,3", bonus: -4000 },
    { key: "x,10,12,12,12,10", bonus: -3500 },
  ],
  "G#-maj": [
    { key: "4,6,6,5,4,4", bonus: -5000 },
    { key: "x,11,13,13,13,11", bonus: -4000 },
  ],
  "Ab-maj": [
    { key: "4,6,6,5,4,4", bonus: -5000 },
    { key: "x,11,13,13,13,11", bonus: -4000 },
  ],
  "A-maj": [
    { key: "x,0,2,2,2,0", bonus: -5000 },
    { key: "5,7,7,6,5,5", bonus: -4000 },
    { key: "x,12,14,14,14,12", bonus: -3500 },
  ],
  "A#-maj": [
    { key: "x,1,3,3,3,1", bonus: -5000 },
    { key: "6,8,8,7,6,6", bonus: -4000 },
  ],
  "Bb-maj": [
    { key: "x,1,3,3,3,1", bonus: -5000 },
    { key: "6,8,8,7,6,6", bonus: -4000 },
  ],
  "B-maj": [
    { key: "x,2,4,4,4,2", bonus: -5000 },
    { key: "7,9,9,8,7,7", bonus: -4000 },
  ],

  // Minor Triads
  "C-min": [
    { key: "x,3,5,5,4,3", bonus: -5000 },
    { key: "8,10,10,8,8,8", bonus: -4000 },
  ],
  "C#-min": [
    { key: "x,4,6,6,5,4", bonus: -5000 },
    { key: "9,11,11,9,9,9", bonus: -4000 },
  ],
  "Db-min": [
    { key: "x,4,6,6,5,4", bonus: -5000 },
    { key: "9,11,11,9,9,9", bonus: -4000 },
  ],
  "D-min": [
    { key: "x,x,0,2,3,1", bonus: -5000 },
    { key: "x,5,7,7,6,5", bonus: -4000 },
    { key: "10,12,12,10,10,10", bonus: -3500 },
  ],
  "D#-min": [
    { key: "x,6,8,8,7,6", bonus: -5000 },
    { key: "x,x,1,3,4,2", bonus: -4500 },
    { key: "11,13,13,11,11,11", bonus: -3500 },
  ],
  "Eb-min": [
    { key: "x,6,8,8,7,6", bonus: -5000 },
    { key: "x,x,1,3,4,2", bonus: -4500 },
    { key: "11,13,13,11,11,11", bonus: -3500 },
  ],
  "E-min": [
    { key: "0,2,2,0,0,0", bonus: -5000 },
    { key: "x,7,9,9,8,7", bonus: -4000 },
  ],
  "F-min": [
    { key: "1,3,3,1,1,1", bonus: -5000 },
    { key: "x,8,10,10,9,8", bonus: -4000 },
  ],
  "F#-min": [
    { key: "2,4,4,2,2,2", bonus: -5000 },
    { key: "x,9,11,11,10,9", bonus: -4000 },
  ],
  "Gb-min": [
    { key: "2,4,4,2,2,2", bonus: -5000 },
    { key: "x,9,11,11,10,9", bonus: -4000 },
  ],
  "G-min": [
    { key: "3,5,5,3,3,3", bonus: -5000 },
    { key: "x,10,12,12,11,10", bonus: -4000 },
  ],
  "G#-min": [
    { key: "4,6,6,4,4,4", bonus: -5000 },
    { key: "x,11,13,13,12,11", bonus: -4000 },
  ],
  "Ab-min": [
    { key: "4,6,6,4,4,4", bonus: -5000 },
    { key: "x,11,13,13,12,11", bonus: -4000 },
  ],
  "A-min": [
    { key: "x,0,2,2,1,0", bonus: -5000 },
    { key: "5,7,7,5,5,5", bonus: -4000 },
  ],
  "A#-min": [
    { key: "x,1,3,3,2,1", bonus: -5000 },
    { key: "6,8,8,6,6,6", bonus: -4000 },
  ],
  "Bb-min": [
    { key: "x,1,3,3,2,1", bonus: -5000 },
    { key: "6,8,8,6,6,6", bonus: -4000 },
  ],
  "B-min": [
    { key: "x,2,4,4,3,2", bonus: -5000 },
    { key: "7,9,9,7,7,7", bonus: -4000 },
  ],

  // Dominant 7th (7)
  "C-7": [
    { key: "x,3,2,3,1,0", bonus: -5000 },
    { key: "x,3,5,3,5,3", bonus: -4000 },
    { key: "8,10,8,9,8,8", bonus: -3500 },
  ],
  "D-7": [
    { key: "x,x,0,2,1,2", bonus: -5000 },
    { key: "x,5,7,5,7,5", bonus: -4000 },
  ],
  "E-7": [
    { key: "0,2,0,1,0,0", bonus: -5000 },
    { key: "0,2,2,1,3,0", bonus: -4800 },
    { key: "x,7,9,7,9,7", bonus: -4000 },
  ],
  "F-7": [
    { key: "1,3,1,2,1,1", bonus: -5000 },
    { key: "x,8,10,8,10,8", bonus: -4000 },
  ],
  "G-7": [
    { key: "3,2,0,0,0,1", bonus: -5000 },
    { key: "3,5,3,4,3,3", bonus: -4000 },
  ],
  "A-7": [
    { key: "x,0,2,0,2,0", bonus: -5000 },
    { key: "x,0,2,2,2,3", bonus: -4800 },
    { key: "5,7,5,6,5,5", bonus: -4000 },
  ],
  "B-7": [
    { key: "x,2,1,2,0,2", bonus: -5000 },
    { key: "x,2,4,2,4,2", bonus: -4000 },
    { key: "7,9,7,8,7,7", bonus: -3500 },
  ],

  // Major 7th (maj7)
  "C-maj7": [
    { key: "x,3,2,0,0,0", bonus: -5000 },
    { key: "x,3,5,4,5,3", bonus: -4000 },
    { key: "8,10,9,9,8,8", bonus: -3500 },
  ],
  "D-maj7": [
    { key: "x,x,0,2,2,2", bonus: -5000 },
    { key: "x,5,7,6,7,5", bonus: -4000 },
  ],
  "E-maj7": [
    { key: "0,2,1,1,0,0", bonus: -5000 },
    { key: "x,7,9,8,9,7", bonus: -4000 },
  ],
  "F-maj7": [
    { key: "x,x,3,2,1,0", bonus: -5000 },
    { key: "1,3,3,2,1,0", bonus: -4800 },
    { key: "x,8,10,9,10,8", bonus: -4000 },
  ],
  "G-maj7": [
    { key: "3,2,0,0,0,2", bonus: -5000 },
    { key: "3,5,4,4,3,3", bonus: -4000 },
  ],
  "A-maj7": [
    { key: "x,0,2,1,2,0", bonus: -5000 },
    { key: "5,7,6,6,5,5", bonus: -4000 },
  ],
  "B-maj7": [
    { key: "x,2,4,3,4,2", bonus: -5000 },
    { key: "7,9,8,8,7,7", bonus: -4000 },
  ],

  // Minor 7th (m7)
  "C-m7": [
    { key: "x,3,5,3,4,3", bonus: -5000 },
    { key: "8,10,8,8,8,8", bonus: -4000 },
  ],
  "D-m7": [
    { key: "x,x,0,2,1,1", bonus: -5000 },
    { key: "x,5,7,5,6,5", bonus: -4000 },
  ],
  "E-m7": [
    { key: "0,2,2,0,3,0", bonus: -5000 },
    { key: "0,2,0,0,0,0", bonus: -4800 },
    { key: "x,7,9,7,8,7", bonus: -4000 },
  ],
  "F-m7": [
    { key: "1,3,1,1,1,1", bonus: -5000 },
    { key: "x,8,10,8,9,8", bonus: -4000 },
  ],
  "G-m7": [
    { key: "3,5,3,3,3,3", bonus: -5000 },
    { key: "x,10,12,10,11,10", bonus: -4000 },
  ],
  "A-m7": [
    { key: "x,0,2,0,1,0", bonus: -5000 },
    { key: "5,7,5,5,5,5", bonus: -4000 },
  ],
  "B-m7": [
    { key: "x,2,4,2,3,2", bonus: -5000 },
    { key: "7,9,7,7,7,7", bonus: -4000 },
  ],

  // Suspended 4th (sus4)
  "C-sus4": [
    { key: "x,3,3,0,1,0", bonus: -5000 },
    { key: "x,3,5,5,6,3", bonus: -4000 },
  ],
  "D-sus4": [
    { key: "x,x,0,2,3,3", bonus: -5000 },
    { key: "x,5,7,7,8,5", bonus: -4000 },
  ],
  "E-sus4": [
    { key: "0,2,2,2,0,0", bonus: -5000 },
    { key: "x,7,9,9,10,7", bonus: -4000 },
  ],
  "F-sus4": [
    { key: "1,3,3,3,1,1", bonus: -5000 },
  ],
  "G-sus4": [
    { key: "3,2,0,0,1,3", bonus: -5000 },
    { key: "3,3,0,0,1,3", bonus: -4800 },
  ],
  "A-sus4": [
    { key: "x,0,2,2,3,0", bonus: -5000 },
  ],
  "B-sus4": [
    { key: "x,2,4,4,5,2", bonus: -5000 },
  ],

  // Suspended 2nd (sus2)
  "C-sus2": [
    { key: "x,3,0,0,1,0", bonus: -5000 },
    { key: "x,3,5,5,3,3", bonus: -4000 },
  ],
  "D-sus2": [
    { key: "x,x,0,2,3,0", bonus: -5000 },
  ],
  "E-sus2": [
    { key: "0,2,4,1,0,0", bonus: -5000 },
    { key: "x,7,9,9,7,7", bonus: -4000 },
  ],
  "A-sus2": [
    { key: "x,0,2,2,0,0", bonus: -5000 },
  ],
  "G-sus2": [
    { key: "3,0,0,0,3,3", bonus: -5000 },
    { key: "3,0,0,2,3,3", bonus: -4800 },
  ],

  // Add 9 (add9)
  "C-add9": [
    { key: "x,3,2,0,3,0", bonus: -5000 },
    { key: "x,3,2,0,3,3", bonus: -4800 },
  ],
  "D-add9": [
    { key: "x,x,0,2,5,2", bonus: -5000 },
  ],
  "E-add9": [
    { key: "0,2,2,1,0,2", bonus: -5000 },
  ],
  "G-add9": [
    { key: "3,0,0,0,0,3", bonus: -5000 },
    { key: "3,2,0,2,0,3", bonus: -4800 },
  ],
  "A-add9": [
    { key: "x,0,2,4,2,0", bonus: -5000 },
  ],
};

export function getAllowedPitchClasses(chord: ChordDefinition): Set<PitchClass> {
  const pcs = new Set<PitchClass>();
  pcs.add(((chord.root % 12) + 12) % 12);
  for (const iv of chord.intervals) {
    pcs.add(((chord.root + (iv % 12)) % 12 + 12) % 12);
  }
  if (chord.bass !== undefined) {
    pcs.add(((chord.bass % 12) + 12) % 12);
  }
  return pcs;
}

/**
 * Mathematical verification that a candidate physical fingering + capo semitone offset
 * accurately produces the target sounding chord.
 * Rejects any candidate with foreign notes, missing essential tones, or incorrect slash bass.
 */
export function validateVoicingSounding(
  frets: (number | "x")[],
  capo: number,
  soundingChord: ChordDefinition
): { isValid: boolean; soundingPcs: PitchClass[]; lowestBassPc: PitchClass | null; error?: string } {
  const allowedPcs = getAllowedPitchClasses(soundingChord);
  const requiredPcs = getRequiredPitchClasses(soundingChord);
  const definingPcs = getDefiningPitchClasses(soundingChord);
  const soundingPcsSet = new Set<PitchClass>();
  const soundingPcsList: PitchClass[] = [];
  let lowestBassPc: PitchClass | null = null;
  let playedCount = 0;

  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f !== "x") {
      playedCount++;
      const midi = STANDARD_TUNING[s] + capo + f;
      const pc = ((midi % 12) + 12) % 12;
      soundingPcsSet.add(pc);
      soundingPcsList.push(pc);
      if (lowestBassPc === null) {
        lowestBassPc = pc;
      }
    }
  }

  const minPlayed = soundingChord.quality === "5" ? 2 : 3;
  if (playedCount < minPlayed) {
    return { isValid: false, soundingPcs: soundingPcsList, lowestBassPc, error: "Too few notes" };
  }

  // Reject foreign pitch classes
  for (const pc of soundingPcsSet) {
    if (!allowedPcs.has(pc)) {
      return { isValid: false, soundingPcs: soundingPcsList, lowestBassPc, error: `Foreign pitch class ${pc}` };
    }
  }

  // Verify slash bass if explicit bass requested
  if (soundingChord.bass !== undefined && lowestBassPc !== soundingChord.bass) {
    return { isValid: false, soundingPcs: soundingPcsList, lowestBassPc, error: `Bass mismatch: expected ${soundingChord.bass}, got ${lowestBassPc}` };
  }

  // Check defining chord tones (mandatory quality tones like defining 3rd, 7th, sus note)
  for (const defPc of definingPcs) {
    if (!soundingPcsSet.has(defPc)) {
      return { isValid: false, soundingPcs: soundingPcsList, lowestBassPc, error: `Missing required pitch class ${defPc}` };
    }
  }

  // Check required chord tones
  for (const req of requiredPcs) {
    if (!soundingPcsSet.has(req)) {
      return { isValid: false, soundingPcs: soundingPcsList, lowestBassPc, error: `Missing required pitch class ${req}` };
    }
  }

  return { isValid: true, soundingPcs: soundingPcsList, lowestBassPc };
}

export function generateVoicings(chord: ChordDefinition, constraints: VoicingConstraints = {}): GeneratedVoicing[] {
  const allowedPcs = getAllowedPitchClasses(chord);
  const requiredPcs = getRequiredPitchClasses(chord);
  
  const targetBassPc = chord.bass !== undefined ? ((chord.bass % 12) + 12) % 12 : ((chord.root % 12) + 12) % 12;
  const maxFret = constraints.maxFret || 20;
  const maxSpan = constraints.maxFretSpan || 4;
  
  const results: GeneratedVoicing[] = [];
  
  // Find bass note candidates
  const bassCandidates: { stringIdx: number; fret: number }[] = [];
  for (let stringIdx = 0; stringIdx <= 3; stringIdx++) { // strings 6(0), 5(1), 4(2), 3(3)
    for (let fret = 0; fret <= maxFret; fret++) {
      if (getStringPitchClass(stringIdx, fret) === targetBassPc) {
        bassCandidates.push({ stringIdx, fret });
      }
    }
  }

  // A cache to avoid duplicate fret combinations
  const seenFrets = new Set<string>();

  for (const bass of bassCandidates) {
    let minWindowStart = Math.max(1, bass.fret - maxSpan + 1);
    let maxWindowStart = bass.fret === 0 ? 1 : bass.fret;
    
    for (let windowStart = minWindowStart; windowStart <= maxWindowStart; windowStart++) {
      let windowEnd = windowStart + maxSpan - 1;
      
      const stringChoices: (number | "x")[][] = [];
      
      for (let s = 0; s < 6; s++) {
        if (s < bass.stringIdx) {
          stringChoices.push(["x"]);
        } else if (s === bass.stringIdx) {
          stringChoices.push([bass.fret]);
        } else {
          const choices: (number | "x")[] = ["x"];
          if (allowedPcs.has(getStringPitchClass(s, 0))) {
            choices.push(0);
          }
          for (let f = windowStart; f <= windowEnd && f <= maxFret; f++) {
            if (allowedPcs.has(getStringPitchClass(s, f))) {
              choices.push(f);
            }
          }
          stringChoices.push(choices);
        }
      }
      
      const cartesian = (arr: (number | "x")[][]): (number | "x")[][] => {
        return arr.reduce(
          (a, b) => a.flatMap(d => b.map(e => [...d, e])),
          [[]] as (number | "x")[][]
        );
      };
      
      const combinations = cartesian(stringChoices);
      
      for (const frets of combinations) {
        const key = frets.join(",");
        if (seenFrets.has(key)) continue;
        seenFrets.add(key);
        
        const voicing = evaluateCombination(frets, chord, requiredPcs, allowedPcs, constraints);
        if (voicing) {
          results.push(voicing);
        }
      }
    }
  }
  
  return rankVoicings(results);
}

function evaluateCombination(
  frets: (number | "x")[], 
  chord: ChordDefinition, 
  requiredPcs: Set<PitchClass>,
  allowedPcs: Set<PitchClass>,
  constraints: VoicingConstraints = {}
): GeneratedVoicing | null {
  const mode = constraints.playabilityMode || "standard";
  
  const presentPcs = new Set<PitchClass>();
  const notes: string[] = [];
  const intervals: string[] = [];
  
  let playedStrings = 0;
  const isFlatContext = chord.rootName.includes("b") || chord.rootName === "F";
  
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f !== "x") {
      playedStrings++;
      const pc = getStringPitchClass(s, f);
      presentPcs.add(pc);
      notes.push(getNoteName(pc, isFlatContext));
      
      let iv = ((pc - chord.root) % 12 + 12) % 12;
      let ivText = iv === 0 ? "1" : iv === 2 ? "2" : iv === 3 ? "b3" : iv === 4 ? "3" : iv === 5 ? "4" : iv === 6 ? "b5" : iv === 7 ? "5" : iv === 8 ? "#5" : iv === 9 ? "6" : iv === 10 ? "b7" : iv === 11 ? "7" : iv.toString();
      intervals.push(ivText);
    } else {
      notes.push("x");
      intervals.push("x");
    }
  }
  
  const minPlayed = chord.quality === "5" ? 2 : 3;
  if (playedStrings < minPlayed) return null; // Too sparse for a chord

  // Check foreign pitch classes
  for (const pc of presentPcs) {
    if (!allowedPcs.has(pc)) {
      return null;
    }
  }

  // Check mandatory chord-defining tones (e.g. defining 3rd, 7th, sus tone)
  const definingPcs = getDefiningPitchClasses(chord);
  for (const d of definingPcs) {
    if (!presentPcs.has(d)) {
      return null; // Cannot omit defining chord quality tone
    }
  }
  
  let missingRequiredCount = 0;
  for (const r of requiredPcs) {
    if (!presentPcs.has(r)) missingRequiredCount++;
  }
  
  let type: "exact" | "simplified" | "none" = "none";
  if (missingRequiredCount === 0) {
    type = "exact";
  } else if (missingRequiredCount <= 1) {
    type = "simplified";
  } else {
    return null;
  }
  
  const { fingers, barre, fingerCount } = assignFingers(frets);
  if (fingerCount > 4) return null; // impossible standard fingering
  
  const activeFrets = frets.filter(f => typeof f === "number" && f > 0) as number[];
  const minFret = activeFrets.length > 0 ? Math.min(...activeFrets) : 0;
  const maxFret = activeFrets.length > 0 ? Math.max(...activeFrets) : 0;
  
  let baseFret = minFret;
  if (maxFret <= 4) baseFret = 1;
  else if (baseFret === 0) baseFret = 1;

  const cagedShape = inferCagedShape(frets, chord.root, minFret);

  // Score computation (lower score = higher priority / better rank)
  let score = 0;
  if (type === "simplified") {
    score += 2500; // Heavily outrank simplified voicings so exact canonical and exact generated come first
  }
  
  // Base fret & span penalty
  score += minFret * 10;
  const span = maxFret - minFret;
  score += span * 5;
  score += fingerCount * 4;
  
  // Penalty for muted inner strings (gaps)
  let foundMutedInside = false;
  let firstPlayed = -1;
  let lastPlayed = -1;
  for (let s = 0; s < 6; s++) {
    if (frets[s] !== "x") {
      if (firstPlayed === -1) firstPlayed = s;
      lastPlayed = s;
    }
  }
  for (let s = firstPlayed; s <= lastPlayed; s++) {
    if (frets[s] === "x") foundMutedInside = true;
  }
  if (foundMutedInside) score += 200;

  // Reward more played strings
  score -= playedStrings * 10;
  
  // Reward open strings
  const openStrings = frets.filter(f => f === 0).length;
  score -= openStrings * 8;

  if (firstPlayed >= 0) {
    score += firstPlayed * 10;
  }

  // Canonical Shape Overrides & Ranking
  const fretKey = frets.join(",");
  const rootSharp = getNoteName(chord.root, false);
  const rootFlat = getNoteName(chord.root, true);
  const lookupKeys = [
    `${chord.rootName}-${chord.quality}`,
    `${rootSharp}-${chord.quality}`,
    `${rootFlat}-${chord.quality}`
  ];

  for (const lookupKey of lookupKeys) {
    const canonicalList = CANONICAL_SHAPES[lookupKey];
    if (canonicalList) {
      const match = canonicalList.find(c => c.key === fretKey);
      if (match) {
        score += match.bonus;
        break;
      }
    }
  }

  // Generic CAGED Barre Bonus
  if (barre && playedStrings >= 5) {
    score -= 1000; // Favor clean 5-string and 6-string barre shapes
  } else if (openStrings > 0 && playedStrings >= 4 && minFret === 0) {
    score -= 800; // Favor clean open position chords
  }

  // --- Playability Mode Adjustments ---
  switch (mode) {
    case "easy": // Easy: heavily penalize barres and high frets, reward low finger count
      if (barre) score += 3000;
      if (minFret > 2 || baseFret > 3) score += 3000;
      score -= openStrings * 200;
      score -= (4 - fingerCount) * 200;
      break;

    case "open": // Open: strongly prioritize ringing open strings and nut position
      score -= openStrings * 450;
      if (openStrings === 0) score += 2500;
      if (minFret > 1 || baseFret > 3) score += 2000;
      break;

    case "fingerstyle": // Fingerstyle: prefer open strings, full harmonic coverage, bass on string 0/1, treble active
      score -= openStrings * 120;
      if (firstPlayed <= 1) score -= 300; // strong bass foundation
      if (frets[3] !== "x" && frets[4] !== "x" && frets[5] !== "x") score -= 250; // clear treble triad
      if (foundMutedInside) score += 400;
      score -= (4 - fingerCount) * 80;
      break;

    case "barre": // Barre: strongly favor true barre shapes and full span
      if (barre) score -= 3500;
      else score += 2000;
      if (playedStrings >= 5) score -= 800;
      break;

    case "high": // High Position: prefer 5th-12th fret voicings
      if (baseFret >= 5 && baseFret <= 12) score -= 4000;
      else if (baseFret < 5) score += 4000;
      break;

    case "standard":
    default:
      // Standard CAGED balance
      break;
  }

  // Build clean human description
  let description = "";
  if (type === "simplified") {
    description = "Simplified";
  } else if (openStrings > 0 && minFret <= 2 && !barre) {
    description = cagedShape ? `Open ${cagedShape}-Shape` : "Open Position";
  } else if (barre) {
    description = cagedShape 
      ? `${cagedShape}-Shape Barre (${baseFret > 1 ? `${baseFret}fr` : "1st fret"})` 
      : `Barre Chord (${baseFret}fr)`;
  } else if (baseFret >= 5) {
    description = cagedShape ? `${cagedShape}-Shape (${baseFret}fr)` : `High Position (${baseFret}fr)`;
  } else {
    description = cagedShape ? `${cagedShape}-Shape` : `Position ${baseFret}fr`;
  }

  return {
    frets,
    fingers,
    barre,
    baseFret,
    notes,
    intervals,
    type,
    score,
    cagedShape,
    description
  };
}

function assignFingers(frets: (number | "x")[]): { 
  fingers: (number | 0)[]; 
  barre?: { fret: number; fromString: number; toString: number }; 
  fingerCount: number 
} {
  const fingers: (number | 0)[] = [0, 0, 0, 0, 0, 0];
  
  const playedIndices: number[] = [];
  let hasOpen = false;
  
  for (let i = 0; i < 6; i++) {
    if (frets[i] !== "x") {
      playedIndices.push(i);
      if (frets[i] === 0) hasOpen = true;
    }
  }

  if (playedIndices.length === 0) return { fingers, fingerCount: 0 };

  const firstPlayed = Math.min(...playedIndices);
  const lastPlayed = Math.max(...playedIndices);

  const activeFretted = playedIndices
    .filter(i => typeof frets[i] === "number" && (frets[i] as number) > 0)
    .map(i => ({ string: i, fret: frets[i] as number }));

  if (activeFretted.length === 0) {
    return { fingers, fingerCount: 0 };
  }

  const minFret = Math.min(...activeFretted.map(f => f.fret));
  const stringsAtMinFret = activeFretted.filter(f => f.fret === minFret).map(f => f.string);

  let barre: { fret: number; fromString: number; toString: number } | undefined = undefined;
  let fingerCount = 0;

  let isBarre = false;
  // A true barre cannot have open strings sounding between the outer played strings
  if (!hasOpen && minFret > 0) {
    if (
      stringsAtMinFret.length >= 2 ||
      (stringsAtMinFret.includes(firstPlayed) && stringsAtMinFret.includes(lastPlayed))
    ) {
      isBarre = true;
    }
  }

  if (isBarre) {
    barre = {
      fret: minFret,
      fromString: firstPlayed,
      toString: lastPlayed
    };
    fingerCount++; // finger 1 used for barre

    for (let s = firstPlayed; s <= lastPlayed; s++) {
      if (frets[s] === minFret) {
        fingers[s] = 1;
      }
    }
  }

  const remaining = activeFretted.filter(f => !isBarre || f.fret > minFret);
  remaining.sort((a, b) => {
    if (a.fret !== b.fret) return a.fret - b.fret;
    return a.string - b.string;
  });

  let nextFinger = isBarre ? 2 : 1;
  for (const item of remaining) {
    if (nextFinger <= 4) {
      fingers[item.string] = nextFinger;
      fingerCount++;
      nextFinger++;
    } else {
      fingerCount++;
    }
  }

  return { fingers, barre, fingerCount };
}

function inferCagedShape(frets: (number | "x")[], root: PitchClass, minFret: number): "C" | "A" | "G" | "E" | "D" | undefined {
  const normalizedRoot = ((root % 12) + 12) % 12;
  const roots: { string: number; fret: number }[] = [];
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f !== "x") {
      const pc = getStringPitchClass(s, f);
      if (pc === normalizedRoot) {
        roots.push({ string: s, fret: f });
      }
    }
  }

  if (roots.length === 0) return undefined;

  const lowestRoot = roots[0];

  // 6th string root (String 0)
  if (lowestRoot.string === 0) {
    if (typeof frets[1] === "number") {
      if (frets[1] < lowestRoot.fret) return "G"; // e.g. [3, 2, 0, 0, 0, 3]
      if (frets[1] > lowestRoot.fret) return "E"; // e.g. [0, 2, 2, 1, 0, 0] or [1, 3, 3, 2, 1, 1]
    }
    return "E";
  }

  // 5th string root (String 1)
  if (lowestRoot.string === 1) {
    if (typeof frets[2] === "number") {
      if (frets[2] < lowestRoot.fret) return "C"; // e.g. [x, 3, 2, 0, 1, 0]
      if (frets[2] > lowestRoot.fret) return "A"; // e.g. [x, 0, 2, 2, 2, 0] or [x, 1, 3, 3, 3, 1]
    }
    return "A";
  }

  // 4th string root (String 2)
  if (lowestRoot.string === 2) {
    return "D"; // e.g. [x, x, 0, 2, 3, 2]
  }

  // 3rd string root (String 3)
  if (lowestRoot.string === 3) {
    return "C";
  }

  return undefined;
}

function rankVoicings(voicings: GeneratedVoicing[]): GeneratedVoicing[] {
  return voicings.sort((a, b) => a.score - b.score);
}

