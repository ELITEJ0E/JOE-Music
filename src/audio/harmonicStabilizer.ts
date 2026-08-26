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
  const beatSnapTolerance = options.beatSnapTolerance ?? 0.20;
  const changeMargin = options.changeMargin ?? 0.08;
  const totalDuration = options.duration || (rawSegments[rawSegments.length - 1].endTime ?? 0);

  let mergedSegmentsCount = 0;
  let rejectedTransientSlashCount = 0;

  // Clone raw segments deeply
  let initialSegments: ChordSegment[] = rawSegments.map((s, idx) => ({
    ...s,
    id: s.id || `raw-${idx}`,
    rawChord: s.rawChord || s.chord,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3))
  }));

  // =========================================================================
  // STEP 1: Transient / Spurious Slash Chord Rejection & Base Chord Normalization
  // =========================================================================
  for (let i = 0; i < initialSegments.length; i++) {
    const seg = initialSegments[i];
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
  // STEP 2 & 3: Construct Beat Grid & Beat-Aware Chord Decision Windows with Hysteresis
  // =========================================================================
  let beats = options.beats && options.beats.length > 0 ? [...options.beats].sort((a, b) => a - b) : [];
  if (beats.length === 0) {
    for (let t = 0; t <= totalDuration + beatIntervalSec; t += beatIntervalSec) {
      beats.push(Number(t.toFixed(3)));
    }
  }

  // Build beat intervals: [b_0, b_1], [b_1, b_2], ...
  interface BeatDecision {
    beatIndex: number;
    startTime: number;
    endTime: number;
    winningChord: string;
    rawChord: string;
    root: string;
    bass: string;
    quality: string;
    extensions: string[];
    confidence: number;
    supportFrames: number;
    score: number;
  }

  const beatDecisions: BeatDecision[] = [];

  for (let bIdx = 0; bIdx < beats.length; bIdx++) {
    const bStart = beats[bIdx];
    const bEnd = bIdx + 1 < beats.length ? beats[bIdx + 1] : bStart + beatIntervalSec;
    if (bStart >= totalDuration && bIdx > 0) break;

    // Collect overlapping raw segments in this beat
    const candidatesMap = new Map<string, BeatWindowCandidate>();
    let totalOverlap = 0;

    for (const seg of initialSegments) {
      const overlapStart = Math.max(bStart, seg.startTime);
      const overlapEnd = Math.min(bEnd, seg.endTime);
      const overlapDur = Math.max(0, overlapEnd - overlapStart);

      if (overlapDur > 0.005) {
        const chordKey = seg.chord;
        const existing = candidatesMap.get(chordKey);
        const weight = overlapDur * (seg.confidence / 100);
        totalOverlap += overlapDur;

        if (existing) {
          existing.weight += weight;
          existing.confidence = Math.max(existing.confidence, seg.confidence);
          existing.supportFrames += Math.round(overlapDur * 100);
        } else {
          candidatesMap.set(chordKey, {
            chord: seg.chord,
            rawChord: seg.rawChord || seg.chord,
            root: seg.root,
            bass: seg.bass,
            quality: seg.quality,
            extensions: seg.extensions || [],
            weight,
            confidence: seg.confidence,
            supportFrames: Math.round(overlapDur * 100),
            isSlash: seg.chord.includes("/"),
            hasGenuineSlash: seg.chord.includes("/") && ((seg.endTime - seg.startTime) >= minSlashDuration)
          });
        }
      }
    }

    if (candidatesMap.size === 0) {
      // Find closest segment before or after
      const closest = initialSegments.find(s => s.startTime <= bStart && s.endTime >= bStart) || initialSegments[0];
      if (closest) {
        beatDecisions.push({
          beatIndex: bIdx,
          startTime: bStart,
          endTime: bEnd,
          winningChord: closest.chord,
          rawChord: closest.rawChord || closest.chord,
          root: closest.root,
          bass: closest.bass,
          quality: closest.quality,
          extensions: closest.extensions || [],
          confidence: closest.confidence,
          supportFrames: 10,
          score: closest.confidence / 100
        });
      }
      continue;
    }

    // Rank candidates for this beat window
    const rankedCandidates = Array.from(candidatesMap.values()).sort((a, b) => b.weight - a.weight);
    const top = rankedCandidates[0];

    beatDecisions.push({
      beatIndex: bIdx,
      startTime: bStart,
      endTime: bEnd,
      winningChord: top.chord,
      rawChord: top.rawChord,
      root: top.root,
      bass: top.bass,
      quality: top.quality,
      extensions: top.extensions,
      confidence: top.confidence,
      supportFrames: top.supportFrames,
      score: top.weight / (totalOverlap || 1)
    });
  }

  // =========================================================================
  // STEP 4: Temporal Chord Hysteresis Across Beat Windows
  // =========================================================================
  // Apply hysteresis: a new chord must demonstrate sustained harmonic superiority.
  // Single-beat / momentary fluctuations between identical or related harmonies are absorbed.
  if (beatDecisions.length > 0) {
    let currentActiveChord = beatDecisions[0].winningChord;
    let currentScore = beatDecisions[0].score;

    for (let i = 1; i < beatDecisions.length; i++) {
      const beat = beatDecisions[i];
      const candChord = beat.winningChord;

      if (candChord === currentActiveChord) {
        currentScore = Math.max(currentScore, beat.score);
        continue;
      }

      // Check if this is a fleeting 1-beat deviation surrounded by currentActiveChord
      const nextBeat = i + 1 < beatDecisions.length ? beatDecisions[i + 1] : null;
      const isFleeting = nextBeat && nextBeat.winningChord === currentActiveChord;

      if (isFleeting) {
        // Evaluate candidate strength vs active chord
        const candScore = beat.score;
        const parsedActive = parseChordLabel(currentActiveChord, options.keyContext);
        const parsedCand = parseChordLabel(candChord, options.keyContext);
        const sameRoot = parsedActive.root === parsedCand.root;

        // If candidate does NOT exceed currentScore by changeMargin or shares same root, absorb it!
        if (candScore <= currentScore + changeMargin || sameRoot || candChord.includes("/")) {
          beat.winningChord = currentActiveChord;
          beat.rawChord = candChord;
          beat.root = parsedActive.root;
          beat.quality = parsedActive.qualitySymbol;
          beat.bass = parsedActive.bass || parsedActive.root;
          continue;
        }
      }

      // Candidate wins: switch active chord
      currentActiveChord = candChord;
      currentScore = beat.score;
    }
  }

  // =========================================================================
  // STEP 5: Merge Consecutive Identical Beat Decisions into Contiguous Segments
  // =========================================================================
  let assembledSegments: ChordSegment[] = [];

  for (let i = 0; i < beatDecisions.length; i++) {
    const bd = beatDecisions[i];
    if (assembledSegments.length === 0) {
      assembledSegments.push({
        id: `seg-0`,
        chord: bd.winningChord,
        rawChord: bd.rawChord,
        stabilizedChord: bd.winningChord,
        root: bd.root,
        bass: bd.bass,
        quality: bd.quality,
        extensions: bd.extensions,
        startTime: bd.startTime,
        endTime: bd.endTime,
        confidence: bd.confidence,
        stability: 90,
        durationBeats: 1,
        candidateSupportFrames: bd.supportFrames,
        changeMargin,
        snappedBoundary: true,
        beatIndex: bd.beatIndex,
        diagnostics: {
          beatStart: bd.beatIndex,
          beatEnd: bd.beatIndex + 1,
          avgScore: bd.score
        }
      });
      continue;
    }

    const prev = assembledSegments[assembledSegments.length - 1];
    if (prev.chord === bd.winningChord) {
      // Extend previous segment
      prev.endTime = bd.endTime;
      prev.durationBeats = (prev.durationBeats || 1) + 1;
      prev.confidence = Math.round((prev.confidence + bd.confidence) / 2);
      prev.candidateSupportFrames = (prev.candidateSupportFrames || 0) + bd.supportFrames;
      mergedSegmentsCount++;
    } else {
      assembledSegments.push({
        id: `seg-${assembledSegments.length}`,
        chord: bd.winningChord,
        rawChord: bd.rawChord,
        stabilizedChord: bd.winningChord,
        root: bd.root,
        bass: bd.bass,
        quality: bd.quality,
        extensions: bd.extensions,
        startTime: bd.startTime,
        endTime: bd.endTime,
        confidence: bd.confidence,
        stability: 90,
        durationBeats: 1,
        candidateSupportFrames: bd.supportFrames,
        changeMargin,
        snappedBoundary: true,
        beatIndex: bd.beatIndex,
        diagnostics: {
          beatStart: bd.beatIndex,
          beatEnd: bd.beatIndex + 1,
          avgScore: bd.score
        }
      });
    }
  }

  // =========================================================================
  // STEP 6: Multi-Pass Sandwich & Musical Glitch Filtering
  // =========================================================================
  let current = assembledSegments;
  let hasChanged = true;
  let passCount = 0;
  const MAX_PASSES = 4;

  while (hasChanged && passCount < MAX_PASSES) {
    hasChanged = false;
    passCount++;

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

        if (i > 0 && i < current.length - 1) {
          const prev = filtered[filtered.length - 1];
          const next = current[i + 1];

          if (prev && next && prev.chord === next.chord) {
            const prevParsed = parseChordLabel(prev.chord, options.keyContext);
            const segParsed = parseChordLabel(seg.chord, options.keyContext);
            const sameBase = prevParsed.root === segParsed.root;

            // If middle chord is short (< minGlitchDuration) OR shares base root
            if (dur <= minGlitchDuration || (sameBase && dur <= minSlashDuration * 1.5)) {
              prev.endTime = next.endTime;
              prev.durationBeats = (prev.durationBeats || 1) + (seg.durationBeats || 1) + (next.durationBeats || 1);
              prev.confidence = Math.round((prev.confidence + next.confidence) / 2);
              mergedSegmentsCount += 2;
              skipNext = true;
              hasChanged = true;
              continue;
            }
          }
        }

        filtered.push(seg);
      }
      current = filtered;
    }
  }

  // =========================================================================
  // STEP 7: Boundary Placement & Continuous Timeline Check
  // =========================================================================
  if (current.length > 0) {
    current[0].startTime = 0;
    if (totalDuration > 0) {
      current[current.length - 1].endTime = Number(Math.max(current[current.length - 1].startTime + 0.1, totalDuration).toFixed(3));
    }
  }

  for (let i = 0; i < current.length - 1; i++) {
    current[i + 1].startTime = current[i].endTime;
  }

  // Re-index segment IDs and ensure all segment diagnostics are populated
  current = current.map((s, idx) => ({
    ...s,
    id: `seg-${idx}`,
    rawChord: s.rawChord || s.chord,
    stabilizedChord: s.chord,
    startTime: Number(s.startTime.toFixed(3)),
    endTime: Number(s.endTime.toFixed(3)),
    durationBeats: Number(((s.endTime - s.startTime) / beatIntervalSec).toFixed(1))
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
