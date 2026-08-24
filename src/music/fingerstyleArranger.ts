// Fingerstyle Progression Arranger Engine for JOE-Music
// Evaluates chord sequences globally rather than chord-by-chord to optimize
// voice-leading, minimal fret jumps, bass continuity, melody flow, and finger retention.

import { ChordVoicing } from "../types";
import { parseChordSymbol } from "./chordParser";
import { generateVoicings, GeneratedVoicing, PlayabilityMode } from "./chordVoicingGenerator";
import { resolveChordFinderState, transposeChordSymbol } from "./chordTransposer";
import { STANDARD_TUNING, getMidiNote } from "./fretboard";

export interface ProgressionChordInput {
  detectedChord: string;
  time?: number;
  duration?: number;
}

export interface ArrangedVoicingStep {
  stepIndex: number;
  detectedChord: string;        // Authoritative sounding chord from MIR (e.g. "Cmaj7")
  transposedChord: string;      // Sounding chord after key transpose
  shapeChord: string;           // Physical guitar shape relative to capo
  voicing: ChordVoicing;        // Selected optimal guitar voicing
  voicingIndex: number;         // 1-based index in candidate pool
  cagedShape?: string;
  baseFret: number;
  notes: string[];
  lowestMidi: number;
  highestMidi: number;
  fretDistanceToNext?: number;
  sharedFingersWithNext?: number;
  voiceLeadingDescription?: string;
}

export interface ProgressionArrangementResult {
  steps: ArrangedVoicingStep[];
  averageFretDistance: number;
  smoothnessScore: number;      // 0 - 100%
  capo: number;
  playabilityMode: PlayabilityMode;
  totalTransitions: number;
}

export interface ArrangeOptions {
  capo?: number;
  transpose?: number;
  playabilityMode?: PlayabilityMode;
  keyContext?: string;
}

interface VoicingCandidate {
  generated: GeneratedVoicing;
  chordVoicing: ChordVoicing;
  poolIndex: number; // 1-based
  avgFret: number;
  baseFret: number;
  lowestMidi: number;
  highestMidi: number;
  playedFretStrings: Map<number, number>; // stringIdx -> fret
}

/**
 * Calculates sounding MIDI pitch for a string fretted relative to capo.
 */
function getSoundingMidi(stringIdx: number, relativeFret: number | "x", capo: number): number {
  if (relativeFret === "x") return -1;
  return STANDARD_TUNING[stringIdx] + capo + relativeFret;
}

/**
 * Extracts candidate voicing metrics for progression evaluation.
 */
function buildCandidate(
  gen: GeneratedVoicing,
  poolIndex: number,
  detectedLabel: string,
  shapeLabel: string,
  capo: number
): VoicingCandidate {
  let totalFret = 0;
  let count = 0;
  let lowestMidi = 999;
  let highestMidi = -1;
  const playedFretStrings = new Map<number, number>();

  for (let s = 0; s < 6; s++) {
    const f = gen.frets[s];
    if (f !== "x") {
      playedFretStrings.set(s, f);
      const midi = getSoundingMidi(s, f, capo);
      if (midi < lowestMidi) lowestMidi = midi;
      if (midi > highestMidi) highestMidi = midi;
      if (f > 0) {
        totalFret += f;
        count++;
      }
    }
  }

  const avgFret = count > 0 ? totalFret / count : 1;

  const chordVoicing: ChordVoicing = {
    id: `arranger-${detectedLabel}-${poolIndex}`,
    name: shapeLabel,
    root: shapeLabel.charAt(0),
    quality: "maj",
    frets: gen.frets,
    fingers: gen.fingers,
    barre: gen.barre,
    baseFret: gen.baseFret,
    notes: gen.notes,
    intervals: gen.intervals,
    cagedShape: gen.cagedShape,
    voicingType: gen.type,
    difficulty: gen.baseFret <= 3 ? "Beginner" : "Intermediate",
  };

  return {
    generated: gen,
    chordVoicing,
    poolIndex,
    avgFret,
    baseFret: gen.baseFret,
    lowestMidi,
    highestMidi,
    playedFretStrings,
  };
}

/**
 * Transition cost function between voicing A (step t-1) and voicing B (step t).
 * Lower cost means smoother fingerstyle progression.
 */
function calculateTransitionCost(
  a: VoicingCandidate,
  b: VoicingCandidate,
  mode: PlayabilityMode = "standard"
): { cost: number; fretDist: number; sharedFingers: number } {
  let cost = 0;

  // 1. Fret movement penalty (prefer close hand positions)
  const fretDist = Math.abs(a.avgFret - b.avgFret);
  cost += fretDist * 120;

  const baseDist = Math.abs(a.baseFret - b.baseFret);
  cost += baseDist * 80;

  // 2. Treble voice leading (melody flow)
  // Distance in semitones between highest sounding melody notes
  const trebleDiff = Math.abs(a.highestMidi - b.highestMidi);
  if (trebleDiff <= 2) {
    cost -= 150; // smooth stepwise or unison melody
  } else if (trebleDiff <= 4) {
    cost -= 50;
  } else {
    cost += trebleDiff * 30; // large melody jumps penalized
  }

  // 3. Bass line continuity (bass flow)
  const bassDiff = Math.abs(a.lowestMidi - b.lowestMidi);
  if (bassDiff <= 2) {
    cost -= 120; // stepwise bass motion (e.g. C -> B -> A)
  } else if (bassDiff === 5 || bassDiff === 7) {
    cost -= 80; // 4th / 5th circle motion
  } else if (bassDiff > 12) {
    cost += 200; // octave jumps
  }

  // 4. Shared fingers / anchor notes bonus
  let sharedFingers = 0;
  for (const [s, f] of a.playedFretStrings.entries()) {
    if (b.playedFretStrings.has(s) && b.playedFretStrings.get(s) === f && f > 0) {
      sharedFingers++;
      cost -= 180; // strong discount for anchor finger retention
    }
  }

  // 5. Open string continuity
  for (const [s, f] of a.playedFretStrings.entries()) {
    if (f === 0 && b.playedFretStrings.get(s) === 0) {
      cost -= 90; // sustained ringing open drone
    }
  }

  // 6. Playability mode adjustments on transition
  if (mode === "fingerstyle") {
    // In fingerstyle, prioritize lower hand shifts and open pedal strings even more
    cost += fretDist * 60;
    if (sharedFingers > 0) cost -= sharedFingers * 100;
  } else if (mode === "easy") {
    // In easy mode, heavily penalize moving up the neck
    if (b.baseFret > 3) cost += 500;
  }

  return { cost, fretDist, sharedFingers };
}

/**
 * Arranges a complete chord progression using Global Voice-Leading Optimization (Dynamic Programming).
 */
export function arrangeChordProgression(
  progression: (string | ProgressionChordInput)[],
  options: ArrangeOptions = {}
): ProgressionArrangementResult {
  const capo = options.capo ?? 0;
  const transpose = options.transpose ?? 0;
  const mode = options.playabilityMode ?? "standard";
  const keyCtx = options.keyContext;

  if (!progression || progression.length === 0) {
    return {
      steps: [],
      averageFretDistance: 0,
      smoothnessScore: 100,
      capo,
      playabilityMode: mode,
      totalTransitions: 0,
    };
  }

  // Normalize inputs to chord strings
  const chordLabels = progression.map((p) => (typeof p === "string" ? p : p.detectedChord));

  // Step 1: Generate candidate pools for each chord in the progression
  const stageCandidates: VoicingCandidate[][] = [];
  const stageChordStates: ReturnType<typeof resolveChordFinderState>[] = [];

  for (let i = 0; i < chordLabels.length; i++) {
    const rawChord = chordLabels[i];
    const chordState = resolveChordFinderState(rawChord, transpose, capo, keyCtx);
    stageChordStates.push(chordState);

    const parsedShape = parseChordSymbol(chordState.shapeChord);
    let candidates: VoicingCandidate[] = [];

    if (parsedShape.isValid && parsedShape.chord) {
      const generated = generateVoicings(parsedShape.chord, {
        maxFretSpan: 4,
        maxFret: 15,
        playabilityMode: mode,
      });

      candidates = generated.slice(0, 6).map((gen, idx) =>
        buildCandidate(gen, idx + 1, chordState.detectedChord, chordState.shapeChord, capo)
      );
    }

    // Fallback if no procedural voicings found
    if (candidates.length === 0) {
      const fallbackGen: GeneratedVoicing = {
        frets: ["x", "x", "x", "x", "x", "x"],
        fingers: [0, 0, 0, 0, 0, 0],
        baseFret: 1,
        notes: [],
        intervals: [],
        type: "simplified",
        score: 10000,
      };
      candidates.push(
        buildCandidate(fallbackGen, 1, chordState.detectedChord, chordState.shapeChord, capo)
      );
    }

    stageCandidates.push(candidates);
  }

  const N = stageCandidates.length;

  // Step 2: Dynamic Programming (Viterbi path optimization)
  // dp[t][k] = min total cost to reach candidate k at stage t
  const dp: number[][] = [];
  const bp: number[][] = []; // backpointers

  // Initialize stage 0
  dp[0] = stageCandidates[0].map((c) => c.generated.score);
  bp[0] = stageCandidates[0].map(() => -1);

  // Forward pass
  for (let t = 1; t < N; t++) {
    dp[t] = [];
    bp[t] = [];
    const prevStage = stageCandidates[t - 1];
    const currStage = stageCandidates[t];

    for (let j = 0; j < currStage.length; j++) {
      const currCand = currStage[j];
      let bestCost = Infinity;
      let bestPrevIdx = 0;

      for (let i = 0; i < prevStage.length; i++) {
        const prevCand = prevStage[i];
        const { cost: transCost } = calculateTransitionCost(prevCand, currCand, mode);
        const total = dp[t - 1][i] + transCost + currCand.generated.score;

        if (total < bestCost) {
          bestCost = total;
          bestPrevIdx = i;
        }
      }

      dp[t][j] = bestCost;
      bp[t][j] = bestPrevIdx;
    }
  }

  // Step 3: Backtrack to extract the optimal sequence
  let bestFinalIdx = 0;
  let minFinalCost = Infinity;
  for (let j = 0; j < dp[N - 1].length; j++) {
    if (dp[N - 1][j] < minFinalCost) {
      minFinalCost = dp[N - 1][j];
      bestFinalIdx = j;
    }
  }

  const optimalIndices: number[] = new Array(N);
  let currentIdx = bestFinalIdx;
  for (let t = N - 1; t >= 0; t--) {
    optimalIndices[t] = currentIdx;
    currentIdx = bp[t][currentIdx];
  }

  // Step 4: Build detailed arrangement steps with voice-leading descriptions
  const steps: ArrangedVoicingStep[] = [];
  let totalFretDist = 0;
  let totalTransitions = 0;

  for (let t = 0; t < N; t++) {
    const cand = stageCandidates[t][optimalIndices[t]];
    const chordState = stageChordStates[t];

    let fretDistanceToNext: number | undefined = undefined;
    let sharedFingersWithNext: number | undefined = undefined;
    let voiceLeadingDescription: string | undefined = undefined;

    if (t < N - 1) {
      const nextCand = stageCandidates[t + 1][optimalIndices[t + 1]];
      const { fretDist, sharedFingers } = calculateTransitionCost(cand, nextCand, mode);
      fretDistanceToNext = Math.round(fretDist * 10) / 10;
      sharedFingersWithNext = sharedFingers;
      totalFretDist += fretDist;
      totalTransitions++;

      if (sharedFingers > 0) {
        voiceLeadingDescription = `${sharedFingers} anchor finger${sharedFingers > 1 ? "s" : ""} held`;
      } else if (fretDist <= 1) {
        voiceLeadingDescription = "Smooth same-position transition";
      } else {
        voiceLeadingDescription = `Shift ${fretDistanceToNext} frets`;
      }
    }

    steps.push({
      stepIndex: t,
      detectedChord: chordState.detectedChord,
      transposedChord: chordState.transposedChord,
      shapeChord: chordState.shapeChord,
      voicing: cand.chordVoicing,
      voicingIndex: cand.poolIndex,
      cagedShape: cand.generated.cagedShape,
      baseFret: cand.baseFret,
      notes: cand.generated.notes,
      lowestMidi: cand.lowestMidi,
      highestMidi: cand.highestMidi,
      fretDistanceToNext,
      sharedFingersWithNext,
      voiceLeadingDescription,
    });
  }

  const averageFretDistance = totalTransitions > 0 ? Math.round((totalFretDist / totalTransitions) * 10) / 10 : 0;
  // Smoothness score: 100% when avg shift is 0, decaying gracefully
  const smoothnessScore = Math.max(0, Math.min(100, Math.round(100 - averageFretDistance * 12)));

  return {
    steps,
    averageFretDistance,
    smoothnessScore,
    capo,
    playabilityMode: mode,
    totalTransitions,
  };
}
