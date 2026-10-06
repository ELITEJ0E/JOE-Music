// Beat-Synchronous & Multi-Resolution Harmonic Analyzer for JOE-Music
// Features: Musical beat and subdivision grid alignment, Multi-resolution
// window blending, Adaptive fast-song mode, and Sequence Optimization (Viterbi over beat units).

import { NOTE_NAMES } from "./chromaExtractor";
import {
  parseDiatonicProfile,
  rankChordCandidatesForWindow,
  ChordCandidate,
  DiatonicProfile
} from "./twoStageChordEngine";
import { ChordSegment } from "../types";

export interface HarmonicFeatureSet {
  chromagram: Float32Array[];
  bassChromagram: Float32Array[];
  lowMidChromagram?: Float32Array[];
  midChromagram?: Float32Array[];
  trebleChromagram?: Float32Array[];
  fullChromagram?: Float32Array[];
}

export interface BeatUnit {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  isDownbeat: boolean;
  isSubdivision: boolean;
  beatNumberInBar: number; // 1, 2, 3, 4
  localChroma: Float32Array;
  localBassChroma: Float32Array;
  localLowMidChroma: Float32Array;
  localMidChroma: Float32Array;
  localTrebleChroma: Float32Array;
  localFullChroma: Float32Array;
  contextChroma: Float32Array;
  contextLowMidChroma?: Float32Array;
  contextMidChroma?: Float32Array;
  blendedChroma: Float32Array;
  harmonicChangeScore?: number;
  candidates: ChordCandidate[];
  selectedCandidate?: ChordCandidate;
}

export interface BeatAnalysisConfig {
  sampleRate: number;
  hopSize: number;
  tempo: number;
  beats: number[];
  estimatedKey: string;
  totalDuration: number;
  beatsPerBar?: number;
  downbeatIndices?: number[];
  highHarmonicResolution?: boolean;
  lowMidChromagram?: Float32Array[];
  midChromagram?: Float32Array[];
  trebleChromagram?: Float32Array[];
  fullChromagram?: Float32Array[];
  featureSet?: HarmonicFeatureSet;
}

export interface TransitionDiagnostic {
  timeSec: number;
  previousChord: string;
  candidateChord: string;
  duration: number;
  durationBeats: number;
  candidateScore: number;
  runnerUpScore: number;
  scoreMargin: number;
  rootEvidence: number;
  thirdEvidence: number;
  bassEvidence: number;
  neighborSupport: number;
  transitionCost: number;
  persistenceScore: number;
  commitDecision: "ACCEPTED" | "REJECTED";
  rejectionReason: string;
}

export interface DiagnosticTimelineEntry {
  timeSec: number;
  rawCandidate: string;
  currentChord: string;
  score: number;
  margin: number;
  rootEvidence: number;
  neighborSupport: number;
  pending: "yes" | "no";
  finalChord: string;
}

export function formatDiagnosticTimelineTable(entries: DiagnosticTimelineEntry[]): string {
  const header = "| Time  | Raw Candidate | Current Chord | Score | Margin | Root Evidence | Neighbor Support | Pending | Final |";
  const divider = "|-------|---------------|---------------|-------|--------|---------------|------------------|---------|-------|";
  const rows = entries.map(e =>
    `| ${e.timeSec.toFixed(3).padEnd(5)} | ${e.rawCandidate.padEnd(13)} | ${e.currentChord.padEnd(13)} | ${e.score.toFixed(2).padEnd(5)} | ${e.margin.toFixed(2).padEnd(6)} | ${e.rootEvidence.toFixed(2).padEnd(13)} | ${e.neighborSupport.toFixed(2).padEnd(16)} | ${e.pending.padEnd(7)} | ${e.finalChord.padEnd(5)} |`
  );
  return [header, divider, ...rows].join("\n");
}

export function formatTransitionDiagnostic(d: TransitionDiagnostic): string {
  return `Candidate ${d.candidateChord} at ${d.timeSec.toFixed(3)}s
duration: ${d.duration.toFixed(3)}s
durationBeats: ${d.durationBeats.toFixed(2)}
candidateScore: ${d.candidateScore.toFixed(2)}
runnerUpScore: ${d.runnerUpScore.toFixed(2)}
scoreMargin: ${d.scoreMargin.toFixed(2)}
rootEvidence: ${d.rootEvidence.toFixed(2)}
thirdEvidence: ${d.thirdEvidence.toFixed(2)}
bassEvidence: ${d.bassEvidence.toFixed(2)}
neighborSupport: ${d.neighborSupport.toFixed(2)}
transitionCost: ${d.transitionCost.toFixed(2)}
persistenceScore: ${d.persistenceScore.toFixed(2)}

DECISION:
${d.commitDecision}

REASON:
${d.rejectionReason}`;
}

/**
 * Builds the musical time grid (Beats or Half-Beats) adaptively based on tempo.
 * For fast songs (>= 115 BPM), includes 8th-note subdivisions to resolve fast harmonic rhythm.
 */
export function buildMusicalGrid(
  beats: number[],
  tempo: number,
  totalDuration: number,
  options: { forceHighResolution?: boolean; beatsPerBar?: number; downbeatIndices?: number[] } = {}
): { units: BeatUnit[]; isFastMode: boolean; isHighResolutionMode: boolean; beatIntervalSec: number } {
  const beatIntervalSec = 60 / Math.max(40, tempo);
  // High resolution grid (8th-note subdivisions) enabled ONLY when explicitly forced or when harmonic change density demands it (Section 6)
  const isHighResolutionMode = options.forceHighResolution ?? false;

  let effectiveBeats = [...beats];
  if (effectiveBeats.length === 0) {
    // Generate regular grid if beats array was empty
    let t = 0;
    while (t < totalDuration) {
      effectiveBeats.push(Number(t.toFixed(3)));
      t += beatIntervalSec;
    }
  }

  if (effectiveBeats[0] > 0.3) {
    effectiveBeats.unshift(0);
  } else {
    effectiveBeats[0] = 0;
  }

  const units: BeatUnit[] = [];
  let unitIndex = 0;

  const beatsPerBar = options.beatsPerBar || 4;
  const downbeatSet = options.downbeatIndices && options.downbeatIndices.length > 0
    ? new Set(options.downbeatIndices)
    : null;

  for (let b = 0; b < effectiveBeats.length; b++) {
    const currentBeatTime = effectiveBeats[b];
    const nextBeatTime = (b < effectiveBeats.length - 1)
      ? effectiveBeats[b + 1]
      : Math.min(totalDuration, currentBeatTime + beatIntervalSec);

    const thisBeatDuration = nextBeatTime - currentBeatTime;
    const isDownbeat = downbeatSet ? downbeatSet.has(b) : (b % beatsPerBar === 0);
    const beatNumberInBar = downbeatSet
      ? (b % beatsPerBar) + 1
      : (b % beatsPerBar) + 1;

    if (isHighResolutionMode && thisBeatDuration > 0.22) {
      // Subdivide into candidate half-beat analysis points (8th notes)
      // Note: This provides temporal resolution, but does NOT force a chord change.
      // Identical consecutive units cleanly merge during sequence decoding.
      const halfTime = currentBeatTime + (thisBeatDuration * 0.5);

      units.push({
        index: unitIndex++,
        startTime: Number(currentBeatTime.toFixed(3)),
        endTime: Number(halfTime.toFixed(3)),
        duration: Number((halfTime - currentBeatTime).toFixed(3)),
        isDownbeat,
        isSubdivision: false,
        beatNumberInBar,
        localChroma: new Float32Array(12),
        localBassChroma: new Float32Array(12),
        localLowMidChroma: new Float32Array(12),
        localMidChroma: new Float32Array(12),
        localTrebleChroma: new Float32Array(12),
        localFullChroma: new Float32Array(12),
        contextChroma: new Float32Array(12),
        contextLowMidChroma: new Float32Array(12),
        contextMidChroma: new Float32Array(12),
        blendedChroma: new Float32Array(12),
        candidates: []
      });

      units.push({
        index: unitIndex++,
        startTime: Number(halfTime.toFixed(3)),
        endTime: Number(nextBeatTime.toFixed(3)),
        duration: Number((nextBeatTime - halfTime).toFixed(3)),
        isDownbeat: false,
        isSubdivision: true,
        beatNumberInBar,
        localChroma: new Float32Array(12),
        localBassChroma: new Float32Array(12),
        localLowMidChroma: new Float32Array(12),
        localMidChroma: new Float32Array(12),
        localTrebleChroma: new Float32Array(12),
        localFullChroma: new Float32Array(12),
        contextChroma: new Float32Array(12),
        contextLowMidChroma: new Float32Array(12),
        contextMidChroma: new Float32Array(12),
        blendedChroma: new Float32Array(12),
        candidates: []
      });
    } else {
      units.push({
        index: unitIndex++,
        startTime: Number(currentBeatTime.toFixed(3)),
        endTime: Number(nextBeatTime.toFixed(3)),
        duration: Number(thisBeatDuration.toFixed(3)),
        isDownbeat,
        isSubdivision: false,
        beatNumberInBar,
        localChroma: new Float32Array(12),
        localBassChroma: new Float32Array(12),
        localLowMidChroma: new Float32Array(12),
        localMidChroma: new Float32Array(12),
        localTrebleChroma: new Float32Array(12),
        localFullChroma: new Float32Array(12),
        contextChroma: new Float32Array(12),
        contextLowMidChroma: new Float32Array(12),
        contextMidChroma: new Float32Array(12),
        blendedChroma: new Float32Array(12),
        candidates: []
      });
    }
  }

  if (units.length > 0 && totalDuration > units[units.length - 1].endTime) {
    units[units.length - 1].endTime = Number(totalDuration.toFixed(3));
    units[units.length - 1].duration = Number((units[units.length - 1].endTime - units[units.length - 1].startTime).toFixed(3));
  }

  return { units, isFastMode: isHighResolutionMode, isHighResolutionMode, beatIntervalSec };
}

/**
 * Aggregates frame-level chromagrams into each musical beat unit with multi-resolution context.
 * Aggregates all spectral bands (Low-Mid, Mid, Treble, Full, and Bass).
 */
export function aggregateChromasForBeatUnits(
  units: BeatUnit[],
  chromagram: Float32Array[],
  bassChromagram: Float32Array[],
  sampleRate: number,
  hopSize: number,
  isFastMode: boolean,
  bands?: {
    lowMidChromagram?: Float32Array[];
    midChromagram?: Float32Array[];
    trebleChromagram?: Float32Array[];
    fullChromagram?: Float32Array[];
  }
): void {
  const numFrames = chromagram.length;
  if (numFrames === 0) return;

  const frameDuration = hopSize / sampleRate;
  const lowMidFrames = bands?.lowMidChromagram || chromagram;
  const midFrames = bands?.midChromagram || chromagram;
  const trebleFrames = bands?.trebleChromagram;
  const fullFrames = bands?.fullChromagram || chromagram;

  // 1. Calculate Local Chroma across all bands for each unit
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    const startFrame = Math.max(0, Math.min(numFrames - 1, Math.floor(unit.startTime / frameDuration)));
    const endFrame = Math.max(startFrame, Math.min(numFrames - 1, Math.ceil(unit.endTime / frameDuration)));

    const count = endFrame - startFrame + 1;
    for (let f = startFrame; f <= endFrame; f++) {
      for (let k = 0; k < 12; k++) {
        unit.localChroma[k] += chromagram[f][k];
        unit.localBassChroma[k] += bassChromagram[f][k];
        unit.localLowMidChroma[k] += lowMidFrames[f][k];
        unit.localMidChroma[k] += midFrames[f][k];
        if (trebleFrames && trebleFrames[f]) {
          unit.localTrebleChroma[k] += trebleFrames[f][k];
        }
        unit.localFullChroma[k] += fullFrames[f][k];
      }
    }

    // Normalize each band array per beat unit
    for (const arr of [
      unit.localChroma,
      unit.localBassChroma,
      unit.localLowMidChroma,
      unit.localMidChroma,
      unit.localTrebleChroma,
      unit.localFullChroma
    ]) {
      let maxVal = 0;
      for (let k = 0; k < 12; k++) {
        arr[k] /= count;
        if (arr[k] > maxVal) maxVal = arr[k];
      }
      if (maxVal > 0) {
        for (let k = 0; k < 12; k++) arr[k] /= maxVal;
      }
    }
  }

  // 2. High-Fidelity Local Chroma with Micro-Context Smoothing
  const contextWindowUnits = 2;

  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    const startU = Math.max(0, u - Math.floor(contextWindowUnits / 2));
    const endU = Math.min(units.length - 1, u + Math.floor(contextWindowUnits / 2));
    const winCount = endU - startU + 1;

    if (!unit.contextLowMidChroma) unit.contextLowMidChroma = new Float32Array(12);
    if (!unit.contextMidChroma) unit.contextMidChroma = new Float32Array(12);

    for (let i = startU; i <= endU; i++) {
      for (let k = 0; k < 12; k++) {
        unit.contextChroma[k] += units[i].localChroma[k];
        unit.contextLowMidChroma[k] += units[i].localLowMidChroma[k];
        unit.contextMidChroma[k] += units[i].localMidChroma[k];
      }
    }

    for (const arr of [unit.contextChroma, unit.contextLowMidChroma, unit.contextMidChroma]) {
      let maxCtx = 0;
      for (let k = 0; k < 12; k++) {
        arr[k] /= winCount;
        if (arr[k] > maxCtx) maxCtx = arr[k];
      }
      if (maxCtx > 0) {
        for (let k = 0; k < 12; k++) arr[k] /= maxCtx;
      }
    }

    // For subdivision units (half-beats, ~240ms), blend 80% local + 20% context
    // For beat units (~480ms), blend 90% local + 10% context
    const localWeight = unit.isSubdivision ? 0.80 : 0.90;
    const ctxWeight = 1.0 - localWeight;
    let maxBlended = 0;

    for (let k = 0; k < 12; k++) {
      unit.blendedChroma[k] = (unit.localChroma[k] * localWeight) + (unit.contextChroma[k] * ctxWeight);
      if (unit.blendedChroma[k] > maxBlended) maxBlended = unit.blendedChroma[k];
    }
    if (maxBlended > 0) {
      for (let k = 0; k < 12; k++) unit.blendedChroma[k] /= maxBlended;
    }
  }
}

/**
 * Calculates transition cost between chord A and chord B.
 * Incorporates harmonic priors (Circle of 5ths, relative keys, diatonic motions).
 */
function getHarmonicTransitionScore(
  chordA: ChordCandidate,
  chordB: ChordCandidate,
  keyProfile: DiatonicProfile,
  unitB: BeatUnit,
  isHighResolutionMode: boolean,
  prevPrevChordName?: string,
  unitIdx?: number,
  allUnits?: BeatUnit[]
): number {
  if (chordA.chord === chordB.chord) {
    // Sustaining current chord (balanced persistence without inertia locking)
    let holdBonus = unitB.isDownbeat ? 0.15 : 0.22;
    if (chordB.score >= 0.50) holdBonus += 0.10;
    if (chordB.thirdEvidence >= 0.30) holdBonus += 0.08;
    return holdBonus;
  }

  // Chord change occurring: base commitment barrier in log-probability space
  let transitionBonus = -0.35;

  // 1. Metric timing preference:
  if (unitB.isDownbeat) {
    transitionBonus += 0.25;
  } else if (unitB.beatNumberInBar === 3 && !unitB.isSubdivision) {
    transitionBonus += 0.18;
  } else if (!unitB.isSubdivision) {
    transitionBonus += 0.10;
  } else if (unitB.isSubdivision) {
    // Forward lookahead: does the candidate persist into the subsequent beat unit?
    const nextUnit = (unitIdx !== undefined && allUnits && unitIdx < allUnits.length - 1)
      ? allUnits[unitIdx + 1]
      : null;
    const nextMatch = nextUnit?.candidates.find(c => c.chord === chordB.chord);
    const nextScore = nextMatch ? nextMatch.score : 0;

    if (nextScore >= 0.35) {
      // Anticipated syncopated change that carries forward into the next beat
      transitionBonus += 0.12;
    } else if (nextScore < 0.20) {
      // Isolated half-beat spike (passing melody note, vocal embellishment, or transient)
      const hasExtremeEvidence = (chordB.scoreMargin ?? 0) >= 0.25 && chordB.thirdEvidence >= 0.55;
      if (!hasExtremeEvidence) {
        transitionBonus -= 0.55;
      }
    }
  }

  // 2. A-B-A oscillation suppression:
  if (prevPrevChordName && prevPrevChordName === chordB.chord && chordA.chord !== chordB.chord) {
    transitionBonus -= 0.50;
  }

  // 3. Same-root quality / extension flickers (Phase 6):
  if (chordA.root === chordB.root && chordA.chord !== chordB.chord) {
    if (chordB.quality === "5") {
      transitionBonus -= 0.40; // drop full triad to power chord
    } else if (["maj7", "min7", "7", "add9", "sus2", "sus4"].includes(chordB.quality)) {
      if ((chordB.diagnostics?.definingEvidence ?? 0) < 0.40) {
        transitionBonus -= 0.35;
      } else {
        transitionBonus -= 0.18;
      }
    } else {
      transitionBonus -= 0.22;
    }
  }

  // 4. Candidate Evidence & Margin:
  if (chordB.scoreMargin !== undefined && chordB.scoreMargin > 0) {
    transitionBonus += Math.min(0.30, chordB.scoreMargin * 1.2);
  }
  if ((chordB.scoreMargin ?? 0) < 0.04) {
    transitionBonus -= 0.18;
  }
  if (chordB.thirdEvidence >= 0.40) {
    transitionBonus += 0.14;
  } else if (chordB.thirdEvidence < 0.15 && chordB.quality !== "5") {
    transitionBonus -= 0.25;
  }
  if (chordB.rootScore >= 0.65) {
    transitionBonus += 0.10;
  }
  if ((chordB.neighborSupport ?? 0) >= 0.35) {
    transitionBonus += 0.18;
  }

  // 5. Harmonic Progression Plausibility & Harmonic Minor Soft Priors (Sections 3 & 10):
  const rootAIdx = NOTE_NAMES.indexOf(chordA.root);
  const rootBIdx = NOTE_NAMES.indexOf(chordB.root);
  if (rootAIdx !== -1 && rootBIdx !== -1) {
    const rootDiff = (rootBIdx - rootAIdx + 12) % 12;
    if (rootDiff === 5 || rootDiff === 7) {
      transitionBonus += 0.16; // Circle of Fifths (IV / V)
    } else if (rootDiff === 2 || rootDiff === 10) {
      transitionBonus += 0.12; // Diatonic step
    } else if (rootDiff === 3 || rootDiff === 9) {
      transitionBonus += 0.12; // Relative major / minor
    } else if (rootDiff === 6) {
      transitionBonus -= 0.20; // Tritone jump
    }

    if (!keyProfile.isMajor) {
      const keyRoot = keyProfile.keyRootIdx;
      const tonicIdx = keyRoot;                        // i (e.g. Gm)
      const subdominantIdx = (keyRoot + 5) % 12;        // iv (e.g. Cm)
      const dominantIdx = (keyRoot + 7) % 12;           // V (e.g. D)
      const relativeMajIdx = (keyRoot + 3) % 12;        // III (e.g. Bb)
      const submediantIdx = (keyRoot + 8) % 12;        // VI (e.g. Eb)
      const subtonicIdx = (keyRoot + 10) % 12;         // VII (e.g. F)

      // V -> i resolution (e.g. D -> Gm or D7 -> Gm)
      if (rootAIdx === dominantIdx && rootBIdx === tonicIdx) {
        if (chordA.quality === "maj" || chordA.quality === "7") {
          transitionBonus += 0.28; // Strong support for dominant major -> tonic minor
        } else {
          transitionBonus += 0.18;
        }
      }
      // i -> V or iv -> V transition (e.g. Gm -> D or Cm -> D)
      if ((rootAIdx === tonicIdx || rootAIdx === subdominantIdx) && rootBIdx === dominantIdx) {
        if (chordB.quality === "maj" || chordB.quality === "7") {
          transitionBonus += 0.22;
        } else {
          transitionBonus += 0.14;
        }
      }
      // VII -> III (e.g. F -> Bb)
      if (rootAIdx === subtonicIdx && rootBIdx === relativeMajIdx) {
        transitionBonus += 0.20;
      }
      // VI -> VII (e.g. Eb -> F)
      if (rootAIdx === submediantIdx && rootBIdx === subtonicIdx) {
        transitionBonus += 0.18;
      }
      // i -> VI (e.g. Gm -> Eb)
      if (rootAIdx === tonicIdx && rootBIdx === submediantIdx) {
        transitionBonus += 0.18;
      }
      // i -> VII (e.g. Gm -> F)
      if (rootAIdx === tonicIdx && rootBIdx === subtonicIdx) {
        transitionBonus += 0.18;
      }

      // Non-diatonic quality mismatch suppression (Sections 8 & 9):
      // e.g. Am or C major or Fm in G minor context
      const isDiatonicB = keyProfile.diatonicRoots.includes(rootBIdx);
      if (isDiatonicB) {
        const diatonicPos = keyProfile.diatonicRoots.indexOf(rootBIdx);
        const expectedQ = keyProfile.diatonicQualities[diatonicPos];
        // Scale degree 2 in minor key (e.g. A in Gm): expected dim. Am is non-diatonic.
        if (diatonicPos === 1 && expectedQ === "dim" && (chordB.quality === "min" || chordB.quality === "maj")) {
          if ((chordB.thirdMargin ?? 0) < 0.20 && (chordB.diagnostics?.bassOccupancy ?? 1.0) < 0.50) {
            transitionBonus -= 0.60;
          }
        }
        // Scale degree 4 in minor key (e.g. C in Gm): expected Cm. C major is non-diatonic.
        if (diatonicPos === 3 && expectedQ === "min" && chordB.quality === "maj") {
          if ((chordB.thirdMargin ?? 0) < 0.20) {
            transitionBonus -= 0.55;
          }
        }
        // Scale degree 7 in minor key (e.g. F in Gm): expected F major. Fm is non-diatonic.
        if (diatonicPos === 6 && expectedQ === "maj" && chordB.quality === "min") {
          if ((chordB.thirdMargin ?? 0) < 0.20) {
            transitionBonus -= 0.55;
          }
        }
      } else {
        // Entirely non-diatonic root in minor key (unless dominant V like D or D7)
        const isDominantV = rootBIdx === (keyRoot + 7) % 12 && (chordB.quality === "maj" || chordB.quality === "7");
        if (!isDominantV) {
          if ((chordB.thirdMargin ?? 0) < 0.20 && (chordB.diagnostics?.bassOccupancy ?? 1.0) < 0.50) {
            transitionBonus -= 0.65;
          }
        }
      }
    }
  }

  if (keyProfile.diatonicRoots.includes(rootAIdx) && keyProfile.diatonicRoots.includes(rootBIdx)) {
    transitionBonus += 0.12;
  }

  return transitionBonus;
}

/**
 * Performs Dynamic Programming Sequence Optimization over Beat Units.
 * Selects the optimal globally plausible chord progression across the track.
 */
export function optimizeChordSequence(
  units: BeatUnit[],
  keyProfile: DiatonicProfile,
  isHighResolutionMode: boolean,
  tempo: number = 120
): {
  segments: ChordSegment[];
  diagnostics: TransitionDiagnostic[];
  diagnosticTimeline: DiagnosticTimelineEntry[];
  formattedTimelineTable: string;
} {
  const K = units.length;
  if (K === 0) return { segments: [], diagnostics: [], diagnosticTimeline: [], formattedTimelineTable: "" };

  const beatIntervalSec = 60 / Math.max(40, tempo);

  // Viterbi Trellis: bestScore[unitIdx][candidateIdx], backpointer[unitIdx][candidateIdx]
  const trellisScores: number[][] = [];
  const backpointers: number[][] = [];

  // Unit 0 initialization
  const u0Candidates = units[0].candidates;
  trellisScores[0] = u0Candidates.map(c => Math.log(Math.max(1e-4, c.score)));
  backpointers[0] = u0Candidates.map(() => 0);

  for (let u = 1; u < K; u++) {
    const prevCandidates = units[u - 1].candidates;
    const currCandidates = units[u].candidates;
    const unit = units[u];

    trellisScores[u] = new Array(currCandidates.length);
    backpointers[u] = new Array(currCandidates.length);

    for (let c = 0; c < currCandidates.length; c++) {
      const currCand = currCandidates[c];
      const emissionScore = Math.log(Math.max(1e-4, currCand.score));

      let bestPathScore = -Infinity;
      let bestPrevIdx = 0;

      for (let p = 0; p < prevCandidates.length; p++) {
        const prevCand = prevCandidates[p];
        let prevPrevName: string | undefined = undefined;
        if (u >= 2 && backpointers[u - 1]) {
          const ppIdx = backpointers[u - 1][p];
          if (ppIdx !== undefined && units[u - 2].candidates[ppIdx]) {
            prevPrevName = units[u - 2].candidates[ppIdx].chord;
          }
        }

        const transScore = getHarmonicTransitionScore(
          prevCand,
          currCand,
          keyProfile,
          unit,
          isHighResolutionMode,
          prevPrevName,
          u,
          units
        );

        // Natural log emission + transition prior
        const totalPathScore = trellisScores[u - 1][p] + transScore + emissionScore;
        if (totalPathScore > bestPathScore) {
          bestPathScore = totalPathScore;
          bestPrevIdx = p;
        }
      }

      trellisScores[u][c] = bestPathScore;
      backpointers[u][c] = bestPrevIdx;
    }
  }

  // Backtrack to find optimal sequence
  let bestFinalScore = -Infinity;
  let bestFinalIdx = 0;
  const lastUnitCandidates = units[K - 1].candidates;
  for (let c = 0; c < lastUnitCandidates.length; c++) {
    if (trellisScores[K - 1][c] > bestFinalScore) {
      bestFinalScore = trellisScores[K - 1][c];
      bestFinalIdx = c;
    }
  }

  const optimalIndices = new Int32Array(K);
  optimalIndices[K - 1] = bestFinalIdx;
  for (let u = K - 1; u > 0; u--) {
    optimalIndices[u - 1] = backpointers[u][optimalIndices[u]];
  }

  for (let u = 0; u < K; u++) {
    units[u].selectedCandidate = units[u].candidates[optimalIndices[u]];
  }

  // Pending-Candidate Evidence Confirmation Engine (Section 7)
  const diagnosticsList: TransitionDiagnostic[] = [];
  const timelineEntries: DiagnosticTimelineEntry[] = [];
  const finalChords: string[] = new Array(K);

  let committedChord = units[0].selectedCandidate?.chord || units[0].candidates[0].chord;

  interface PendingCandidateState {
    chord: string;
    startUnit: number;
    startTime: number;
    unitsCount: number;
    accumulatedScore: number;
    peakMargin: number;
    maxThirdEvidence: number;
    maxRootEvidence: number;
    neighborSupport: number;
  }
  let pendingState: PendingCandidateState | null = null;

  for (let u = 0; u < K; u++) {
    const unit = units[u];
    const rawWinner = unit.candidates[0];
    const selected = unit.selectedCandidate || rawWinner;
    const runnerUp = unit.candidates.find(c => c.chord !== rawWinner.chord);
    const margin = Number(Math.max(0, rawWinner.score - (runnerUp ? runnerUp.score : 0)).toFixed(2));
    const rootEv = Number(rawWinner.rootScore.toFixed(2));
    const neighborSup = Number((rawWinner.neighborSupport ?? 0).toFixed(2));
    const thirdEv = Number(rawWinner.thirdEvidence.toFixed(2));

    const targetCandidate = selected;

    if (targetCandidate.chord === committedChord) {
      // Sustains current committed chord.
      // If there was an active pending candidate, it was an isolated transient (e.g. A -> E -> A).
      if (pendingState !== null) {
        const diag: TransitionDiagnostic = {
          timeSec: pendingState.startTime,
          previousChord: committedChord,
          candidateChord: pendingState.chord,
          duration: unit.startTime - pendingState.startTime,
          durationBeats: Number(((unit.startTime - pendingState.startTime) / beatIntervalSec).toFixed(2)),
          candidateScore: Number((pendingState.accumulatedScore / pendingState.unitsCount).toFixed(2)),
          runnerUpScore: 0,
          scoreMargin: pendingState.peakMargin,
          rootEvidence: pendingState.maxRootEvidence,
          thirdEvidence: pendingState.maxThirdEvidence,
          bassEvidence: 0,
          neighborSupport: pendingState.neighborSupport,
          transitionCost: -0.35,
          persistenceScore: 0,
          commitDecision: "REJECTED",
          rejectionReason: "Transient candidate (A-B-A rapid oscillation or isolated melody/bass transient without persistence)"
        };
        diagnosticsList.push(diag);
        if (process.env.DEBUG_CHORD_DIAGNOSTICS === "true") {
          console.log(`[CHORD DIAGNOSTIC]\n${formatTransitionDiagnostic(diag)}\n`);
        }
        pendingState = null;
      }

      finalChords[u] = committedChord;
      timelineEntries.push({
        timeSec: unit.startTime,
        rawCandidate: rawWinner.chord,
        currentChord: committedChord,
        score: rawWinner.score,
        margin,
        rootEvidence: rootEv,
        neighborSupport: neighborSup,
        pending: "no",
        finalChord: committedChord
      });
    } else {
      // New candidate appears (e.g. currentChord = A, candidate = E)
      const nextUnit = u < K - 1 ? units[u + 1] : null;
      const nextSupports = nextUnit?.candidates.some(c => c.chord === targetCandidate.chord && c.score >= 0.40);
      const isDownbeatOrBeat = !unit.isSubdivision;
      const hScore = unit.harmonicChangeScore ?? 0.50;

      // Check immediate confirmation: overwhelming evidence + forward/metric confirmation
      const isOverwhelminglyStrong = targetCandidate.score >= 0.85 &&
                                     margin >= 0.16 &&
                                     thirdEv >= 0.40 &&
                                     (nextSupports || (targetCandidate.score >= 0.90 && rootEv >= 0.88 && hScore >= 0.55));

      if (isOverwhelminglyStrong && pendingState === null) {
        const prev = committedChord;
        committedChord = targetCandidate.chord;
        finalChords[u] = committedChord;

        const diag: TransitionDiagnostic = {
          timeSec: unit.startTime,
          previousChord: prev,
          candidateChord: committedChord,
          duration: unit.duration,
          durationBeats: Number((unit.duration / beatIntervalSec).toFixed(2)),
          candidateScore: targetCandidate.score,
          runnerUpScore: runnerUp ? runnerUp.score : 0,
          scoreMargin: margin,
          rootEvidence: rootEv,
          thirdEvidence: thirdEv,
          bassEvidence: targetCandidate.bassEvidence,
          neighborSupport: neighborSup,
          transitionCost: 0,
          persistenceScore: targetCandidate.persistenceScore ?? 0,
          commitDecision: "ACCEPTED",
          rejectionReason: "None (Genuine harmonic change confirmed by score and musical continuity)"
        };
        diagnosticsList.push(diag);
        if (process.env.DEBUG_CHORD_DIAGNOSTICS === "true") {
          console.log(`[CHORD DIAGNOSTIC]\n${formatTransitionDiagnostic(diag)}\n`);
        }

        timelineEntries.push({
          timeSec: unit.startTime,
          rawCandidate: rawWinner.chord,
          currentChord: committedChord,
          score: rawWinner.score,
          margin,
          rootEvidence: rootEv,
          neighborSupport: neighborSup,
          pending: "no",
          finalChord: committedChord
        });
      } else {
        // Enters or accumulates PENDING candidate
        if (pendingState === null || pendingState.chord !== targetCandidate.chord) {
          if (pendingState !== null && pendingState.chord !== committedChord && targetCandidate.chord !== committedChord) {
            // Forward harmonic movement to a third distinct chord (A -> B -> C)
            // If B had strong evidence, commit B before entering pending state for C
            const prevAvg = pendingState.accumulatedScore / pendingState.unitsCount;
            if (prevAvg >= 0.70 && (pendingState.peakMargin >= 0.10 || pendingState.maxThirdEvidence >= 0.25)) {
              const bChord = pendingState.chord;
              for (let k = pendingState.startUnit; k < u; k++) {
                finalChords[k] = bChord;
                if (timelineEntries[k]) {
                  timelineEntries[k].finalChord = bChord;
                  timelineEntries[k].pending = "no";
                }
              }
              committedChord = bChord;
            }
          }

          pendingState = {
            chord: targetCandidate.chord,
            startUnit: u,
            startTime: unit.startTime,
            unitsCount: 1,
            accumulatedScore: targetCandidate.score,
            peakMargin: margin,
            maxThirdEvidence: thirdEv,
            maxRootEvidence: rootEv,
            neighborSupport: neighborSup
          };

          // While pending, output maintains committed chord
          finalChords[u] = committedChord;
          timelineEntries.push({
            timeSec: unit.startTime,
            rawCandidate: rawWinner.chord,
            currentChord: committedChord,
            score: rawWinner.score,
            margin,
            rootEvidence: rootEv,
            neighborSupport: neighborSup,
            pending: "yes",
            finalChord: committedChord
          });
        } else {
          // Pending candidate persists into another temporal unit
          pendingState.unitsCount++;
          pendingState.accumulatedScore += targetCandidate.score;
          pendingState.peakMargin = Math.max(pendingState.peakMargin, margin);
          pendingState.maxThirdEvidence = Math.max(pendingState.maxThirdEvidence, thirdEv);
          pendingState.maxRootEvidence = Math.max(pendingState.maxRootEvidence, rootEv);
          pendingState.neighborSupport = Math.max(pendingState.neighborSupport, neighborSup);

          const avgScore = pendingState.accumulatedScore / pendingState.unitsCount;
          // Must persist for at least 2 units (~1-2 beats), OR have forward match and high evidence
          const isConfirmed = (pendingState.unitsCount >= 2 && avgScore >= 0.55 && (pendingState.peakMargin >= 0.08 || pendingState.maxThirdEvidence >= 0.35)) ||
                              (pendingState.unitsCount >= 1 && nextSupports && avgScore >= 0.82 && pendingState.peakMargin >= 0.12 && pendingState.maxThirdEvidence >= 0.40);

          if (isConfirmed) {
            const prev = committedChord;
            committedChord = pendingState.chord;

            // Retroactively commit final chords from startUnit to u
            for (let k = pendingState.startUnit; k <= u; k++) {
              finalChords[k] = committedChord;
              if (timelineEntries[k]) {
                timelineEntries[k].finalChord = committedChord;
                timelineEntries[k].pending = "no";
              }
            }

            const diag: TransitionDiagnostic = {
              timeSec: pendingState.startTime,
              previousChord: prev,
              candidateChord: committedChord,
              duration: unit.endTime - pendingState.startTime,
              durationBeats: Number(((unit.endTime - pendingState.startTime) / beatIntervalSec).toFixed(2)),
              candidateScore: Number(avgScore.toFixed(2)),
              runnerUpScore: runnerUp ? runnerUp.score : 0,
              scoreMargin: pendingState.peakMargin,
              rootEvidence: pendingState.maxRootEvidence,
              thirdEvidence: pendingState.maxThirdEvidence,
              bassEvidence: targetCandidate.bassEvidence,
              neighborSupport: pendingState.neighborSupport,
              transitionCost: 0,
              persistenceScore: targetCandidate.persistenceScore ?? 0,
              commitDecision: "ACCEPTED",
              rejectionReason: "None (Genuine harmonic change confirmed by evidence accumulation)"
            };
            diagnosticsList.push(diag);
            if (process.env.DEBUG_CHORD_DIAGNOSTICS === "true") {
              console.log(`[CHORD DIAGNOSTIC]\n${formatTransitionDiagnostic(diag)}\n`);
            }
            pendingState = null;

            timelineEntries.push({
              timeSec: unit.startTime,
              rawCandidate: rawWinner.chord,
              currentChord: committedChord,
              score: rawWinner.score,
              margin,
              rootEvidence: rootEv,
              neighborSupport: neighborSup,
              pending: "no",
              finalChord: committedChord
            });
          } else {
            finalChords[u] = committedChord;
            timelineEntries.push({
              timeSec: unit.startTime,
              rawCandidate: rawWinner.chord,
              currentChord: committedChord,
              score: rawWinner.score,
              margin,
              rootEvidence: rootEv,
              neighborSupport: neighborSup,
              pending: "yes",
              finalChord: committedChord
            });
          }
        }
      }
    }
  }

  // Flush any valid pending chord that extends to the end of the sequence
  if (pendingState !== null && (pendingState as any).chord !== committedChord) {
    const avgScore = (pendingState as any).accumulatedScore / (pendingState as any).unitsCount;
    if (avgScore >= 0.65 && ((pendingState as any).peakMargin >= 0.08 || (pendingState as any).maxThirdEvidence >= 0.25)) {
      const finalPending = (pendingState as any).chord;
      for (let k = (pendingState as any).startUnit; k < K; k++) {
        finalChords[k] = finalPending;
        if (timelineEntries[k]) {
          timelineEntries[k].finalChord = finalPending;
          timelineEntries[k].pending = "no";
        }
      }
    }
  }

  // Update units selectedCandidate with confirmed finalChords
  for (let u = 0; u < K; u++) {
    const chordName = finalChords[u];
    const cand = units[u].candidates.find(c => c.chord === chordName) || {
      ...units[u].selectedCandidate!,
      chord: chordName
    };
    units[u].selectedCandidate = cand;
  }

  const formattedTimelineTable = formatDiagnosticTimelineTable(timelineEntries);

  // Merge consecutive identical beat units into unified ChordSegments
  const rawSegments: ChordSegment[] = [];
  let currentSeg: {
    candidate: ChordCandidate;
    startUnit: number;
    endUnit: number;
    confidences: number[];
  } | null = null;

  for (let u = 0; u < K; u++) {
    const sel = units[u].selectedCandidate;
    if (!sel) continue;

    if (!currentSeg) {
      currentSeg = {
        candidate: sel,
        startUnit: u,
        endUnit: u,
        confidences: [sel.score]
      };
    } else if (currentSeg.candidate.chord === sel.chord) {
      currentSeg.endUnit = u;
      currentSeg.confidences.push(sel.score);
    } else {
      // Save completed segment
      const segStartTime = units[currentSeg.startUnit].startTime;
      const segEndTime = units[currentSeg.endUnit].endTime;
      const avgScore = currentSeg.confidences.reduce((a, b) => a + b, 0) / currentSeg.confidences.length;

      rawSegments.push({
        id: `bseg-${rawSegments.length}`,
        chord: currentSeg.candidate.chord,
        root: currentSeg.candidate.root,
        bass: currentSeg.candidate.bass,
        quality: currentSeg.candidate.quality,
        extensions: currentSeg.candidate.extensions,
        startTime: segStartTime,
        endTime: segEndTime,
        confidence: Math.round(avgScore * 100),
        stability: Math.round(avgScore * 90 + 10),
        diagnostics: {
          ...currentSeg.candidate.diagnostics,
          confirmedByPendingEngine: true
        }
      });

      currentSeg = {
        candidate: sel,
        startUnit: u,
        endUnit: u,
        confidences: [sel.score]
      };
    }
  }

  if (currentSeg) {
    const segStartTime = units[currentSeg.startUnit].startTime;
    const segEndTime = units[currentSeg.endUnit].endTime;
    const avgScore = currentSeg.confidences.reduce((a, b) => a + b, 0) / currentSeg.confidences.length;

    rawSegments.push({
      id: `bseg-${rawSegments.length}`,
      chord: currentSeg.candidate.chord,
      root: currentSeg.candidate.root,
      bass: currentSeg.candidate.bass,
      quality: currentSeg.candidate.quality,
      extensions: currentSeg.candidate.extensions,
      startTime: segStartTime,
      endTime: segEndTime,
      confidence: Math.round(avgScore * 100),
      stability: Math.round(avgScore * 90 + 10),
      diagnostics: {
        ...currentSeg.candidate.diagnostics,
        confirmedByPendingEngine: true
      }
    });
  }

  return {
    segments: rawSegments,
    diagnostics: diagnosticsList,
    diagnosticTimeline: timelineEntries,
    formattedTimelineTable
  };
}

/**
 * Computes a weighted harmonic change score between consecutive musical beat units (Section 4).
 * Combines root change persistence, third/quality change, persistent bass change,
 * low-mid chroma distance, mid-band distance, and sequence lookahead agreement.
 */
export function computeHarmonicChangeScore(
  prevUnit: BeatUnit,
  currUnit: BeatUnit,
  nextUnit?: BeatUnit
): {
  score: number;
  rootChange: boolean;
  thirdChange: boolean;
  bassChange: boolean;
  lowMidDist: number;
  midDist: number;
  sequenceAgreement: boolean;
} {
  // 1. Cosine distance in low-mid band (90 - 500 Hz)
  let dotLM = 0, nLM1 = 0, nLM2 = 0;
  for (let k = 0; k < 12; k++) {
    dotLM += prevUnit.localLowMidChroma[k] * currUnit.localLowMidChroma[k];
    nLM1 += prevUnit.localLowMidChroma[k] ** 2;
    nLM2 += currUnit.localLowMidChroma[k] ** 2;
  }
  const lowMidDist = 1 - (dotLM / (Math.sqrt(nLM1) * Math.sqrt(nLM2) + 1e-6));

  // 2. Cosine distance in mid band (180 - 1100 Hz)
  let dotM = 0, nM1 = 0, nM2 = 0;
  for (let k = 0; k < 12; k++) {
    dotM += prevUnit.localMidChroma[k] * currUnit.localMidChroma[k];
    nM1 += prevUnit.localMidChroma[k] ** 2;
    nM2 += currUnit.localMidChroma[k] ** 2;
  }
  const midDist = 1 - (dotM / (Math.sqrt(nM1) * Math.sqrt(nM2) + 1e-6));

  const prevCand = prevUnit.candidates[0];
  const currCand = currUnit.candidates[0];
  const nextCand = nextUnit?.candidates[0];

  const rootChange = prevCand && currCand && prevCand.root !== currCand.root;
  const thirdChange = prevCand && currCand && prevCand.quality !== currCand.quality;
  const bassChange = prevCand && currCand && Math.abs(prevCand.bassEvidence - currCand.bassEvidence) > 0.20;

  let rootChangeScore = 0;
  if (rootChange) {
    if (nextCand && nextCand.root === currCand.root) {
      rootChangeScore = 1.0; // Persistent root change into next beat
    } else if (nextCand && nextCand.root === prevCand.root) {
      rootChangeScore = 0.20; // Isolated transient root bounce (A-B-A)
    } else {
      rootChangeScore = 0.60;
    }
  }

  let thirdChangeScore = 0;
  if (thirdChange) {
    if (nextCand && nextCand.quality === currCand.quality) {
      thirdChangeScore = 1.0;
    } else {
      thirdChangeScore = 0.40;
    }
  }

  const sequenceAgreement = Boolean(nextCand && nextCand.chord === currCand.chord);

  const score =
    (0.25 * rootChangeScore) +
    (0.20 * thirdChangeScore) +
    (0.15 * (bassChange ? 1.0 : 0.0)) +
    (0.20 * Math.min(1.0, lowMidDist * 2.5)) +
    (0.10 * Math.min(1.0, midDist * 2.5)) +
    (0.10 * (sequenceAgreement ? 1.0 : 0.0));

  return {
    score: Number(score.toFixed(3)),
    rootChange: Boolean(rootChange),
    thirdChange: Boolean(thirdChange),
    bassChange: Boolean(bassChange),
    lowMidDist: Number(lowMidDist.toFixed(3)),
    midDist: Number(midDist.toFixed(3)),
    sequenceAgreement
  };
}

/**
 * Estimates true musical harmonic rhythm (rate of genuine chord changes) separately from tempo.
 */
export function estimateHarmonicRhythm(
  units: BeatUnit[],
  tempo: number
): {
  harmonicDensity: number;
  changesPerBar: number;
  isFastHarmonicRhythm: boolean;
  changeScores: number[];
} {
  if (units.length < 2) {
    return { harmonicDensity: 0.1, changesPerBar: 0.5, isFastHarmonicRhythm: false, changeScores: [] };
  }

  let significantChanges = 0;
  const changeScores: number[] = [];

  for (let u = 1; u < units.length; u++) {
    const prev = units[u - 1];
    const curr = units[u];
    const next = u < units.length - 1 ? units[u + 1] : undefined;
    const change = computeHarmonicChangeScore(prev, curr, next);
    curr.harmonicChangeScore = change.score;
    changeScores.push(change.score);

    if (change.score >= 0.42) {
      significantChanges++;
    }
  }

  const harmonicDensity = significantChanges / Math.max(1, units.length - 1);
  const changesPerBar = (significantChanges / Math.max(1, units.length)) * 4;
  const isFastHarmonicRhythm = changesPerBar >= 2.6 && harmonicDensity >= 0.45;

  return {
    harmonicDensity: Number(harmonicDensity.toFixed(3)),
    changesPerBar: Number(changesPerBar.toFixed(2)),
    isFastHarmonicRhythm,
    changeScores
  };
}

/**
 * Legacy wrapper: measures the harmonic change density across beats by calculating the chroma flux
 * between consecutive beat centers.
 */
export function estimateHarmonicChangeDensity(
  chromagram: Float32Array[],
  beats: number[],
  sampleRate: number,
  hopSize: number
): number {
  if (beats.length < 2 || chromagram.length === 0) return 0.2;
  const frameDuration = hopSize / sampleRate;
  let significantShifts = 0;
  let evaluatedBeats = 0;

  for (let b = 1; b < beats.length; b++) {
    const fPrev = Math.min(chromagram.length - 1, Math.max(0, Math.floor(beats[b - 1] / frameDuration)));
    const fCurr = Math.min(chromagram.length - 1, Math.max(0, Math.floor(beats[b] / frameDuration)));

    const c1 = chromagram[fPrev];
    const c2 = chromagram[fCurr];

    let dot = 0, norm1 = 0, norm2 = 0;
    for (let k = 0; k < 12; k++) {
      dot += c1[k] * c2[k];
      norm1 += c1[k] * c1[k];
      norm2 += c2[k] * c2[k];
    }
    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    const cosineSim = denom > 1e-6 ? dot / denom : 1;
    const cosineDist = 1 - cosineSim;

    if (cosineDist > 0.22) {
      significantShifts++;
    }
    evaluatedBeats++;
  }

  return evaluatedBeats > 0 ? (significantShifts / evaluatedBeats) : 0.2;
}

/**
 * Complete Beat-Synchronous Harmonic Analysis Pipeline
 */
export function analyzeBeatSynchronousHarmonics(
  chromagram: Float32Array[],
  bassChromagram: Float32Array[],
  config: BeatAnalysisConfig
): {
  segments: ChordSegment[];
  isFastMode: boolean;
  isHighResolutionMode: boolean;
  isFastHarmonicRhythm: boolean;
  harmonicRhythm: {
    harmonicDensity: number;
    changesPerBar: number;
    isFastHarmonicRhythm: boolean;
    changeScores: number[];
  };
  beatUnits: BeatUnit[];
  transitionDiagnostics: TransitionDiagnostic[];
  diagnosticTimeline: DiagnosticTimelineEntry[];
  formattedTimelineTable: string;
} {
  const keyProfile = parseDiatonicProfile(config.estimatedKey);

  // Section 6: Multi-Band Spectral Features extraction
  const lowMidChromagram = config.lowMidChromagram || config.featureSet?.lowMidChromagram || chromagram;
  const midChromagram = config.midChromagram || config.featureSet?.midChromagram || chromagram;
  const trebleChromagram = config.trebleChromagram || config.featureSet?.trebleChromagram;
  const fullChromagram = config.fullChromagram || config.featureSet?.fullChromagram || chromagram;

  const initialHighRes = config.highHarmonicResolution ?? false;

  // 1. Build adaptive musical time grid
  let { units, isHighResolutionMode } = buildMusicalGrid(
    config.beats,
    config.tempo,
    config.totalDuration,
    { forceHighResolution: initialHighRes }
  );

  // 2. Multi-resolution multi-band chroma aggregation
  aggregateChromasForBeatUnits(
    units,
    chromagram,
    bassChromagram,
    config.sampleRate,
    config.hopSize,
    isHighResolutionMode,
    {
      lowMidChromagram,
      midChromagram,
      trebleChromagram,
      fullChromagram
    }
  );

  // 3. Two-Stage Chord Candidate generation for each beat unit using real multi-band frames
  const frameDuration = config.hopSize / config.sampleRate;
  function rankCandidates(targetUnits: BeatUnit[]) {
    for (const unit of targetUnits) {
      const startF = Math.max(0, Math.floor(unit.startTime / frameDuration));
      const endF = Math.max(startF, Math.min(chromagram.length - 1, Math.ceil(unit.endTime / frameDuration)));
      const unitBassFrames = bassChromagram.slice(startF, endF + 1);
      const unitMidFrames = midChromagram.slice(startF, endF + 1);

      unit.candidates = rankChordCandidatesForWindow(
        unit.blendedChroma,
        unit.localBassChroma,
        keyProfile,
        4,
        {
          lowMidChroma: unit.localLowMidChroma,
          midChroma: unit.localMidChroma,
          trebleChroma: unit.localTrebleChroma,
          fullChroma: unit.localFullChroma,
          frameBassChromas: unitBassFrames,
          frameMidChromas: unitMidFrames
        }
      );
    }
  }

  rankCandidates(units);

  // 4. Harmonic Rhythm & Change Scoring (Sections 3 & 4)
  const rhythmEst = estimateHarmonicRhythm(units, config.tempo);

  // If high resolution was not explicitly forced, evaluate if actual harmonic rhythm requires it (Section 5)
  if (config.highHarmonicResolution === undefined && rhythmEst.isFastHarmonicRhythm && !isHighResolutionMode) {
    const highGrid = buildMusicalGrid(
      config.beats,
      config.tempo,
      config.totalDuration,
      { forceHighResolution: true }
    );
    units = highGrid.units;
    isHighResolutionMode = highGrid.isHighResolutionMode;

    aggregateChromasForBeatUnits(
      units,
      chromagram,
      bassChromagram,
      config.sampleRate,
      config.hopSize,
      isHighResolutionMode,
      {
        lowMidChromagram,
        midChromagram,
        trebleChromagram,
        fullChromagram
      }
    );
    rankCandidates(units);
    estimateHarmonicRhythm(units, config.tempo);
  }

  // 5. Temporal Evidence Accumulation & Persistence Across Neighbor Units (Phases 3 & 4)
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    const prevUnit = u > 0 ? units[u - 1] : null;
    const nextUnit = u < units.length - 1 ? units[u + 1] : null;

    for (const cand of unit.candidates) {
      // Runner-up margin specific to this candidate
      const runnerUp = unit.candidates.find(c => c.chord !== cand.chord);
      const runnerUpScore = runnerUp ? runnerUp.score : 0;
      cand.scoreMargin = Number(Math.max(0, cand.score - runnerUpScore).toFixed(3));

      // Neighbor support
      const prevMatch = prevUnit?.candidates.find(c => c.chord === cand.chord);
      const prevScore = prevMatch ? prevMatch.score : 0;

      const nextMatch = nextUnit?.candidates.find(c => c.chord === cand.chord);
      const nextScore = nextMatch ? nextMatch.score : 0;

      const neighborSupport = Number(Math.max(prevScore, nextScore).toFixed(3));
      cand.neighborSupport = neighborSupport;

      // Persistence Score: weighted combination of emission score, third evidence, margin, and neighbor support
      const persistence = (cand.score * 0.40) +
        (cand.thirdEvidence * 0.20) +
        (neighborSupport * 0.25) +
        (cand.scoreMargin * 0.15);
      cand.persistenceScore = Number(persistence.toFixed(3));
      cand.diagnostics.neighborSupport = neighborSupport;
      cand.diagnostics.persistenceScore = cand.persistenceScore;
      cand.diagnostics.scoreMargin = cand.scoreMargin;
    }
  }

  // 6. Sequence Optimization across beat units with soft priors & diagnostics
  const {
    segments: rawSegments,
    diagnostics: transitionDiagnostics,
    diagnosticTimeline,
    formattedTimelineTable
  } = optimizeChordSequence(
    units,
    keyProfile,
    isHighResolutionMode,
    config.tempo
  );

  return {
    segments: rawSegments,
    isFastMode: isHighResolutionMode,
    isHighResolutionMode,
    isFastHarmonicRhythm: rhythmEst.isFastHarmonicRhythm,
    harmonicRhythm: rhythmEst,
    beatUnits: units,
    transitionDiagnostics,
    diagnosticTimeline,
    formattedTimelineTable
  };
}
