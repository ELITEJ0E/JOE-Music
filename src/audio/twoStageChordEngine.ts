// Two-Stage Musical Chord Decision Engine for JOE-Music
// Stage 1: Root Estimation (Bass fundamental + mid-chroma + fifths acoustic reinforcement + key context)
// Stage 2: Quality & Extension Selection (Third presence, triad vs extension, anti-overfitting)
// Stage 3: Inversion / Slash Chord Evaluation (Genuine inversion vs passing bass note)

import { NOTE_NAMES } from "./chromaExtractor";
import { normalizeChord } from "./chordNormalizer";

export interface ChordCandidate {
  chord: string;              // e.g. "A", "F#m", "C/E", "D"
  root: string;               // e.g. "A"
  bass: string;               // e.g. "A" or "E"
  quality: string;            // "maj", "min", "7", "maj7", "min7", "sus2", "sus4", "add9", "5", "dim"
  extensions: string[];
  score: number;              // 0.0 - 1.0
  rootScore: number;
  qualityScore: number;
  thirdEvidence: number;
  isSlash: boolean;
  bassEvidence: number;
  scoreMargin?: number;
  neighborSupport?: number;
  persistenceScore?: number;
  diagnostics: {
    rootCandidates: Array<{ note: string; score: number }>;
    maj3Evidence: number;
    min3Evidence: number;
    fifthEvidence: number;
    definingEvidence: number;
    slashBassRatio: number;
    scoreMargin?: number;
    neighborSupport?: number;
    persistenceScore?: number;
  };
}

export interface DiatonicProfile {
  keyNote: string;
  isMajor: boolean;
  diatonicRoots: number[];      // Pitch class indices
  diatonicQualities: string[];  // "maj", "min", "dim"
}

export function parseDiatonicProfile(keyString: string): DiatonicProfile {
  const parts = keyString.split(" ");
  const keyNote = parts[0] || "C";
  const isMajor = (parts[1] || "Major").toLowerCase().includes("maj");
  const rootIdx = Math.max(0, NOTE_NAMES.indexOf(keyNote));

  let diatonicRoots: number[] = [];
  let diatonicQualities: string[] = [];

  if (isMajor) {
    diatonicRoots = [0, 2, 4, 5, 7, 9, 11].map(iv => (rootIdx + iv) % 12);
    diatonicQualities = ["maj", "min", "min", "maj", "maj", "min", "dim"];
  } else {
    diatonicRoots = [0, 2, 3, 5, 7, 8, 10].map(iv => (rootIdx + iv) % 12);
    diatonicQualities = ["min", "dim", "maj", "min", "min", "maj", "maj"];
  }

  return { keyNote, isMajor, diatonicRoots, diatonicQualities };
}

/**
 * Stage 1: Root Estimation
 * Evaluates candidate roots using bass fundamental (35-260 Hz), mid-chroma fundamental,
 * fifth reinforcement, and diatonic key context.
 */
export function estimateRootCandidates(
  chroma: Float32Array,
  bassChroma: Float32Array,
  keyProfile: DiatonicProfile,
  maxCandidates: number = 4
): Array<{ rootIdx: number; note: string; score: number; bassEv: number }> {
  const rootScores = new Array(12);

  for (let r = 0; r < 12; r++) {
    const bassEv = bassChroma[r];
    const trebleRootEv = chroma[r];
    const fifthEv = chroma[(r + 7) % 12];
    const maj3Ev = chroma[(r + 4) % 12];
    const min3Ev = chroma[(r + 3) % 12];
    const octaveBassEv = (bassEv > 0.3 && trebleRootEv > 0.3) ? 0.15 : 0.0;

    // Diatonic bonus
    const diatonicIdx = keyProfile.diatonicRoots.indexOf(r);
    const diatonicBonus = diatonicIdx !== -1 ? 0.08 : 0.0;

    // Separate bass movement from harmonic movement (Section 9):
    // Check if r is an isolated bass note lacking harmonic 5th resonance in mid-chroma,
    // while another root H for which r is a 3rd or 5th has a complete harmonic triad.
    let bassWeight = 0.42;

    const parentMajRoot = (r - 4 + 12) % 12; // r is major 3rd of parentMajRoot
    const parentMinRoot = (r - 3 + 12) % 12; // r is minor 3rd of parentMinRoot
    const parentFifthRoot = (r - 7 + 12) % 12; // r is 5th of parentFifthRoot

    const parentMajHarmonic = chroma[parentMajRoot] * 0.5 + chroma[(parentMajRoot + 7) % 12] * 0.5;
    const parentMinHarmonic = chroma[parentMinRoot] * 0.5 + chroma[(parentMinRoot + 7) % 12] * 0.5;
    const parentFifthHarmonic = chroma[parentFifthRoot] * 0.5 + chroma[(parentFifthRoot + 4) % 12] * 0.5;
    const maxParentHarmonic = Math.max(parentMajHarmonic, parentMinHarmonic, parentFifthHarmonic);

    if (fifthEv < 0.20 && maxParentHarmonic > 0.55 && trebleRootEv < maxParentHarmonic * 1.1) {
      // r is an inversion bass note or passing bass note, not an independent harmonic root
      bassWeight = 0.16;
    }

    // Root score formulation:
    // Bass fundamental anchored with harmonic chroma root & fifth
    let score = (bassEv * bassWeight) +
                (trebleRootEv * 0.32) +
                (fifthEv * 0.18) +
                octaveBassEv +
                diatonicBonus;

    // If bass is playing a legitimate chord tone (3rd or 5th) of r, r receives inversion bass support
    const bassMaj3 = bassChroma[(r + 4) % 12];
    const bassMin3 = bassChroma[(r + 3) % 12];
    const bass5th = bassChroma[(r + 7) % 12];
    const chordToneBassEv = Math.max(bassMaj3, bassMin3, bass5th);
    if (bassEv < 0.25 && chordToneBassEv > 0.40 && trebleRootEv > 0.40 && fifthEv > 0.30) {
      score += chordToneBassEv * 0.26;
    }

    rootScores[r] = {
      rootIdx: r,
      note: NOTE_NAMES[r],
      score,
      bassEv
    };
  }

  rootScores.sort((a, b) => b.score - a.score);
  return rootScores.slice(0, maxCandidates);
}

interface QualityDef {
  quality: string;
  intervals: number[];
  baseComplexity: number;
  definingIntervals: number[];
}

const QUALITY_DEFINITIONS: QualityDef[] = [
  { quality: "maj", intervals: [0, 4, 7], baseComplexity: 0.0, definingIntervals: [4] },
  { quality: "min", intervals: [0, 3, 7], baseComplexity: 0.0, definingIntervals: [3] },
  { quality: "sus4", intervals: [0, 5, 7], baseComplexity: 0.16, definingIntervals: [5] },
  { quality: "sus2", intervals: [0, 2, 7], baseComplexity: 0.16, definingIntervals: [2] },
  { quality: "5", intervals: [0, 7], baseComplexity: 0.12, definingIntervals: [7] },
  { quality: "7", intervals: [0, 4, 7, 10], baseComplexity: 0.20, definingIntervals: [10] },
  { quality: "maj7", intervals: [0, 4, 7, 11], baseComplexity: 0.22, definingIntervals: [11] },
  { quality: "min7", intervals: [0, 3, 7, 10], baseComplexity: 0.20, definingIntervals: [3, 10] },
  { quality: "add9", intervals: [0, 2, 4, 7], baseComplexity: 0.24, definingIntervals: [2, 4] },
  { quality: "dim", intervals: [0, 3, 6], baseComplexity: 0.18, definingIntervals: [3, 6] }
];

/**
 * Stage 2: Quality Estimation for a specific Root
 * Tests triad qualities and extensions against acoustic evidence.
 * Strongly enforces Anti-Overfitting: simple triads are preferred unless
 * defining tones have unambiguous, strong spectral evidence.
 */
export function evaluateQualityForRoot(
  rootIdx: number,
  chroma: Float32Array,
  bassChroma: Float32Array,
  keyProfile: DiatonicProfile,
  rootBaseScore: number
): ChordCandidate {
  const rootName = NOTE_NAMES[rootIdx];
  const maj3Ev = chroma[(rootIdx + 4) % 12];
  const min3Ev = chroma[(rootIdx + 3) % 12];
  const fifthEv = chroma[(rootIdx + 7) % 12];
  const fourthEv = chroma[(rootIdx + 5) % 12];
  const secondEv = chroma[(rootIdx + 2) % 12];
  const min7Ev = chroma[(rootIdx + 10) % 12];
  const maj7Ev = chroma[(rootIdx + 11) % 12];

  // Diatonic expectation for this root
  const diatonicIdx = keyProfile.diatonicRoots.indexOf(rootIdx);
  const expectedQuality = diatonicIdx !== -1 ? keyProfile.diatonicQualities[diatonicIdx] : "maj";

  let bestQualityDef = QUALITY_DEFINITIONS[0]; // default maj
  let bestQualityScore = -Infinity;
  let bestThirdEvidence = maj3Ev;
  let bestDefiningEv = 0;

  for (const qDef of QUALITY_DEFINITIONS) {
    let toneSum = 0;
    let missingPenalty = 0;
    let definingEv = 0;

    for (const iv of qDef.intervals) {
      const pc = (rootIdx + iv) % 12;
      const ev = chroma[pc];
      toneSum += ev;

      if (qDef.definingIntervals.includes(iv)) {
        definingEv = Math.max(definingEv, ev);
      }

      if (ev < 0.20) {
        missingPenalty += (0.20 - ev) * 1.5;
        if (qDef.definingIntervals.includes(iv)) {
          missingPenalty += 0.8; // Heavily penalize missing defining interval (e.g. 3rd or 7th)
        }
      }
    }

    const meanToneStrength = toneSum / qDef.intervals.length;

    // Specific quality acoustic anti-rules:
    // 1. Sus4: if major 3rd is strong, heavily penalize sus4
    if (qDef.quality === "sus4" && maj3Ev > 0.28) {
      missingPenalty += maj3Ev * 1.5;
    }
    // 2. Sus2: if either 3rd is strong, penalize sus2
    if (qDef.quality === "sus2" && Math.max(maj3Ev, min3Ev) > 0.28) {
      missingPenalty += Math.max(maj3Ev, min3Ev) * 1.5;
    }
    // 3. Power chord 5: only when NO 3rd is present (strict requirement)
    if (qDef.quality === "5" && Math.max(maj3Ev, min3Ev) > 0.18) {
      missingPenalty += 0.8;
    }

    // Diatonic consistency bonus
    let diatonicBonus = 0;
    if (qDef.quality === expectedQuality) {
      diatonicBonus = 0.08;
    } else if (qDef.quality === expectedQuality + "7") {
      diatonicBonus = 0.04;
    }

    // Extensions require strong, sustained defining evidence (>= 0.45) and clear separation from passing notes
    if (["7", "maj7", "min7", "add9"].includes(qDef.quality)) {
      const triadStrength = (chroma[rootIdx] + (qDef.quality.includes("min") ? min3Ev : maj3Ev) + fifthEv) / 3;
      if (definingEv < 0.45) {
        missingPenalty += (0.45 - definingEv) * 2.5;
      }
      // Passing melodic notes: if the defining tone is significantly weaker than the fundamental triad tones, penalize it
      if (definingEv < triadStrength * 0.65) {
        missingPenalty += 0.35;
      }
    }

    const qScore = meanToneStrength - missingPenalty - qDef.baseComplexity + diatonicBonus;

    if (qScore > bestQualityScore) {
      bestQualityScore = qScore;
      bestQualityDef = qDef;
      bestThirdEvidence = qDef.intervals.includes(3) ? min3Ev : qDef.intervals.includes(4) ? maj3Ev : 0;
      bestDefiningEv = definingEv;
    }
  }

  // Major vs Minor decision with Key Scale Awareness
  let finalQuality = bestQualityDef.quality;
  if (finalQuality === "maj" || finalQuality === "min") {
    const maj3PitchClass = (rootIdx + 4) % 12;
    const min3PitchClass = (rootIdx + 3) % 12;
    const maj3InScale = keyProfile.diatonicRoots.includes(maj3PitchClass);
    const min3InScale = keyProfile.diatonicRoots.includes(min3PitchClass);

    // If one 3rd is in the key's diatonic scale and the other is not,
    // require significant acoustic margin (>= 0.14) for the non-scale 3rd to win
    if (maj3InScale && !min3InScale) {
      if (min3Ev > maj3Ev + 0.14 && min3Ev >= 0.25) {
        finalQuality = "min";
        bestThirdEvidence = min3Ev;
      } else {
        finalQuality = "maj";
        bestThirdEvidence = maj3Ev;
      }
    } else if (min3InScale && !maj3InScale) {
      if (maj3Ev > min3Ev + 0.14 && maj3Ev >= 0.25) {
        finalQuality = "maj";
        bestThirdEvidence = maj3Ev;
      } else {
        finalQuality = "min";
        bestThirdEvidence = min3Ev;
      }
    } else {
      // Both in scale or both outside: compare directly with threshold
      if (min3Ev > maj3Ev + 0.08 && min3Ev >= 0.20) {
        finalQuality = "min";
        bestThirdEvidence = min3Ev;
      } else if (maj3Ev > min3Ev + 0.08 && maj3Ev >= 0.20) {
        finalQuality = "maj";
        bestThirdEvidence = maj3Ev;
      } else {
        // Tie: prefer diatonic quality expectation for this root
        finalQuality = expectedQuality === "min" ? "min" : "maj";
        bestThirdEvidence = finalQuality === "min" ? min3Ev : maj3Ev;
      }
    }
  }

  // Stage 3: Inversion / Slash Evaluation
  let dominantBassIdx = rootIdx;
  let maxBassEv = bassChroma[rootIdx];
  for (let k = 0; k < 12; k++) {
    if (bassChroma[k] > maxBassEv) {
      maxBassEv = bassChroma[k];
      dominantBassIdx = k;
    }
  }

  const rootBassEv = bassChroma[rootIdx];
  const slashBassRatio = maxBassEv / (rootBassEv + 1e-6);
  let isSlash = false;
  let bassNoteName = rootName;

  // Strict inversion requirements (Step 8):
  // 1. Dominant bass note must be a legitimate chord tone (3rd or 5th)
  // 2. Bass energy must be >= 0.60 and at least 2.0x higher than the root note
  if (dominantBassIdx !== rootIdx) {
    const isMajor3rd = dominantBassIdx === (rootIdx + 4) % 12;
    const isMinor3rd = dominantBassIdx === (rootIdx + 3) % 12;
    const isFifth = dominantBassIdx === (rootIdx + 7) % 12;

    if ((isMajor3rd || isMinor3rd || isFifth) && maxBassEv >= 0.60 && slashBassRatio >= 2.0) {
      isSlash = true;
      bassNoteName = NOTE_NAMES[dominantBassIdx];
    }
  }

  const norm = normalizeChord({
    root: rootName,
    quality: finalQuality,
    bass: isSlash ? bassNoteName : undefined
  }, `${keyProfile.keyNote} ${keyProfile.isMajor ? "Major" : "Minor"}`);

  const totalScore = Math.max(0.05, Math.min(0.99, (rootBaseScore * 0.55) + (bestQualityScore * 0.45)));

  return {
    chord: norm.canonicalLabel,
    root: norm.root,
    bass: norm.bass || norm.root,
    quality: norm.qualitySymbol,
    extensions: norm.extensions,
    score: Number(totalScore.toFixed(3)),
    rootScore: Number(rootBaseScore.toFixed(3)),
    qualityScore: Number(bestQualityScore.toFixed(3)),
    thirdEvidence: Number(bestThirdEvidence.toFixed(3)),
    isSlash,
    bassEvidence: Number(maxBassEv.toFixed(3)),
    diagnostics: {
      rootCandidates: [],
      maj3Evidence: Number(maj3Ev.toFixed(3)),
      min3Evidence: Number(min3Ev.toFixed(3)),
      fifthEvidence: Number(fifthEv.toFixed(3)),
      definingEvidence: Number(bestDefiningEv.toFixed(3)),
      slashBassRatio: Number(slashBassRatio.toFixed(3))
    }
  };
}

/**
 * Full Candidate Ranking for a Given Time Unit
 * Generates the top scored chord candidates for a frame or beat window.
 */
export function rankChordCandidatesForWindow(
  chroma: Float32Array,
  bassChroma: Float32Array,
  keyProfile: DiatonicProfile,
  maxCandidates: number = 3
): ChordCandidate[] {
  const rootCandidates = estimateRootCandidates(chroma, bassChroma, keyProfile, maxCandidates);
  const results: ChordCandidate[] = [];

  for (const rc of rootCandidates) {
    const candidate = evaluateQualityForRoot(rc.rootIdx, chroma, bassChroma, keyProfile, rc.score);
    candidate.diagnostics.rootCandidates = rootCandidates.map(r => ({ note: r.note, score: Number(r.score.toFixed(3)) }));
    results.push(candidate);
  }

  results.sort((a, b) => b.score - a.score);
  const topScore = results[0]?.score ?? 0;
  const runnerUpScore = results[1]?.score ?? 0;
  const margin = Number(Math.max(0, topScore - runnerUpScore).toFixed(3));
  for (const res of results) {
    res.scoreMargin = margin;
    res.diagnostics.scoreMargin = margin;
  }
  return results;
}
