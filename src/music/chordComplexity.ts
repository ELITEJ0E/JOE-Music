/**
 * JOE Music - Chord Complexity Display Engine
 * 
 * Renders three musically appropriate levels of harmonic detail from a single canonical analysis:
 * - EASY: Simplified for clean, beginner/campfire guitar accompaniment (Gm7 -> Gm, Cadd9 -> C, F/A -> F).
 * - STANDARD: Musically functional guitar chords (Gm, Bb, F/A, Dm7, D7, Cm).
 * - DETAILED: Full high-confidence detected extensions (maj7, min7, add9, sus2, sus4, 6, slash chords).
 * 
 * CRITICAL RULE: Timing, chord boundaries, and segment lengths NEVER change between display modes.
 */

import { ChordComplexityMode, ChordSegment } from "../types";

/**
 * Simplifies a chord symbol for Easy Mode.
 * Removes extensions, alterations, and slash bass notes to leave basic open/barre triads or essential 7ths.
 */
export function simplifyChordToEasy(chord: string): string {
  if (!chord || chord === "N.C." || chord === "—") return chord;

  // Split slash chords (e.g. F/A -> F, D/F# -> D)
  const [mainPart] = chord.split("/");

  // Parse root and accidental
  const rootMatch = mainPart.match(/^([A-G][#b]?)/);
  if (!rootMatch) return mainPart;
  const root = rootMatch[1];
  const suffix = mainPart.slice(root.length);

  // Check for minor qualities
  const isMinor = /^(m|min|-)(?!aj)/i.test(suffix) && !/^(maj|M)/.test(suffix);
  // Check for diminished / augmented
  const isDim = /^(dim|°)/i.test(suffix);
  const isAug = /^(aug|\+)/i.test(suffix);
  // Check for essential dominant 7th (e.g. G7, B7, E7, A7, D7, C7)
  const isDominant7 = /^7$/.test(suffix);

  if (isDim) return `${root}dim`;
  if (isAug) return `${root}aug`;
  if (isDominant7) return `${root}7`;
  if (isMinor) return `${root}m`;

  // Major triad for maj7, add9, sus2, sus4, 6, etc.
  return root;
}

/**
 * Normalizes a chord symbol for Standard Mode.
 * Retains musically functional 7ths, sus chords, and primary inversions (slash chords),
 * while simplifying rare jazz alterations (e.g. b9, #11, 13).
 */
export function getStandardChord(chord: string): string {
  if (!chord || chord === "N.C." || chord === "—") return chord;

  const [mainPart, bass] = chord.split("/");
  const rootMatch = mainPart.match(/^([A-G][#b]?)/);
  if (!rootMatch) return chord;
  const root = rootMatch[1];
  const suffix = mainPart.slice(root.length);

  let cleanSuffix = suffix;

  // Clean extended jazz tensions to standard 7ths
  if (/^m(aj)?9$/i.test(suffix)) {
    cleanSuffix = /^maj/i.test(suffix) ? "maj7" : "m7";
  } else if (/^9$/.test(suffix)) {
    cleanSuffix = "7";
  } else if (/^11$|^13$/.test(suffix)) {
    cleanSuffix = "7";
  } else if (/^m11$|^m13$/i.test(suffix)) {
    cleanSuffix = "m7";
  }

  const baseResult = `${root}${cleanSuffix}`;
  return bass ? `${baseResult}/${bass}` : baseResult;
}

/**
 * Detailed Mode: Preserves full detected harmony including extensions and slash chords.
 */
export function getDetailedChord(chord: string): string {
  return chord;
}

/**
 * Resolves a chord symbol according to the chosen complexity mode.
 */
export function resolveChordForComplexity(
  chord: string,
  mode: ChordComplexityMode = "standard"
): string {
  if (!chord) return chord;

  switch (mode) {
    case "easy":
      return simplifyChordToEasy(chord);
    case "detailed":
      return getDetailedChord(chord);
    case "standard":
    default:
      return getStandardChord(chord);
  }
}

/**
 * Transforms an array of ChordSegments for display at the requested complexity level.
 * Preserves exact segment timestamps, IDs, and boundaries.
 */
export function transformSegmentsForComplexity(
  segments: ChordSegment[],
  mode: ChordComplexityMode = "standard"
): ChordSegment[] {
  if (!segments) return [];

  return segments.map((seg) => ({
    ...seg,
    chord: resolveChordForComplexity(seg.chord, mode),
  }));
}
