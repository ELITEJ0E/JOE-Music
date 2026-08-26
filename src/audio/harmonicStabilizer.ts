// Post-MIR Harmonic Stabilization & Musical Segmentation Layer for JOE-Music
// Filters transient string/bass fluctuations, removes acoustic over-segmentation,
// and enforces musical chord continuity over beat-aware windows.

import { parseChordLabel, pitchClassOfNote, CanonicalQuality } from "./chordNormalizer";
import { buildChord, getPitchClass, CHORD_QUALITIES } from "../music/chordTheory";
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
  minGlitchDuration?: number;      // Maximum seconds for transient sandwich glitches (default: 0.45s)
  beatSnapTolerance?: number;      // Seconds within beat to snap boundary (default: 0.18s)
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
function evaluateSlashChordStability(
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
  // Unless explicitly sustained with strong bass evidence, 5th in bass is standard guitar open resonance.
  const isBassChordTone = isChordTone(parsed.root, parsed.quality, parsed.bass);
  
  const diag = (seg as any).diagnostics;
  if (diag) {
    // If we have detailed MIR diagnostic metrics:
    const slashBassRatio = diag.slashBassRatio ?? 1.0;
    const slashBassEvidence = diag.slashBassEvidence ?? 0.0;

    // Strong genuine slash chord requires high bass ratio and solid evidence
    if (slashBassRatio < 1.35 || slashBassEvidence < 0.40) {
      return { isGenuine: false, baseChord };
    }
  } else if (isBassChordTone && duration < 1.25) {
    // Without high-confidence diagnostics, require at least 1.25s duration for chord-tone inversions
    return { isGenuine: false, baseChord };
  }

  return { isGenuine: true, baseChord };
}

/**
 * Post-MIR Harmonic Stabilization Layer.
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
  const beatSnapTolerance = options.beatSnapTolerance ?? 0.18;
  const beats = options.beats || [];
  const totalDuration = options.duration || (rawSegments[rawSegments.length - 1].endTime ?? 0);

  let mergedSegmentsCount = 0;
  let rejectedTransientSlashCount = 0;

  // Clone raw segments deeply so we never mutate inputs
  let current: ChordSegment[] = rawSegments.map((s, idx) => ({
    ...s,
    id: s.id || `seg-${idx}`,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3))
  }));

  // =========================================================================
  // PASS 1: Transient / Spurious Slash Chord Rejection & Base Chord Normalization
  // =========================================================================
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

  // =========================================================================
  // PASS 2: Multi-Pass Harmonic Windowing, Sandwich Filtering, and Adjacent Merge
  // =========================================================================
  let hasChanged = true;
  let passCount = 0;
  const MAX_PASSES = 6;

  while (hasChanged && passCount < MAX_PASSES) {
    hasChanged = false;
    passCount++;

    // Subpass A: Merge adjacent identical chords
    const mergedAdjacent: ChordSegment[] = [];
    for (let i = 0; i < current.length; i++) {
      const seg = current[i];
      if (mergedAdjacent.length === 0) {
        mergedAdjacent.push({ ...seg });
        continue;
      }

      const prev = mergedAdjacent[mergedAdjacent.length - 1];
      if (prev.chord === seg.chord) {
        // Merge into prev
        const prevDur = prev.endTime - prev.startTime;
        const segDur = seg.endTime - seg.startTime;
        const totalDur = prevDur + segDur;

        // Weighted confidence
        prev.confidence = totalDur > 0
          ? Math.round((prev.confidence * prevDur + seg.confidence * segDur) / totalDur)
          : prev.confidence;
        prev.stability = Math.max(prev.stability || 0, seg.stability || 0);
        prev.endTime = seg.endTime;
        mergedSegmentsCount++;
        hasChanged = true;
      } else {
        mergedAdjacent.push({ ...seg });
      }
    }
    current = mergedAdjacent;

    // Subpass B: Transient Sandwich & Glitch Absorption
    if (current.length >= 3) {
      const filtered: ChordSegment[] = [];
      let skipNext = false;

      for (let i = 0; i < current.length; i++) {
        if (skipNext) {
          skipNext = false;
          continue;
        }

        const seg = current[i];
        const dur = seg.endTime - seg.startTime;

        // Check if sandwiched between identical chords
        if (i > 0 && i < current.length - 1) {
          const prev = filtered[filtered.length - 1];
          const next = current[i + 1];

          if (prev && next && prev.chord === next.chord) {
            // If the middle chord is short (< minGlitchDuration) OR shares base root
            const prevParsed = parseChordLabel(prev.chord, options.keyContext);
            const segParsed = parseChordLabel(seg.chord, options.keyContext);
            const sameBase = prevParsed.root === segParsed.root;

            if (dur <= minGlitchDuration || (sameBase && dur <= minSlashDuration * 1.5)) {
              // Absorb middle segment into prev, and next segment into prev
              prev.endTime = next.endTime;
              const prevDur = prev.endTime - prev.startTime;
              prev.confidence = Math.round((prev.confidence + next.confidence) / 2);
              mergedSegmentsCount += 2;
              skipNext = true;
              hasChanged = true;
              continue;
            }
          }
        }

        // Check if short transient with very low confidence (< 50%) between two stronger chords
        if (i > 0 && i < current.length - 1 && dur <= minGlitchDuration && (seg.confidence || 0) < 50) {
          const prev = filtered[filtered.length - 1];
          const next = current[i + 1];
          if (prev && next) {
            // Merge half into prev and half into next, or snap to nearest beat
            const mid = (seg.startTime + seg.endTime) / 2;
            prev.endTime = mid;
            next.startTime = mid;
            mergedSegmentsCount++;
            hasChanged = true;
            continue;
          }
        }

        filtered.push(seg);
      }
      current = filtered;
    }
  }

  // =========================================================================
  // PASS 3: Beat-Grid Boundary Alignment & Continuity Enforcement
  // =========================================================================
  if (beats.length > 0 && current.length > 1) {
    for (let i = 0; i < current.length - 1; i++) {
      const seg = current[i];
      const next = current[i + 1];
      const boundaryTime = seg.endTime;

      // Find closest beat to boundary
      let nearestBeat = boundaryTime;
      let minDiff = Infinity;
      for (const b of beats) {
        const diff = Math.abs(b - boundaryTime);
        if (diff < minDiff) {
          minDiff = diff;
          nearestBeat = b;
        } else if (diff > minDiff) {
          break; // beats are sorted
        }
      }

      if (minDiff <= beatSnapTolerance) {
        // Ensure not creating zero duration segment
        if (nearestBeat > seg.startTime + 0.15 && nearestBeat < next.endTime - 0.15) {
          seg.endTime = Number(nearestBeat.toFixed(3));
          next.startTime = Number(nearestBeat.toFixed(3));
        }
      }
    }
  }

  // Ensure first starts at 0 and last ends at totalDuration
  if (current.length > 0) {
    current[0].startTime = 0;
    if (totalDuration > 0) {
      current[current.length - 1].endTime = Number(Math.max(current[current.length - 1].startTime + 0.1, totalDuration).toFixed(3));
    }
  }

  // Final contiguous continuity check
  for (let i = 0; i < current.length - 1; i++) {
    current[i + 1].startTime = current[i].endTime;
  }

  // Re-index segment IDs
  current = current.map((s, idx) => ({
    ...s,
    id: `seg-${idx}`,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3))
  }));

  const finalProgression = current.map((s) => s.chord);

  return {
    segments: current,
    diagnostics: {
      rawSegmentCount: rawSegments.length,
      stabilizedSegmentCount: current.length,
      mergedSegments: mergedSegmentsCount,
      rejectedTransientSlashSegments: rejectedTransientSlashCount,
      finalProgression
    }
  };
}
