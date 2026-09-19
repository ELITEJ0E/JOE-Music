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

/**
 * Helper to measure harmonic distance (circle of fifths distance) between two roots.
 * Returns 0 (same) to 6 (tritone).
 */
function getHarmonicDistance(root1: string, root2: string): number {
  if (!root1 || !root2) return 0;
  const circle = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // C G D A E B F# C# G# D# A# F
  const pc1 = getPitchClass(root1);
  const pc2 = getPitchClass(root2);
  if (pc1 === -1 || pc2 === -1) return 0;
  const idx1 = circle.indexOf(pc1);
  const idx2 = circle.indexOf(pc2);
  let dist = Math.abs(idx1 - idx2);
  if (dist > 6) dist = 12 - dist;
  return dist;
}

/**
 * Simplify extensions based on musical priority if confidence is low.
 * Priority: 1. Triads (C, Cm), 2. 7ths (C7, Cmaj7, Cm7), 3. Complex (sus, add9, etc.)
 */
function simplifyChordExtension(seg: ChordSegment, minDurForExtension: number) {
  const diag = seg.diagnostics;
  const dur = seg.endTime - seg.startTime;
  
  // Demote sus/add9 to major/minor triads if they don't persist
  if (["sus2", "sus4", "add9", "6", "m6"].includes(seg.quality)) {
    if (dur < minDurForExtension || (diag && diag.definingEvidence < 0.4)) {
      seg.quality = seg.quality === "m6" ? "min" : "maj";
      seg.chord = `${seg.root}${seg.quality === "maj" ? "" : "m"}`;
    }
  }
  
  // Demote 7ths to triads if they are very short or weak
  if (["7", "maj7", "min7", "m7"].includes(seg.quality)) {
    if (dur < minDurForExtension * 0.7 || (diag && diag.definingEvidence < 0.35)) {
      seg.quality = (seg.quality === "min7" || seg.quality === "m7") ? "min" : "maj";
      seg.chord = `${seg.root}${seg.quality === "maj" ? "" : "m"}`;
    }
  }
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
  const beatIntervalSec = 60 / Math.max(40, tempo);
  const isFastTempo = tempo >= 115;
  
  // 1. Adaptive Minimum Musical Duration:
  // Base duration scales with beat interval (~0.85 beat, min 0.42s).
  // Genuine half-beat (8th note) chords are protected if supported by solid margin and evidence.
  let adaptiveMinDuration = isFastTempo 
    ? Math.max(0.42, beatIntervalSec * 0.85) 
    : Math.max(0.65, beatIntervalSec * 0.95);
  
  const minSlashDuration = options.minSlashDuration ?? Math.max(0.45, beatIntervalSec * 0.90);
  const totalDuration = options.duration || (rawSegments[rawSegments.length - 1].endTime ?? 0);
  const changeMargin = options.changeMargin ?? (isFastTempo ? 0.10 : 0.08);

  let mergedSegmentsCount = 0;
  let rejectedTransientSlashCount = 0;

  let current = rawSegments.map((s, idx) => ({
    ...s,
    id: s.id || `raw-${idx}`,
    rawChord: s.rawChord || s.chord,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3))
  }));

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

  // STEP 2: Separate chord identity from extension
  // Root chord first. Only keep extensions if sustained/confident.
  const minDurForExtension = adaptiveMinDuration * 1.2;
  for (let i = 0; i < current.length; i++) {
    simplifyChordExtension(current[i], minDurForExtension);
  }

  // STEP 3: Same-Root Quality Fluctuation Merging (e.g. G -> Gmaj7 -> G)
  // Merge transient fluctuations into the dominant same-root chord before general absorption
  let hasChanged = true;
  let passCount = 0;
  while (hasChanged && passCount < 10) {
    hasChanged = false;
    passCount++;
    
    for (let i = 0; i < current.length - 1; i++) {
      const seg1 = current[i];
      const seg2 = current[i+1];
      
      if (seg1.root === seg2.root && seg1.chord !== seg2.chord) {
        const dur1 = seg1.endTime - seg1.startTime;
        const dur2 = seg2.endTime - seg2.startTime;
        
        // If one is significantly shorter than the other (flutter), merge into the stronger one
        const minFluctuationDur = adaptiveMinDuration * 1.25;
        if (dur1 < minFluctuationDur || dur2 < minFluctuationDur) {
          const strength1 = dur1 * (seg1.diagnostics?.scoreMargin ?? 0.1);
          const strength2 = dur2 * (seg2.diagnostics?.scoreMargin ?? 0.1);
          
          // Require significant strength advantage to merge
          if (strength1 > strength2 * 1.2 || dur2 < adaptiveMinDuration * 0.75) {
            // Merge 2 into 1
            seg1.endTime = seg2.endTime;
            current.splice(i + 1, 1);
            hasChanged = true;
            mergedSegmentsCount++;
            break;
          } else if (strength2 > strength1 * 1.2 || dur1 < adaptiveMinDuration * 0.75) {
            // Merge 1 into 2
            seg2.startTime = seg1.startTime;
            current.splice(i, 1);
            hasChanged = true;
            mergedSegmentsCount++;
            break;
          }
        }
      }
    }
  }

  // STEP 4: Confidence-based chord switching & Hysteresis (Iterative Absorption)
  hasChanged = true;
  passCount = 0;

  while (hasChanged && passCount < 20) {
    hasChanged = false;
    passCount++;
    
    let weakestIdx = -1;
    let weakestScore = Infinity;

    for (let i = 0; i < current.length; i++) {
      const seg = current[i];
      const dur = seg.endTime - seg.startTime;
      const durationBeats = dur / beatIntervalSec;
      
      const diag = seg.diagnostics;
      const scoreMargin = diag?.scoreMargin ?? 0.1;
      const thirdEvidence = diag?.thirdEvidence ?? 0.5;
      
      const distToBeat = getDistanceToSubdivision(seg.startTime);
      const isOnBeat = distToBeat <= 0.15;
      
      // Base viability from duration, score margin, and third evidence
      let viability = dur * (isFastTempo ? 2.5 : 1.8); 
      viability += scoreMargin * 2.0;
      viability += thirdEvidence * 1.0;
      
      // If duration is at least half a beat and lands on a beat/subdivision with solid evidence, protect it
      if (isOnBeat && dur >= beatIntervalSec * 0.42 && (scoreMargin >= 0.08 || thirdEvidence >= 0.35)) {
        viability += 2.5;
      }

      // Hysteresis: if margin is high, it's very viable
      if (scoreMargin >= changeMargin) {
        viability += (scoreMargin - changeMargin) * 3.0;
      }
      
      // Harmonic context: Sandwiched chords (C -> F# -> C or D -> Em -> A)
      const prev = i > 0 ? current[i-1] : null;
      const next = i < current.length - 1 ? current[i+1] : null;
      
      if (prev && next && prev.chord === next.chord) {
        const isConfirmedFastHarmonic = Boolean(seg.diagnostics?.confirmedByPendingEngine) || (dur >= beatIntervalSec * 0.38 && (scoreMargin >= 0.15 || thirdEvidence >= 0.38));
        if (!isConfirmedFastHarmonic) {
          const harmonicDist = getHarmonicDistance(seg.root, prev.root);
          // If sandwiched and harmonically distant, penalize heavily
          if (harmonicDist >= 2 && dur < adaptiveMinDuration * 1.5) {
            viability -= 2.5;
          } else if (dur <= adaptiveMinDuration * 0.8) {
            viability -= 1.8;
          }
        }
      }
      
      // Penalize short passing transients (< 0.22s or < 0.75 * adaptiveMinDuration without strong margin)
      if (dur < 0.22 && !seg.diagnostics?.confirmedByPendingEngine) {
        viability -= 3.0; // very short passing note
      } else if (dur < adaptiveMinDuration * 0.85 && scoreMargin < 0.15 && !seg.diagnostics?.confirmedByPendingEngine) {
        viability -= 1.5;
      }
      
      // Power chords / extensions resolving to root
      if (prev && prev.root === seg.root && seg.quality === "5") {
        viability -= 1.5; // G5 after G is a flutter
      }
      if (next && next.root === seg.root && seg.quality === "5") {
        viability -= 1.5; // G5 before G is a flutter
      }
      
      // If duration >= adaptiveMinDuration, it's very safe
      if (dur >= adaptiveMinDuration) {
        viability += 3.0;
      }

      if (viability < 2.0 && viability < weakestScore) {
        if ((i === 0 || i === current.length - 1) && dur > 0.2) continue; // Protect edges slightly
        weakestScore = viability;
        weakestIdx = i;
      }
    }

    if (weakestIdx !== -1) {
      const seg = current[weakestIdx];
      let left = weakestIdx > 0 ? current[weakestIdx - 1] : null;
      let right = weakestIdx < current.length - 1 ? current[weakestIdx + 1] : null;
      
      let mergeIntoLeft = false;
      let neighborWins = false;
      
      if (left && right) {
        if (left.chord === seg.chord || left.chord === right.chord) {
          mergeIntoLeft = true;
          neighborWins = true;
        } else if (right.chord === seg.chord) {
          mergeIntoLeft = false;
          neighborWins = true;
        } else {
          // Compare left and right strength (duration * margin)
          const leftStrength = (left.endTime - left.startTime) * (left.diagnostics?.scoreMargin ?? 0.1);
          const rightStrength = (right.endTime - right.startTime) * (right.diagnostics?.scoreMargin ?? 0.1);
          mergeIntoLeft = leftStrength >= rightStrength;
          
          const segStrength = (seg.endTime - seg.startTime) * (seg.diagnostics?.scoreMargin ?? 0.1);
          neighborWins = Math.max(leftStrength, rightStrength) > (segStrength * 1.5); // Hysteresis: neighbor needs to be notably stronger
        }
      } else if (left) {
        mergeIntoLeft = true;
        neighborWins = true;
      } else if (right) {
        mergeIntoLeft = false;
        neighborWins = true;
      }
      
      const isIdenticalSandwich = left && right && left.chord === right.chord;
      if (!neighborWins && !isIdenticalSandwich) {
        // Break out of the loop if the weakest segment is actually stronger than neighbors (rare)
        // or if we have reached a stable state.
        // Wait, if neighbor doesn't win and we are above absolute glitch threshold, keep it.
        const dur = seg.endTime - seg.startTime;
        if (dur >= adaptiveMinDuration * 0.4) break; 
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

  // STEP 5: Consecutive Identical Chord Merging
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

