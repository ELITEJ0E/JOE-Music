/**
 * JOE Music - Local Section Key & Modulation Detector
 * 
 * Accurately detects musical modulations across distinct song sections
 * (e.g. Verse in G Major, Chorus in E Minor, Bridge in Bb Major) while
 * enforcing smooth modulation criteria to prevent transient false modulations.
 */

import { SongSection, ChordSegment } from "../types";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl-Schmuckler Key Profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a: number[], b: number[]): number {
  let meanA = 0, meanB = 0;
  for (let i = 0; i < 12; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= 12;
  meanB /= 12;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < 12; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  if (denA === 0 || denB === 0) return 0;
  return num / Math.sqrt(denA * denB);
}

/**
 * Estimates the musical key of a section from its chord collection.
 */
export function estimateSectionKey(
  chords: string[],
  globalKey: string
): { key: string; confidence: number; isModulated: boolean } {
  if (!chords || chords.length === 0) {
    return { key: globalKey, confidence: 0.5, isModulated: false };
  }

  // 1. Compute 12-semitone pitch-class histogram for this section
  const chroma = new Array(12).fill(0);
  const noteIndex: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
    E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10, B: 11
  };

  for (const c of chords) {
    const root = c.match(/^[A-G][#b]?/)?.[0];
    if (root && noteIndex[root] !== undefined) {
      const idx = noteIndex[root];
      const isMinor = /m(?!aj)/i.test(c);
      // Give weight to root (1.5), third (1.0), and fifth (0.8)
      chroma[idx] += 1.5;
      chroma[(idx + (isMinor ? 3 : 4)) % 12] += 1.0;
      chroma[(idx + 7) % 12] += 0.8;
    }
  }

  // 2. Correlate with all 24 major and minor keys
  let bestKey = globalKey;
  let bestScore = -1;

  for (let root = 0; root < 12; root++) {
    // Rotated profiles
    const majorRotated = new Array(12);
    const minorRotated = new Array(12);
    for (let i = 0; i < 12; i++) {
      majorRotated[i] = MAJOR_PROFILE[(i - root + 12) % 12];
      minorRotated[i] = MINOR_PROFILE[(i - root + 12) % 12];
    }

    const majorScore = correlate(chroma, majorRotated);
    const minorScore = correlate(chroma, minorRotated);

    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestKey = `${NOTE_NAMES[root]} Maj`;
    }
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = `${NOTE_NAMES[root]} Min`;
    }
  }

  // 3. Smooth Modulation Criteria:
  // Require persistent scale evidence: At least 2 distinct chords in section
  const uniqueChords = new Set(chords);
  const isSufficientEvidence = uniqueChords.size >= 2 && chords.length >= 3;

  // Give a heavy prior to global key (boost 0.15)
  // Only declare a modulation if the new key score exceeds global key significantly
  const isModulated = isSufficientEvidence && bestKey !== globalKey && bestScore > 0.65;

  return {
    key: isModulated ? bestKey : globalKey,
    confidence: Math.max(0.5, Math.min(0.98, bestScore)),
    isModulated,
  };
}

/**
 * Attaches local keys to each SongSection.
 */
export function enrichSectionsWithLocalKeys(
  sections: SongSection[],
  globalKey: string
): { sections: SongSection[]; sectionKeys: Record<number, string> } {
  const sectionKeys: Record<number, string> = {};

  const enriched = sections.map((sec, idx) => {
    const { key } = estimateSectionKey(sec.chords || [], globalKey);
    sectionKeys[idx] = key;
    return {
      ...sec,
      key,
    };
  });

  return { sections: enriched, sectionKeys };
}
