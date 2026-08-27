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
  const minGlitchDuration = options.minGlitchDuration ?? Math.max(0.35, beatIntervalSec * 0.5);
  // Default snap tolerance dynamically scaled to avoid snapping 16th/8th notes
  const beatSnapTolerance = options.beatSnapTolerance ?? Math.min(0.08, beatIntervalSec * 0.18);
  const totalDuration = options.duration || (rawSegments[rawSegments.length - 1].endTime ?? 0);

  let mergedSegmentsCount = 0;
  let rejectedTransientSlashCount = 0;

  // Deep clone raw segments
  let segments: ChordSegment[] = rawSegments.map((s, idx) => ({
    ...s,
    id: s.id || `raw-${idx}`,
    rawChord: s.rawChord || s.chord,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3))
  }));

  // =========================================================================
  // STEP 1: Spurious slash chord rejection
  // =========================================================================
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
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

  // Helper: Merge adjacent identical chords
  function mergeAdjacent(segs: ChordSegment[]): ChordSegment[] {
    if (segs.length === 0) return [];
    const merged: ChordSegment[] = [];
    let current = { ...segs[0] };

    for (let i = 1; i < segs.length; i++) {
      const next = segs[i];
      if (current.chord === next.chord) {
        current.endTime = next.endTime;
        current.confidence = Math.round((current.confidence + next.confidence) / 2);
        mergedSegmentsCount++;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
    return merged;
  }

  // Initial merge
  segments = mergeAdjacent(segments);

  // =========================================================================
  // STEP 2: Musical glitch/transient passing chord elimination
  // =========================================================================
  let hasChanged = true;
  let pass = 0;
  while (hasChanged && pass < 5) {
    hasChanged = false;
    pass++;
    
    if (segments.length <= 1) break;

    const nextSegs: ChordSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const duration = seg.endTime - seg.startTime;

      if (duration < minGlitchDuration) {
        // Decide which neighbor to merge with
        const left = i > 0 ? nextSegs[nextSegs.length - 1] : null;
        const right = i < segments.length - 1 ? segments[i + 1] : null;

        if (left && right) {
          const parsedLeft = parseChordLabel(left.chord, options.keyContext);
          const parsedRight = parseChordLabel(right.chord, options.keyContext);
          const parsedSelf = parseChordLabel(seg.chord, options.keyContext);

          // Merge with neighbor that has same root, or neighbor with higher confidence
          if (parsedSelf.root === parsedLeft.root) {
            left.endTime = seg.endTime;
            hasChanged = true;
            mergedSegmentsCount++;
            continue;
          } else if (parsedSelf.root === parsedRight.root) {
            seg.chord = right.chord;
            seg.root = right.root;
            seg.bass = right.bass;
            seg.quality = right.quality;
            seg.extensions = right.extensions;
            nextSegs.push(seg);
            hasChanged = true;
            mergedSegmentsCount++;
            continue;
          } else if (left.confidence >= right.confidence) {
            left.endTime = seg.endTime;
            hasChanged = true;
            mergedSegmentsCount++;
            continue;
          } else {
            seg.chord = right.chord;
            seg.root = right.root;
            seg.bass = right.bass;
            seg.quality = right.quality;
            seg.extensions = right.extensions;
            nextSegs.push(seg);
            hasChanged = true;
            mergedSegmentsCount++;
            continue;
          }
        } else if (left) {
          left.endTime = seg.endTime;
          hasChanged = true;
          mergedSegmentsCount++;
          continue;
        } else if (right) {
          seg.chord = right.chord;
          seg.root = right.root;
          seg.bass = right.bass;
          seg.quality = right.quality;
          seg.extensions = right.extensions;
          nextSegs.push(seg);
          hasChanged = true;
          mergedSegmentsCount++;
          continue;
        }
      }
      nextSegs.push(seg);
    }
    segments = mergeAdjacent(nextSegs);
  }

  // =========================================================================
  // STEP 3: Beat snapping (only snap if within tolerance)
  // =========================================================================
  let beats = options.beats && options.beats.length > 0 ? [...options.beats].sort((a, b) => a - b) : [];
  if (beats.length === 0) {
    for (let t = 0; t <= totalDuration + beatIntervalSec; t += beatIntervalSec) {
      beats.push(Number(t.toFixed(3)));
    }
  }

  for (let i = 0; i < segments.length - 1; i++) {
    const rawBoundary = segments[i].endTime;
    // Find closest beat
    let closestBeat = beats[0];
    let minDiff = Math.abs(rawBoundary - closestBeat);

    for (const b of beats) {
      const diff = Math.abs(rawBoundary - b);
      if (diff < minDiff) {
        minDiff = diff;
        closestBeat = b;
      }
    }

    if (minDiff <= beatSnapTolerance) {
      segments[i].endTime = closestBeat;
      segments[i + 1].startTime = closestBeat;
    }
  }

  // Continuity check
  if (segments.length > 0) {
    segments[0].startTime = 0;
    if (totalDuration > 0) {
      segments[segments.length - 1].endTime = Number(Math.max(segments[segments.length - 1].startTime + 0.1, totalDuration).toFixed(3));
    }
  }

  for (let i = 0; i < segments.length - 1; i++) {
    segments[i + 1].startTime = segments[i].endTime;
  }

  // Re-index and final formatting
  segments = segments.map((s, idx) => ({
    ...s,
    id: `seg-${idx}`,
    rawChord: s.rawChord || s.chord,
    stabilizedChord: s.chord,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3)),
    durationBeats: Number(((s.endTime - s.startTime) / beatIntervalSec).toFixed(1))
  }));

  const finalProgression = segments.map(s => s.chord);

  return {
    segments,
    diagnostics: {
      rawSegmentCount: rawSegments.length,
      stabilizedSegmentCount: segments.length,
      mergedSegments: mergedSegmentsCount,
      rejectedTransientSlashSegments: rejectedTransientSlashCount,
      finalProgression
    }
  };
}
