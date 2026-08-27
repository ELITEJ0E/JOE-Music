// Post-MIR Harmonic Stabilization & Musical Segmentation Layer for JOE-Music
// Features: Temporal Chord Hysteresis, Beat-Aware Chord Decision Windows,
// Transient/Passing-Note Filtering, and Musical Boundary Alignment.

import { parseChordLabel, CanonicalQuality } from "./chordNormalizer";
import { CHORD_QUALITIES, getPitchClass } from "../music/chordTheory";
import { ChordSegment } from "../types";

export interface StabilizationDiagnostics {
  rawSegmentCount: number;
  stabilizedSegmentCount: number;
  mergedSegments: number;
  rejectedTransientSlashSegments: number;
  finalProgression: string[];
}

export interface StabilizationResult {
  segments: ChordSegment[];
  diagnostics: StabilizationDiagnostics;
}

export interface StabilizationOptions {
  beats?: number[];
  tempo?: number;
  keyContext?: string;
  duration?: number;
  minSlashDuration?: number;       // Minimum seconds for a genuine slash chord (default: 0.75s)
  minGlitchDuration?: number;      // Maximum seconds for transient glitches (default: 0.45s)
  beatSnapTolerance?: number;      // Seconds within beat to snap boundary (default: 0.20s)
  changeMargin?: number;           // Hysteresis score margin required to switch chords (default: 0.08)
  minChordDurationBeats?: number;  // Minimum beats for new chord persistence (default: 1.0)
}

/**
 * Checks if a note is one of the standard pitch classes of a chord.
 */
function isChordTone(chordRoot: string, chordQuality: string, note: string): boolean {
  if (!chordRoot || !note) return false;
  const rootPc = getPitchClass(chordRoot);
  const notePc = getPitchClass(note);
  if (rootPc === -1 || notePc === -1) return false;

  const qualityClean = chordQuality.toLowerCase();
  const intervals = CHORD_QUALITIES[qualityClean] || CHORD_QUALITIES["maj"] || [0, 4, 7];
  
  for (const iv of intervals) {
    if ((rootPc + iv) % 12 === notePc) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates whether a detected slash chord is a genuine intentional chord inversion
 * or a transient pick/acoustic resonance artifact.
 */
export function evaluateSlashChordStability(
  seg: ChordSegment,
  options: { minSlashDuration: number; beatIntervalSec: number; keyContext?: string }
): { isGenuine: boolean; baseChord: string } {
  const rawBaseChord = seg.chord.split("/")[0].trim();
  const parsed = parseChordLabel(seg.chord, options.keyContext);
  const baseChord = rawBaseChord || (parsed.isValid ? `${parsed.root}${parsed.qualitySymbol}` : seg.chord);

  if (!parsed.isValid || !parsed.bass || parsed.bass === parsed.root) {
    return { isGenuine: true, baseChord };
  }

  const duration = (seg.endTime ?? 0) - (seg.startTime ?? 0);
  const minRequiredDuration = Math.min(options.minSlashDuration, options.beatIntervalSec * 0.95);

  // 1. Duration check: transient bass spikes (< 0.75s or < 1 beat) are almost always pick transients
  if (duration < minRequiredDuration) {
    return { isGenuine: false, baseChord };
  }

  // 2. Chord tone check (e.g. 5th or 3rd in bass):
  // When guitarists strum open E (0-2-2-1-0-0), low string 5 (B) or string 6 (E) fluctuates.
  const isBassChordTone = isChordTone(parsed.root, parsed.quality, parsed.bass);
  
  const diag = seg.diagnostics;
  if (diag) {
    const slashBassRatio = diag.slashBassRatio ?? 1.0;
    const slashBassEvidence = diag.slashBassEvidence ?? 0.0;

    // Strong genuine slash chord requires high bass ratio and solid evidence
    if (slashBassRatio < 1.35 || slashBassEvidence < 0.40) {
      return { isGenuine: false, baseChord };
    }
  } else if (isBassChordTone && duration < 1.25) {
    return { isGenuine: false, baseChord };
  }

  return { isGenuine: true, baseChord };
}

interface BeatWindowCandidate {
  chord: string;
  root: string;
  bass: string;
  quality: string;
  extensions: string[];
  rawChord: string;
  weight: number;
  confidence: number;
  supportFrames: number;
  isSlash: boolean;
  hasGenuineSlash: boolean;
}

/**
 * Post-MIR Harmonic Stabilization & Musical Segmentation Layer.
 * Transforms raw, over-segmented MIR timeline into clean, musically continuous chord progression.
 */
export function stabilizeChordSegments(
  rawSegments: ChordSegment[],
  options: StabilizationOptions = {}
): StabilizationResult {
  if (!rawSegments || rawSegments.length === 0) {
    return {
      segments: [],
      diagnostics: {
        rawSegmentCount: 0,
        stabilizedSegmentCount: 0,
        mergedSegments: 0,
        rejectedTransientSlashSegments: 0,
        finalProgression: []
      }
    };
  }

  const tempo = options.tempo || 120;
  const beatIntervalSec = 60 / tempo;
  const minSlashDuration = options.minSlashDuration ?? Math.max(0.65, beatIntervalSec * 0.9);
  const totalDuration = options.duration || (rawSegments[rawSegments.length - 1].endTime ?? 0);
  const changeMargin = options.changeMargin ?? 0.08;

  let mergedSegmentsCount = 0;
  let rejectedTransientSlashCount = 0;

  let current = rawSegments.map((s, idx) => ({
    ...s,
    id: s.id || `raw-${idx}`,
    rawChord: s.rawChord || s.chord,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3))
  }));

  // Helper to find nearest beat/subdivision
  const beats = options.beats && options.beats.length > 0 ? options.beats : [];
  function getDistanceToSubdivision(timeSec: number): number {
    if (beats.length === 0) return 999;
    let minDiff = Infinity;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (Math.abs(b - timeSec) < minDiff) minDiff = Math.abs(b - timeSec);
      if (i < beats.length - 1) {
        const mid = (b + beats[i+1]) / 2;
        if (Math.abs(mid - timeSec) < minDiff) minDiff = Math.abs(mid - timeSec);
      }
    }
    return minDiff;
  }

  // STEP 1: Transient / Spurious Slash Chord Rejection
  for (let i = 0; i < current.length; i++) {
    const seg = current[i];
    if (seg.chord.includes("/")) {
      const { isGenuine, baseChord } = evaluateSlashChordStability(seg, {
        minSlashDuration,
        beatIntervalSec,
        keyContext: options.keyContext
      });

      if (!isGenuine) {
        seg.chord = baseChord;
        seg.bass = seg.root;
        rejectedTransientSlashCount++;
      }
    }
  }

  // STEP 2: Adaptive Transition Model (Continuous Timeline)
  // Instead of quantizing to beats, we evaluate the musical viability of each segment.
  // We absorb weak, transient, or unmusical micro-chords into their neighbors,
  // preserving strong chord changes regardless of exact beat alignment.

  let hasChanged = true;
  let passCount = 0;

  while (hasChanged && passCount < 15) {
    hasChanged = false;
    passCount++;
    
    let weakestIdx = -1;
    let weakestScore = Infinity;

    for (let i = 0; i < current.length; i++) {
      const seg = current[i];
      const dur = seg.endTime - seg.startTime;
      
      const diag = seg.diagnostics;
      const scoreMargin = diag?.scoreMargin ?? 0.1;
      const thirdEvidence = diag?.thirdEvidence ?? 0.5;
      
      const distToBeat = getDistanceToSubdivision(seg.startTime);
      const isOnBeat = distToBeat <= 0.15;
      
      const isSandwiched = (i > 0 && i < current.length - 1 && current[i-1].chord === current[i+1].chord);
      
      // Calculate viability score (higher is more viable, lower is more likely to be absorbed)
      let viability = dur * 2.0; 
      viability += scoreMargin * 1.5;
      viability += thirdEvidence * 1.0;
      
      if (isOnBeat) viability += 0.5; // Changes on subdivisions are more viable
      if (isSandwiched) viability -= 0.6; // Sandwiched A-B-A often indicates a momentary passing artifact
      if (dur < 0.25) viability -= 1.0; // Very short micro-chords are heavily penalized
      
      // If the segment is long enough (e.g. > 0.75s), it's virtually immune to absorption
      if (dur > 0.75) viability += 10;
      // If it's at least a beat long and on a beat, immune
      if (dur > beatIntervalSec * 0.8 && isOnBeat) viability += 5;

      const VIABILITY_THRESHOLD = 1.0; // Segments below this are considered for absorption

      if (viability < VIABILITY_THRESHOLD && viability < weakestScore) {
        // Exclude the very first/last segments unless they are extremely short (< 0.2s)
        if ((i === 0 || i === current.length - 1) && dur > 0.2) continue;
        
        weakestScore = viability;
        weakestIdx = i;
      }
    }

    if (weakestIdx !== -1) {
      const seg = current[weakestIdx];
      let left = weakestIdx > 0 ? current[weakestIdx - 1] : null;
      let right = weakestIdx < current.length - 1 ? current[weakestIdx + 1] : null;
      
      let mergeIntoLeft = false;
      
      if (left && right) {
        if (left.chord === right.chord) {
           mergeIntoLeft = true;
        } else {
           // Merge into the stronger adjacent chord
           const leftDur = left.endTime - left.startTime;
           const rightDur = right.endTime - right.startTime;
           const leftMargin = left.diagnostics?.scoreMargin ?? 0.1;
           const rightMargin = right.diagnostics?.scoreMargin ?? 0.1;
           
           const leftStrength = leftDur * leftMargin;
           const rightStrength = rightDur * rightMargin;
           
           mergeIntoLeft = leftStrength >= rightStrength;
        }
      } else if (left) {
        mergeIntoLeft = true;
      } else if (right) {
        mergeIntoLeft = false;
      }
      
      if (mergeIntoLeft && left) {
        left.endTime = seg.endTime;
        left.confidence = Math.round((left.confidence + seg.confidence) / 2);
        current.splice(weakestIdx, 1);
      } else if (!mergeIntoLeft && right) {
        right.startTime = seg.startTime;
        right.confidence = Math.round((right.confidence + seg.confidence) / 2);
        current.splice(weakestIdx, 1);
      }
      
      hasChanged = true;
      mergedSegmentsCount++;
    }
  }

  // STEP 3: Same-Root Quality/Extension Fluctuation Merging
  // If adjacent segments share the same root (e.g., F and Fm, G and G5, C and Cmaj7)
  // and one is significantly weaker or shorter than the other, merge them into the stronger one.
  hasChanged = true;
  passCount = 0;
  while (hasChanged && passCount < 10) {
    hasChanged = false;
    passCount++;
    
    for (let i = 0; i < current.length - 1; i++) {
      const seg1 = current[i];
      const seg2 = current[i+1];
      
      const parsed1 = options.keyContext ? { root: seg1.root, qualitySymbol: seg1.quality } : { root: seg1.root, qualitySymbol: seg1.quality }; // simplified
      const sameRoot = seg1.root === seg2.root;
      
      if (sameRoot && seg1.chord !== seg2.chord) {
        const dur1 = seg1.endTime - seg1.startTime;
        const dur2 = seg2.endTime - seg2.startTime;
        const margin1 = seg1.diagnostics?.scoreMargin ?? 0.1;
        const margin2 = seg2.diagnostics?.scoreMargin ?? 0.1;
        
        const strength1 = dur1 * margin1 * (seg1.diagnostics?.thirdEvidence ?? 0.5);
        const strength2 = dur2 * margin2 * (seg2.diagnostics?.thirdEvidence ?? 0.5);
        
        // If one is highly dominant over the other (> 2x strength), or one is very short (< 0.5s)
        if (strength1 > strength2 * 2 || dur2 < 0.6) {
          // Merge 2 into 1
          seg1.endTime = seg2.endTime;
          current.splice(i + 1, 1);
          hasChanged = true;
          mergedSegmentsCount++;
          break; // restart loop
        } else if (strength2 > strength1 * 2 || dur1 < 0.6) {
          // Merge 1 into 2
          seg2.startTime = seg1.startTime;
          current.splice(i, 1);
          hasChanged = true;
          mergedSegmentsCount++;
          break; // restart loop
        }
      }
    }
  }

  // STEP 4: Consecutive Identical Chord Merging
  // If adjacent segments ended up as the same chord (e.g. from early filtering), merge them
  let finalSegments: ChordSegment[] = [];
  for (let i = 0; i < current.length; i++) {
    const seg = current[i];
    if (finalSegments.length > 0) {
      const prev = finalSegments[finalSegments.length - 1];
      if (prev.chord === seg.chord) {
        prev.endTime = seg.endTime;
        prev.confidence = Math.round((prev.confidence + seg.confidence) / 2);
        mergedSegmentsCount++;
        continue;
      }
    }
    finalSegments.push(seg);
  }

  // Final Boundary Placement & Formatting
  if (finalSegments.length > 0) {
    finalSegments[0].startTime = 0;
    if (totalDuration > 0) {
      finalSegments[finalSegments.length - 1].endTime = Number(Math.max(finalSegments[finalSegments.length - 1].startTime + 0.1, totalDuration).toFixed(3));
    }
  }

  for (let i = 0; i < finalSegments.length - 1; i++) {
    finalSegments[i + 1].startTime = finalSegments[i].endTime;
  }

  finalSegments = finalSegments.map((s, idx) => ({
    ...s,
    id: `seg-${idx}`,
    stabilizedChord: s.chord,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3)),
    durationBeats: Number(((s.endTime - s.startTime) / beatIntervalSec).toFixed(1))
  }));

  const finalProgression = finalSegments.map((s) => s.chord);

  return {
    segments: finalSegments,
    diagnostics: {
      rawSegmentCount: rawSegments.length,
      stabilizedSegmentCount: finalSegments.length,
      mergedSegments: mergedSegmentsCount,
      rejectedTransientSlashSegments: rejectedTransientSlashCount,
      finalProgression
    }
  };
}
