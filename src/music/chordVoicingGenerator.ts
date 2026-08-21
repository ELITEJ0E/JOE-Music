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
    // Determine fret windows
    // Window can start from bass.fret - span to bass.fret
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
          // open string
          if (allowedPcs.has(getStringPitchClass(s, 0))) {
            choices.push(0);
          }
          // fretted notes in window
          for (let f = windowStart; f <= windowEnd && f <= maxFret; f++) {
            if (allowedPcs.has(getStringPitchClass(s, f))) {
              choices.push(f);
            }
          }
          stringChoices.push(choices);
        }
      }
      
      // Cartesian product of stringChoices
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
        
        // Evaluate combination
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
  
  // 1. Must contain all required pitch classes (for "exact"), 
  // or at least root and 3rd/5th for "simplified"
  const presentPcs = new Set<PitchClass>();
  const notes: string[] = [];
  const intervals: string[] = [];
  
  let playedStrings = 0;
  
  for (let s = 0; s < 6; s++) {
    const f = frets[s];
    if (f !== "x") {
      playedStrings++;
      const pc = getStringPitchClass(s, f);
      presentPcs.add(pc);
      notes.push(getNoteName(pc));
      
      // calculate interval text roughly
      // We can do this better, but let's just put something simple
      let iv = (pc - chord.root + 12) % 12;
      let ivText = iv === 0 ? "1" : iv === 3 || iv === 4 ? "3" : iv === 7 ? "5" : iv.toString();
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
    // simplified
    type = "simplified";
  } else {
    return null;
  }
  
  // 2. Filter out impossible fingerings (more than 4 fingers)
  const { fingers, barre, fingerCount } = assignFingers(frets);
  if (fingerCount > 4) return null; // impossible without thumb wrapping
  
  // 3. Base fret
  const activeFrets = frets.filter(f => typeof f === "number" && f > 0) as number[];
  const minFret = activeFrets.length > 0 ? Math.min(...activeFrets) : 0;
  const maxFret = activeFrets.length > 0 ? Math.max(...activeFrets) : 0;
  
  let baseFret = minFret;
  if (maxFret <= 4) baseFret = 1;
  else if (baseFret === 0) baseFret = 1;

  // Compute a score (lower is better)
  let score = 0;
  if (type === "simplified") score += 1000;
  
  // Add penalty for higher frets
  score += minFret * 5;
  
  // Add penalty for fret span
  const span = maxFret - minFret;
  score += span * 3;
  
  // Add penalty for number of fingers
  score += fingerCount * 2;
  
  // Add penalty for muted inner strings (skip)
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
  if (foundMutedInside) score += 50;

  // Add penalty for bass note on higher strings
  
  // Reward more played strings
  score -= playedStrings * 5;
  
  // Reward open strings
  const openStrings = frets.filter(f => f === 0).length;
  score -= openStrings * 3;

  if (firstPlayed >= 0) {
    score += firstPlayed * 5;
  }


  // CAGED shape inference
  const cagedShape = inferCagedShape(frets, chord.root, minFret);

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

function assignFingers(frets: (number | "x")[]): { fingers: (number | 0)[], barre?: { fret: number, fromString: number, toString: number }, fingerCount: number } {
  // Simplistic finger assignment
  const fingers: (number | 0)[] = [0,0,0,0,0,0];
  const activeFrets = frets.map((f, i) => ({ string: i, fret: f })).filter(f => typeof f.fret === "number" && f.fret > 0) as {string: number, fret: number}[];
  
  if (activeFrets.length === 0) return { fingers, fingerCount: 0 };
  
  // Check for barre
  const fretCounts = new Map<number, number>();
  for (const af of activeFrets) fretCounts.set(af.fret, (fretCounts.get(af.fret) || 0) + 1);
  
  let bestBarreFret = -1;
  let maxCount = 0;
  for (const [f, count] of fretCounts.entries()) {
    if (count > 1 && count > maxCount) {
      // Must be the lowest fret among active frets to be a reasonable barre usually
      const isLowest = f === Math.min(...activeFrets.map(x => x.fret));
      if (isLowest) {
        maxCount = count;
        bestBarreFret = f;
      }
    }
  }
  
  let barre = undefined;
  let fingerCount = 0;
  let remainingFrets = activeFrets;
  
  if (bestBarreFret > 0 && maxCount >= 2) {
    const barreStrings = activeFrets.filter(af => af.fret === bestBarreFret).map(af => af.string);
    const fromString = Math.min(...barreStrings);
    const toString = Math.max(...barreStrings);
    barre = { fret: bestBarreFret, fromString, toString };
    fingerCount++; // index finger used for barre
    
    // Assign finger 1 to all barre strings
    for (const af of activeFrets) {
      if (af.fret === bestBarreFret) {
        fingers[af.string] = 1;
      }
    }
    remainingFrets = activeFrets.filter(af => af.fret !== bestBarreFret);
  }
  
  // Sort remaining frets by fret number, then string number
  remainingFrets.sort((a, b) => {
    if (a.fret !== b.fret) return a.fret - b.fret;
    return a.string - b.string;
  });
  
  let currentFinger = barre ? 2 : 1;
  for (const af of remainingFrets) {
    if (currentFinger > 4) {
      fingerCount++; // Exceeded fingers
    } else {
      fingers[af.string] = currentFinger;
      currentFinger++;
      fingerCount++;
    }
  }
  
  // For 'x', we can just use 0, wait, 'x' isn't in activeFrets.
  // So they remain 0.
  
  return { fingers, barre, fingerCount };
}

function inferCagedShape(frets: (number | "x")[], root: PitchClass, minFret: number): "C" | "A" | "G" | "E" | "D" | undefined {
  // Simple heuristic based on the bass string and shape of the root
  // 6th string root -> E or G
  // 5th string root -> A or C
  // 4th string root -> D
  
  // Let's find roots
  const roots = [];
  for (let s=0; s<6; s++) {
    const f = frets[s];
    if (f !== "x") {
      const pc = getStringPitchClass(s, f);
      if (pc === root) roots.push({string: s, fret: f});
    }
  }
  
  if (roots.length === 0) return undefined;
  
  const lowestRoot = roots[0];
  if (lowestRoot.string === 0) { // 6th string
    // If there's a root on 1st/6th string, it's usually E shape if fret is lowest in chord
    if (lowestRoot.fret === minFret || lowestRoot.fret === minFret + 1) return "E";
    return "G";
  }
  if (lowestRoot.string === 1) { // 5th string
    if (lowestRoot.fret === minFret || lowestRoot.fret === minFret + 1) return "A";
    return "C";
  }
  if (lowestRoot.string === 2) { // 4th string
    return "D";
  }
  
  return undefined;
}

function rankVoicings(voicings: GeneratedVoicing[]): GeneratedVoicing[] {
  return voicings.sort((a, b) => a.score - b.score);
}
