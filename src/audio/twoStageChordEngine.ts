// Two-Stage Musical Chord Decision Engine for JOE-Music
// Stage 1: Root Estimation (Bass fundamental + mid-chroma + fifths acoustic reinforcement + key context)
// Stage 2: Quality & Extension Selection (Third presence, triad vs extension, anti-overfitting)
// Stage 3: Inversion / Slash Chord Evaluation (Genuine inversion vs passing bass note)

import { NOTE_NAMES } from "./chromaExtractor";
import { normalizeChord } from "./chordNormalizer";

export interface ChordCandidate {
  chord: string;              // e.g. "A", "F#m", "C/E", "D", "Bb"
  root: string;               // e.g. "A"
  bass: string;               // e.g. "A" or "E"
  quality: string;            // "maj", "min", "7", "maj7", "min7", "sus2", "sus4", "add9", "5", "dim"
  extensions: string[];
  score: number;              // 0.0 - 1.0
  rootScore: number;
  qualityScore: number;
  thirdEvidence: number;
  thirdMargin?: number;
  thirdConfidence?: number;
  qualityAmbiguous?: boolean;
  isSlash: boolean;
  bassEvidence: number;
  scoreMargin?: number;
  neighborSupport?: number;
  persistenceScore?: number;
  diagnostics: {
    rootCandidates: Array<{ note: string; score: number }>;
    maj3Evidence: number;
    min3Evidence: number;
    maj3Persistence: number;
    min3Persistence: number;
    maj3Peak?: number;
    min3Peak?: number;
    maj3Mean?: number;
    min3Mean?: number;
    maj3Occupancy?: number;
    min3Occupancy?: number;
    thirdMargin: number;
    thirdConfidence: number;
    qualityAmbiguous: boolean;
    fifthEvidence: number;
    definingEvidence: number;
    slashBassRatio: number;
    bassOccupancy?: number;
    bassPersistence?: number;
    bassPeakStrength?: number;
    bassMedianStrength?: number;
    scoreMargin?: number;
    neighborSupport?: number;
    persistenceScore?: number;
  };
}

export interface DiatonicProfile {
  keyNote: string;
  isMajor: boolean;
  keyRootIdx: number;
  diatonicRoots: number[];      // Pitch class indices
  diatonicQualities: string[];  // "maj", "min", "dim"
  harmonicMinorVRoot?: number;  // Pitch class index of scale degree 5 in minor key
}

export function parseDiatonicProfile(keyString: string): DiatonicProfile {
  const parts = keyString.trim().split(" ");
  const keyNote = parts[0] || "C";
  const isMajor = !(parts[1] || "").toLowerCase().includes("min");
  const rootIdx = Math.max(0, NOTE_NAMES.indexOf(keyNote));

  let diatonicRoots: number[] = [];
  let diatonicQualities: string[] = [];
  let harmonicMinorVRoot: number | undefined = undefined;

  if (isMajor) {
    diatonicRoots = [0, 2, 4, 5, 7, 9, 11].map(iv => (rootIdx + iv) % 12);
    diatonicQualities = ["maj", "min", "min", "maj", "maj", "min", "dim"];
  } else {
    diatonicRoots = [0, 2, 3, 5, 7, 8, 10].map(iv => (rootIdx + iv) % 12);
    diatonicQualities = ["min", "dim", "maj", "min", "min", "maj", "maj"];
    harmonicMinorVRoot = (rootIdx + 7) % 12; // Scale degree 5
  }

  return { keyNote, isMajor, keyRootIdx: rootIdx, diatonicRoots, diatonicQualities, harmonicMinorVRoot };
}

/**
 * Stage 1: Root Estimation
 * Evaluates candidate roots using low-mid harmonic fundamental (90-500 Hz), fifth reinforcement,
 * temporal bass persistence (35-265 Hz), and diatonic key context.
 */
export function estimateRootCandidates(
  chroma: Float32Array,
  bassChroma: Float32Array,
  keyProfile: DiatonicProfile,
  maxCandidates: number = 4,
  options: {
    lowMidChroma?: Float32Array;
    midChroma?: Float32Array;
    trebleChroma?: Float32Array;
    fullChroma?: Float32Array;
    frameBassChromas?: Float32Array[];
  } = {}
): Array<{
  rootIdx: number;
  note: string;
  score: number;
  bassEv: number;
  bassOccupancy: number;
  bassPeakStrength?: number;
  bassMedianStrength?: number;
}> {
  const rootScores = new Array(12);
  const lowMidChroma = options.lowMidChroma || chroma;

  for (let r = 0; r < 12; r++) {
    const rawBassEv = bassChroma[r];
    const lowMidRootEv = lowMidChroma[r];
    const fifthEv = lowMidChroma[(r + 7) % 12];

    // Section 4 & 5: Temporal Bass Persistence & Occupancy
    let bassOccupancy = 1.0;
    let effectiveBassEv = rawBassEv;
    let bassPeakStrength = rawBassEv;
    let bassMedianStrength = rawBassEv;

    if (options.frameBassChromas && options.frameBassChromas.length > 0) {
      const frames = options.frameBassChromas.length;
      let activeFrames = 0;
      let peakB = 0;
      const bVals: number[] = [];
      for (const fb of options.frameBassChromas) {
        const val = fb[r];
        if (val >= 0.28) activeFrames++;
        if (val > peakB) peakB = val;
        bVals.push(val);
      }
      bVals.sort((a, b) => a - b);
      bassPeakStrength = peakB;
      bassMedianStrength = bVals[Math.floor(bVals.length / 2)] ?? rawBassEv;
      bassOccupancy = activeFrames / frames;
      
      // Persistence depends on occupancy and median strength
      const persistence = bassOccupancy * bassMedianStrength;
      effectiveBassEv = rawBassEv * Math.pow(bassOccupancy, 0.65);

      if (bassOccupancy < 0.25) {
        effectiveBassEv *= 0.35; // Heavily downweight short transient bass pickups
      } else if (bassOccupancy >= 0.60) {
        effectiveBassEv += 0.08; // Reward sustained bass notes
      }
    }

    const octaveBassEv = (effectiveBassEv > 0.30 && lowMidRootEv > 0.30) ? 0.15 : 0.0;

    // Diatonic bonus
    const diatonicIdx = keyProfile.diatonicRoots.indexOf(r);
    const diatonicBonus = diatonicIdx !== -1 ? 0.08 : 0.0;

    let bassWeight = 0.40;

    const parentMajRoot = (r - 4 + 12) % 12;
    const parentMinRoot = (r - 3 + 12) % 12;
    const parentFifthRoot = (r - 7 + 12) % 12;

    const parentMajHarmonic = lowMidChroma[parentMajRoot] * 0.5 + lowMidChroma[(parentMajRoot + 7) % 12] * 0.5;
    const parentMinHarmonic = lowMidChroma[parentMinRoot] * 0.5 + lowMidChroma[(parentMinRoot + 7) % 12] * 0.5;
    const parentFifthHarmonic = lowMidChroma[parentFifthRoot] * 0.5 + lowMidChroma[(parentFifthRoot + 4) % 12] * 0.5;
    const maxParentHarmonic = Math.max(parentMajHarmonic, parentMinHarmonic, parentFifthHarmonic);

    if (fifthEv < 0.20 && maxParentHarmonic > 0.55 && lowMidRootEv < maxParentHarmonic * 1.1) {
      bassWeight = 0.16;
    }

    // Section 11: Treble Contamination Detection (melodic/vocal lead spikes downweighted)
    const midRootEv = options.midChroma ? options.midChroma[r] : chroma[r];
    const trebleRootEv = options.trebleChroma ? options.trebleChroma[r] : 0;
    const isTrebleContaminated = trebleRootEv > 0.40 &&
                                 lowMidRootEv < 0.28 &&
                                 midRootEv < 0.30 &&
                                 rawBassEv < 0.25 &&
                                 fifthEv < 0.25;

    let score = (effectiveBassEv * bassWeight) +
                (lowMidRootEv * 0.36) +
                (fifthEv * 0.20) +
                octaveBassEv +
                diatonicBonus;

    if (isTrebleContaminated) {
      score *= 0.40; // Downweight treble melody note that lacks low-mid/bass foundation
    }

    // Inversion bass support if bass is playing a legitimate 3rd or 5th
    const bassMaj3 = bassChroma[(r + 4) % 12];
    const bassMin3 = bassChroma[(r + 3) % 12];
    const bass5th = bassChroma[(r + 7) % 12];
    const chordToneBassEv = Math.max(bassMaj3, bassMin3, bass5th);
    if (rawBassEv < 0.25 && chordToneBassEv > 0.40 && lowMidRootEv > 0.40 && fifthEv > 0.30) {
      score += chordToneBassEv * 0.26;
    }

    // Prune roots that lack fifth support AND have transient-only bass
    if (fifthEv < 0.12 && lowMidRootEv < 0.15 && bassOccupancy < 0.25) {
      score *= 0.40;
    }

    rootScores[r] = {
      rootIdx: r,
      note: NOTE_NAMES[r],
      score,
      bassEv: effectiveBassEv,
      bassOccupancy,
      bassPeakStrength,
      bassMedianStrength
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
  rootBaseScore: number,
  options: {
    lowMidChroma?: Float32Array;
    midChroma?: Float32Array;
    trebleChroma?: Float32Array;
    fullChroma?: Float32Array;
    frameBassChromas?: Float32Array[];
    frameMidChromas?: Float32Array[];
  } = {}
): ChordCandidate {
  const rootName = NOTE_NAMES[rootIdx];
  const midChroma = options.midChroma || chroma;
  const lowMidChroma = options.lowMidChroma || chroma;

  let maj3Ev = midChroma[(rootIdx + 4) % 12];
  let min3Ev = midChroma[(rootIdx + 3) % 12];
  const fifthEv = lowMidChroma[(rootIdx + 7) % 12];

  // Section 11: Treble contamination check for thirds
  // If a third has strong treble but is weak in mid and low-mid, downweight it so high vocal sibilance
  // does not flip minor to major or vice-versa.
  if (options.trebleChroma) {
    const trebleMaj = options.trebleChroma[(rootIdx + 4) % 12];
    const trebleMin = options.trebleChroma[(rootIdx + 3) % 12];
    if (trebleMaj > 0.45 && maj3Ev < 0.25 && lowMidChroma[(rootIdx + 4) % 12] < 0.25) {
      maj3Ev *= 0.50;
    }
    if (trebleMin > 0.45 && min3Ev < 0.25 && lowMidChroma[(rootIdx + 3) % 12] < 0.25) {
      min3Ev *= 0.50;
    }
  }

  // Section 6 & 7: Stable-Harmonic Third Analysis & Third Persistence
  let maj3Persistence = maj3Ev;
  let min3Persistence = min3Ev;
  let maj3Peak = maj3Ev;
  let min3Peak = min3Ev;
  let maj3Mean = maj3Ev;
  let min3Mean = min3Ev;
  let maj3Occupancy = 1.0;
  let min3Occupancy = 1.0;

  if (options.frameMidChromas && options.frameMidChromas.length >= 3) {
    const totalF = options.frameMidChromas.length;
    const attackF = Math.max(1, Math.floor(totalF * 0.18)); // Exclude initial attack transient (~0-80ms)
    const stableFrames = options.frameMidChromas.slice(attackF);

    let activeMaj = 0, activeMin = 0;
    let sumMaj = 0, sumMin = 0;
    let peakMaj = 0, peakMin = 0;

    for (const fmc of stableFrames) {
      const vMaj = fmc[(rootIdx + 4) % 12];
      const vMin = fmc[(rootIdx + 3) % 12];

      if (vMaj >= 0.25) activeMaj++;
      if (vMin >= 0.25) activeMin++;

      if (vMaj > peakMaj) peakMaj = vMaj;
      if (vMin > peakMin) peakMin = vMin;

      sumMaj += vMaj;
      sumMin += vMin;
    }

    maj3Occupancy = Number((activeMaj / stableFrames.length).toFixed(3));
    min3Occupancy = Number((activeMin / stableFrames.length).toFixed(3));

    maj3Mean = Number((sumMaj / stableFrames.length).toFixed(3));
    min3Mean = Number((sumMin / stableFrames.length).toFixed(3));

    maj3Peak = Number(peakMaj.toFixed(3));
    min3Peak = Number(peakMin.toFixed(3));

    maj3Persistence = Number((maj3Occupancy * maj3Mean).toFixed(3));
    min3Persistence = Number((min3Occupancy * min3Mean).toFixed(3));
  }

  const thirdMargin = Number(Math.abs(maj3Persistence - min3Persistence).toFixed(3));
  const thirdConfidence = Number(Math.min(1.0, thirdMargin / 0.25).toFixed(3));
  const qualityAmbiguous = thirdMargin < 0.10;

  // Scale degree 5 in minor key
  const isMinorKeyDegree5 = !keyProfile.isMajor && keyProfile.harmonicMinorVRoot === rootIdx;

  // Diatonic expectation for this root
  const diatonicIdx = keyProfile.diatonicRoots.indexOf(rootIdx);
  const expectedQuality = diatonicIdx !== -1 ? keyProfile.diatonicQualities[diatonicIdx] : "maj";

  let bestQualityDef = QUALITY_DEFINITIONS[0]; // default maj
  let bestQualityScore = -Infinity;
  let bestThirdEvidence = maj3Persistence;
  let bestDefiningEv = 0;

  for (const qDef of QUALITY_DEFINITIONS) {
    let toneSum = 0;
    let missingPenalty = 0;
    let definingEv = 0;

    for (const iv of qDef.intervals) {
      const pc = (rootIdx + iv) % 12;
      const ev = (iv === 3 || iv === 4) ? midChroma[pc] : (iv === 7 ? lowMidChroma[pc] : chroma[pc]);
      toneSum += ev;

      if (qDef.definingIntervals.includes(iv)) {
        definingEv = Math.max(definingEv, ev);
      }

      if (ev < 0.20) {
        missingPenalty += (0.20 - ev) * 1.5;
        if (qDef.definingIntervals.includes(iv)) {
          missingPenalty += 0.8;
        }
      }
    }

    const meanToneStrength = toneSum / qDef.intervals.length;

    if (qDef.quality === "sus4" && maj3Ev > 0.28) {
      missingPenalty += maj3Ev * 1.5;
    }
    if (qDef.quality === "sus2" && Math.max(maj3Ev, min3Ev) > 0.28) {
      missingPenalty += Math.max(maj3Ev, min3Ev) * 1.5;
    }
    if (qDef.quality === "5" && Math.max(maj3Ev, min3Ev) > 0.18) {
      missingPenalty += 0.8;
    }

    let diatonicBonus = 0;
    if (qDef.quality === expectedQuality) {
      diatonicBonus = 0.08;
    } else if (isMinorKeyDegree5 && (qDef.quality === "maj" || qDef.quality === "7")) {
      diatonicBonus = 0.08;
    } else if (qDef.quality === expectedQuality + "7") {
      diatonicBonus = 0.04;
    }

    if (["7", "maj7", "min7", "add9"].includes(qDef.quality)) {
      const triadStrength = (chroma[rootIdx] + (qDef.quality.includes("min") ? min3Persistence : maj3Persistence) + fifthEv) / 3;
      if (definingEv < 0.45) {
        missingPenalty += (0.45 - definingEv) * 2.5;
      }
      if (definingEv < triadStrength * 0.65) {
        missingPenalty += 0.35;
      }
    }

    const qScore = meanToneStrength - missingPenalty - qDef.baseComplexity + diatonicBonus;

    if (qScore > bestQualityScore) {
      bestQualityScore = qScore;
      bestQualityDef = qDef;
      bestThirdEvidence = qDef.intervals.includes(3) ? min3Persistence : qDef.intervals.includes(4) ? maj3Persistence : 0;
      bestDefiningEv = definingEv;
    }
  }

  // Major vs Minor decision with Persistent Thirds & Harmonic Minor Support
  let finalQuality = bestQualityDef.quality;
  if (finalQuality === "maj" || finalQuality === "min") {
    const maj3PitchClass = (rootIdx + 4) % 12;
    const min3PitchClass = (rootIdx + 3) % 12;
    let maj3InScale = keyProfile.diatonicRoots.includes(maj3PitchClass);
    let min3InScale = keyProfile.diatonicRoots.includes(min3PitchClass);

    if (isMinorKeyDegree5) {
      maj3InScale = true;
      min3InScale = true;
    }

    if (thirdMargin >= 0.10) {
      finalQuality = maj3Persistence > min3Persistence ? "maj" : "min";
      bestThirdEvidence = Math.max(maj3Persistence, min3Persistence);
    } else if (maj3InScale && !min3InScale) {
      if (min3Persistence > maj3Persistence + 0.08 && min3Persistence >= 0.22) {
        finalQuality = "min";
        bestThirdEvidence = min3Persistence;
      } else {
        finalQuality = "maj";
        bestThirdEvidence = maj3Persistence;
      }
    } else if (min3InScale && !maj3InScale) {
      if (maj3Persistence > min3Persistence + 0.08 && maj3Persistence >= 0.22) {
        finalQuality = "maj";
        bestThirdEvidence = maj3Persistence;
      } else {
        finalQuality = "min";
        bestThirdEvidence = min3Persistence;
      }
    } else {
      if (min3Persistence > maj3Persistence + 0.05 && min3Persistence >= 0.18) {
        finalQuality = "min";
        bestThirdEvidence = min3Persistence;
      } else if (maj3Persistence > min3Persistence + 0.05 && maj3Persistence >= 0.18) {
        finalQuality = "maj";
        bestThirdEvidence = maj3Persistence;
      } else {
        if (isMinorKeyDegree5) {
          finalQuality = maj3Persistence >= min3Persistence - 0.02 ? "maj" : "min";
        } else {
          finalQuality = expectedQuality === "min" ? "min" : "maj";
        }
        bestThirdEvidence = finalQuality === "min" ? min3Persistence : maj3Persistence;
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

  if (dominantBassIdx !== rootIdx) {
    const isMajor3rd = dominantBassIdx === (rootIdx + 4) % 12;
    const isMinor3rd = dominantBassIdx === (rootIdx + 3) % 12;
    const isFifth = dominantBassIdx === (rootIdx + 7) % 12;

    if ((isMajor3rd || isMinor3rd || isFifth) && maxBassEv >= 0.60 && slashBassRatio >= 2.0) {
      isSlash = true;
      bassNoteName = NOTE_NAMES[dominantBassIdx];
    }
  }

  const keyContext = `${keyProfile.keyNote} ${keyProfile.isMajor ? "Major" : "Minor"}`;

  const norm = normalizeChord({
    root: rootName,
    quality: finalQuality,
    bass: isSlash ? bassNoteName : undefined
  }, keyContext);

  let qualityFactor = bestQualityScore;
  if (qualityAmbiguous) {
    qualityFactor *= 0.80; // Cap ambiguous quality confidence
  }

  const totalScore = Math.max(0.05, Math.min(0.99, (rootBaseScore * 0.55) + (qualityFactor * 0.45)));

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
    thirdMargin,
    thirdConfidence,
    qualityAmbiguous,
    isSlash,
    bassEvidence: Number(maxBassEv.toFixed(3)),
    diagnostics: {
      rootCandidates: [],
      maj3Evidence: Number(maj3Ev.toFixed(3)),
      min3Evidence: Number(min3Ev.toFixed(3)),
      maj3Persistence: Number(maj3Persistence.toFixed(3)),
      min3Persistence: Number(min3Persistence.toFixed(3)),
      maj3Peak,
      min3Peak,
      maj3Mean,
      min3Mean,
      maj3Occupancy,
      min3Occupancy,
      thirdMargin,
      thirdConfidence,
      qualityAmbiguous,
      fifthEvidence: Number(fifthEv.toFixed(3)),
      definingEvidence: Number(bestDefiningEv.toFixed(3)),
      slashBassRatio: Number(slashBassRatio.toFixed(3))
    }
  };
}

/**
 * Full Candidate Ranking for a Given Time Unit
 * Generates top scored chord candidates with multi-band, bass persistence, and third persistence options.
 */
export function rankChordCandidatesForWindow(
  chroma: Float32Array,
  bassChroma: Float32Array,
  keyProfile: DiatonicProfile,
  maxCandidates: number = 3,
  options: {
    lowMidChroma?: Float32Array;
    midChroma?: Float32Array;
    trebleChroma?: Float32Array;
    fullChroma?: Float32Array;
    frameBassChromas?: Float32Array[];
    frameMidChromas?: Float32Array[];
  } = {}
): ChordCandidate[] {
  const rootCandidates = estimateRootCandidates(chroma, bassChroma, keyProfile, maxCandidates, options);
  const results: ChordCandidate[] = [];

  for (const rc of rootCandidates) {
    const candidate = evaluateQualityForRoot(rc.rootIdx, chroma, bassChroma, keyProfile, rc.score, options);
    candidate.diagnostics.rootCandidates = rootCandidates.map(r => ({ note: r.note, score: Number(r.score.toFixed(3)) }));
    candidate.diagnostics.bassOccupancy = Number((rc.bassOccupancy ?? 1.0).toFixed(2));
    candidate.diagnostics.bassPersistence = Number((rc.bassEv ?? 1.0).toFixed(2));
    if (rc.bassPeakStrength !== undefined) candidate.diagnostics.bassPeakStrength = Number(rc.bassPeakStrength.toFixed(3));
    if (rc.bassMedianStrength !== undefined) candidate.diagnostics.bassMedianStrength = Number(rc.bassMedianStrength.toFixed(3));
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
