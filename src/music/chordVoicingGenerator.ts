import { ChordDefinition, getRequiredPitchClasses, getNoteName, PitchClass } from "./chordTheory";
import { STANDARD_TUNING, getStringPitchClass, getMidiNote } from "./fretboard";

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
}

export interface VoicingConstraints {
  maxFretSpan?: number;
  maxFret?: number;
}

// Canonical shape templates for common guitar chords (fret string representations)
const CANONICAL_SHAPES: Record<string, { key: string; bonus: number }[]> = {
  // Major
  "B-maj": [
    { key: "x,2,4,4,4,2", bonus: -5000 },
    { key: "7,9,9,8,7,7", bonus: -4000 },
  ],
  "F-maj": [
    { key: "1,3,3,2,1,1", bonus: -5000 },
    { key: "x,8,10,10,10,8", bonus: -4000 },
  ],
  "C-maj": [
    { key: "x,3,2,0,1,0", bonus: -5000 },
    { key: "x,3,5,5,5,3", bonus: -3500 },
    { key: "8,10,10,9,8,8", bonus: -3000 },
  ],
  "G-maj": [
    { key: "3,2,0,0,0,3", bonus: -5000 },
    { key: "3,2,0,0,3,3", bonus: -5000 },
    { key: "3,5,5,4,3,3", bonus: -3500 },
  ],
  "D-maj": [
    { key: "x,x,0,2,3,2", bonus: -5000 },
    { key: "x,5,7,7,7,5", bonus: -3500 },
  ],
  "A-maj": [
    { key: "x,0,2,2,2,0", bonus: -5000 },
    { key: "5,7,7,6,5,5", bonus: -3500 },
  ],
  "E-maj": [
    { key: "0,2,2,1,0,0", bonus: -5000 },
    { key: "x,7,9,9,9,7", bonus: -3500 },
  ],
  // Minor
  "A-min": [
    { key: "x,0,2,2,1,0", bonus: -5000 },
    { key: "5,7,7,5,5,5", bonus: -3500 },
  ],
  "E-min": [
    { key: "0,2,2,0,0,0", bonus: -5000 },
    { key: "x,7,9,9,8,7", bonus: -3500 },
  ],
  "C-min": [
    { key: "x,3,5,5,4,3", bonus: -5000 },
    { key: "8,10,10,8,8,8", bonus: -4000 },
  ],
  "D-min": [
    { key: "x,x,0,2,3,1", bonus: -5000 },
    { key: "x,5,7,7,6,5", bonus: -3500 },
  ],
  "B-min": [
    { key: "x,2,4,4,3,2", bonus: -5000 },
    { key: "7,9,9,7,7,7", bonus: -4000 },
  ],
  "F-min": [
    { key: "1,3,3,1,1,1", bonus: -5000 },
    { key: "x,8,10,10,9,8", bonus: -4000 },
  ],
  "G-min": [
    { key: "3,5,5,3,3,3", bonus: -5000 },
    { key: "x,10,12,12,11,10", bonus: -4000 },
  ],
};

function getAllowedPitchClasses(chord: ChordDefinition): Set<PitchClass> {
  const pcs = new Set<PitchClass>();
  pcs.add(chord.root);
  for (const iv of chord.intervals) {
    pcs.add((chord.root + iv) % 12);
  }
  if (chord.bass !== undefined) {
    pcs.add(chord.bass % 12);
  }
  return pcs;
}

export function generateVoicings(chord: ChordDefinition, constraints: VoicingConstraints = {}): GeneratedVoicing[] {
  const allowedPcs = getAllowedPitchClasses(chord);
  const requiredPcs = getRequiredPitchClasses(chord);
  
  const targetBassPc = chord.bass !== undefined ? chord.bass : chord.root;
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
        
        const voicing = evaluateCombination(frets, chord, requiredPcs, allowedPcs);
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
  allowedPcs: Set<PitchClass>
): GeneratedVoicing | null {
  
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
      
      let iv = (pc - chord.root + 12) % 12;
      let ivText = iv === 0 ? "1" : iv === 3 ? "b3" : iv === 4 ? "3" : iv === 7 ? "5" : iv.toString();
      intervals.push(ivText);
    } else {
      notes.push("x");
      intervals.push("x");
    }
  }
  
  if (playedStrings < 3) return null; // Too sparse for a chord
  
  let missingCount = 0;
  for (const r of requiredPcs) {
    if (!presentPcs.has(r)) missingCount++;
  }
  
  let type: "exact" | "simplified" | "none" = "none";
  if (missingCount === 0) {
    type = "exact";
  } else if (missingCount <= 1 && presentPcs.has(chord.root)) {
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

  // Score computation (lower is better)
  let score = 0;
  if (type === "simplified") score += 1000;
  
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
  const chordLookupKey = `${chord.rootName}-${chord.quality}`;
  const canonicalList = CANONICAL_SHAPES[chordLookupKey];
  const fretKey = frets.join(",");
  if (canonicalList) {
    const match = canonicalList.find(c => c.key === fretKey);
    if (match) {
      score += match.bonus;
    }
  }

  // Generic CAGED Barre Bonus
  if (barre && playedStrings >= 5) {
    score -= 1000; // Strongly favor clean 5-string and 6-string barre shapes
  } else if (openStrings > 0 && playedStrings >= 4 && minFret === 0) {
    score -= 800; // Strongly favor clean open position chords
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
    cagedShape
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
  const roots: { string: number; fret: number }[] = [];
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f !== "x") {
      const pc = getStringPitchClass(s, f);
      if (pc === root) {
        roots.push({ string: s, fret: f });
      }
    }
  }

  if (roots.length === 0) return undefined;

  const lowestRoot = roots[0];

  if (lowestRoot.string === 0) { // 6th string root
    if (frets[1] !== "x" && (frets[1] as number) > lowestRoot.fret) {
      return "E";
    }
    if (lowestRoot.fret === minFret || lowestRoot.fret === minFret + 1) return "E";
    return "G";
  }

  if (lowestRoot.string === 1) { // 5th string root
    if (lowestRoot.fret === minFret || lowestRoot.fret <= minFret + 1) {
      return "A";
    }
    return "C";
  }

  if (lowestRoot.string === 2) { // 4th string root
    return "D";
  }

  if (lowestRoot.string === 3) { // 3rd string root
    return "C";
  }

  return undefined;
}

function rankVoicings(voicings: GeneratedVoicing[]): GeneratedVoicing[] {
  return voicings.sort((a, b) => a.score - b.score);
}

