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
  contextChroma: Float32Array;
  blendedChroma: Float32Array;
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
  highHarmonicResolution?: boolean;
}

/**
 * Builds the musical time grid (Beats or Half-Beats) adaptively based on tempo.
 * For fast songs (>= 115 BPM), includes 8th-note subdivisions to resolve fast harmonic rhythm.
 */
export function buildMusicalGrid(
  beats: number[],
  tempo: number,
  totalDuration: number,
  options: { forceHighResolution?: boolean } = {}
): { units: BeatUnit[]; isFastMode: boolean; isHighResolutionMode: boolean; beatIntervalSec: number } {
  const beatIntervalSec = 60 / Math.max(40, tempo);
  const isHighResolutionMode = options.forceHighResolution ?? (tempo >= 115);

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

  for (let b = 0; b < effectiveBeats.length; b++) {
    const currentBeatTime = effectiveBeats[b];
    const nextBeatTime = (b < effectiveBeats.length - 1)
      ? effectiveBeats[b + 1]
      : Math.min(totalDuration, currentBeatTime + beatIntervalSec);

    const thisBeatDuration = nextBeatTime - currentBeatTime;
    const beatNumberInBar = (b % 4) + 1; // 1, 2, 3, 4
    const isDownbeat = beatNumberInBar === 1;

    if (isHighResolutionMode && thisBeatDuration > 0.28) {
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
        contextChroma: new Float32Array(12),
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
        contextChroma: new Float32Array(12),
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
        contextChroma: new Float32Array(12),
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
 */
export function aggregateChromasForBeatUnits(
  units: BeatUnit[],
  chromagram: Float32Array[],
  bassChromagram: Float32Array[],
  sampleRate: number,
  hopSize: number,
  isFastMode: boolean
): void {
  const numFrames = chromagram.length;
  if (numFrames === 0) return;

  const frameDuration = hopSize / sampleRate;

  // 1. Calculate Local Chroma and Bass Chroma for each unit
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    const startFrame = Math.max(0, Math.min(numFrames - 1, Math.floor(unit.startTime / frameDuration)));
    const endFrame = Math.max(startFrame, Math.min(numFrames - 1, Math.ceil(unit.endTime / frameDuration)));

    const count = endFrame - startFrame + 1;
    for (let f = startFrame; f <= endFrame; f++) {
      for (let k = 0; k < 12; k++) {
        unit.localChroma[k] += chromagram[f][k];
        unit.localBassChroma[k] += bassChromagram[f][k];
      }
    }

    let maxC = 0, maxB = 0;
    for (let k = 0; k < 12; k++) {
      unit.localChroma[k] /= count;
      unit.localBassChroma[k] /= count;
      if (unit.localChroma[k] > maxC) maxC = unit.localChroma[k];
      if (unit.localBassChroma[k] > maxB) maxB = unit.localBassChroma[k];
    }
    if (maxC > 0) {
      for (let k = 0; k < 12; k++) unit.localChroma[k] /= maxC;
    }
    if (maxB > 0) {
      for (let k = 0; k < 12; k++) unit.localBassChroma[k] /= maxB;
    }
  }

  // 2. Multi-Resolution Context: Compute ~2 bar running average around each unit
  // In 4/4 time, 2 bars is ~8 beats (or ~16 units in fast mode)
  const contextWindowUnits = isFastMode ? 8 : 4;

  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    const startU = Math.max(0, u - Math.floor(contextWindowUnits / 2));
    const endU = Math.min(units.length - 1, u + Math.floor(contextWindowUnits / 2));
    const winCount = endU - startU + 1;

    for (let i = startU; i <= endU; i++) {
      for (let k = 0; k < 12; k++) {
        unit.contextChroma[k] += units[i].localChroma[k];
      }
    }
    let maxCtx = 0;
    for (let k = 0; k < 12; k++) {
      unit.contextChroma[k] /= winCount;
      if (unit.contextChroma[k] > maxCtx) maxCtx = unit.contextChroma[k];
    }
    if (maxCtx > 0) {
      for (let k = 0; k < 12; k++) unit.contextChroma[k] /= maxCtx;
    }

    // Blend: 75% local responsiveness + 25% context stability
    const localWeight = isFastMode ? 0.80 : 0.70;
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
  prevPrevChordName?: string
): number {
  if (chordA.chord === chordB.chord) {
    // Self-transition persistence bonus (encourages sustaining a chord across its duration)
    return unitB.isDownbeat ? 0.22 : (isHighResolutionMode ? 0.32 : 0.38);
  }

  // Chord change occurring - soft priors
  let transitionBonus = 0;

  // Metric timing preference: higher penalty for chord changes on subdivisions (off-beats) vs downbeats
  if (unitB.isDownbeat) {
    transitionBonus += 0.10;
  } else if (unitB.beatNumberInBar === 3 && !unitB.isSubdivision) {
    transitionBonus += 0.06;
  } else if (unitB.isSubdivision) {
    transitionBonus -= 0.16; // Stronger penalty for off-beat flutter
  }

  // A-B-A oscillation suppression: penalty if changing back immediately to the previous chord
  if (prevPrevChordName && prevPrevChordName === chordB.chord && chordA.chord !== chordB.chord) {
    transitionBonus -= 0.22;
  }

  // Same-root quality change penalty (e.g., C to Cmaj7 or C to Cadd9):
  // Flickering extensions require stronger emission evidence
  if (chordA.root === chordB.root && chordA.chord !== chordB.chord) {
    transitionBonus -= 0.15;
  }

  const rootAIdx = NOTE_NAMES.indexOf(chordA.root);
  const rootBIdx = NOTE_NAMES.indexOf(chordB.root);
  if (rootAIdx !== -1 && rootBIdx !== -1) {
    const rootDiff = (rootBIdx - rootAIdx + 12) % 12;

    // 1. Circle of Fifths: Up 4th / down 5th (5 or 7 semitones)
    if (rootDiff === 5 || rootDiff === 7) {
      transitionBonus += 0.08;
    }
    // 2. Diatonic step: Up or down a major 2nd (2 or 10 semitones)
    else if (rootDiff === 2 || rootDiff === 10) {
      transitionBonus += 0.06;
    }
    // 3. Relative major/minor (3 or 9 semitones)
    else if (rootDiff === 3 || rootDiff === 9) {
      transitionBonus += 0.06;
    }
    // 4. Semitone jump: soft nudge only (allows chromatic, Neapolitan, and tritone substitutions)
    else if (rootDiff === 1 || rootDiff === 11) {
      transitionBonus -= 0.05;
    }
    // 5. Tritone jump: soft nudge only
    else if (rootDiff === 6) {
      transitionBonus -= 0.08;
    }
  }

  // If both chords are diatonic to the song's global key, gentle bonus
  const diatonicA = keyProfile.diatonicRoots.includes(rootAIdx);
  const diatonicB = keyProfile.diatonicRoots.includes(rootBIdx);
  if (diatonicA && diatonicB) {
    transitionBonus += 0.06;
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
  isHighResolutionMode: boolean
): ChordSegment[] {
  const K = units.length;
  if (K === 0) return [];

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
          prevPrevName
        );

        // Gentle soft prior scaling (0.8x) ensures audio emission evidence dominates
        const totalPathScore = trellisScores[u - 1][p] + (transScore * 0.8) + emissionScore;
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
        diagnostics: currentSeg.candidate.diagnostics
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
      diagnostics: currentSeg.candidate.diagnostics
    });
  }

  return rawSegments;
}

/**
 * Measures the harmonic change density across beats by calculating the chroma flux
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
): { segments: ChordSegment[]; isFastMode: boolean; isHighResolutionMode: boolean; beatUnits: BeatUnit[] } {
  const keyProfile = parseDiatonicProfile(config.estimatedKey);

  // Compute harmonic change density across beats
  const harmonicDensity = estimateHarmonicChangeDensity(
    chromagram,
    config.beats,
    config.sampleRate,
    config.hopSize
  );

  // High Harmonic Resolution is activated based on harmonic change density, not purely BPM
  const shouldEnableHighResolution = config.highHarmonicResolution ?? (
    harmonicDensity >= 0.28 || (config.tempo >= 120 && harmonicDensity >= 0.15)
  );

  // 1. Build adaptive musical time grid (detects tempo and harmonic resolution needs)
  const { units, isHighResolutionMode } = buildMusicalGrid(
    config.beats,
    config.tempo,
    config.totalDuration,
    { forceHighResolution: shouldEnableHighResolution }
  );

  // 2. Multi-resolution chroma aggregation
  aggregateChromasForBeatUnits(
    units,
    chromagram,
    bassChromagram,
    config.sampleRate,
    config.hopSize,
    isHighResolutionMode
  );

  // 3. Two-Stage Chord Candidate generation for each beat unit
  for (const unit of units) {
    unit.candidates = rankChordCandidatesForWindow(
      unit.blendedChroma,
      unit.localBassChroma,
      keyProfile,
      3
    );
  }

  // 4. Sequence Optimization across beat units with soft priors
  const rawSegments = optimizeChordSequence(units, keyProfile, isHighResolutionMode);

  return {
    segments: rawSegments,
    isFastMode: isHighResolutionMode,
    isHighResolutionMode,
    beatUnits: units
  };
}
