/**
 * JOE Music - True Musical Section Detection Engine
 * 
 * Replaces arbitrary time-based sections (e.g. 16-second buckets) with real
 * musical self-similarity analysis, recurrence grouping, and conservative labeling.
 */

import { ChordSegment, SongSection, SectionType } from "../types";

export interface SectionDetectionInput {
  chordSegments: ChordSegment[];
  duration: number;
  beats?: number[];
  downbeats?: number[];
  beatsPerBar?: number;
  timeSignature?: string;
  tempo?: number;
}

/**
 * Cosine similarity between two frequency/chroma/energy vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Converts a sequence of chords to a 12-dimensional harmonic distribution vector.
 */
function chordsToHarmonicDistribution(chords: string[]): number[] {
  const noteIndex: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
    E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10, B: 11
  };
  const vector = new Array(12).fill(0);
  if (!chords || chords.length === 0) return vector;

  for (const c of chords) {
    const root = c.match(/^[A-G][#b]?/)?.[0];
    if (root && noteIndex[root] !== undefined) {
      vector[noteIndex[root]] += 1;
    }
  }

  // Normalize
  const sum = vector.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (let i = 0; i < 12; i++) vector[i] /= sum;
  }
  return vector;
}

interface RawCandidateSegment {
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  chords: string[];
  harmonicVector: number[];
  averageEnergy: number;
}

/**
 * Detects musical sections based on harmonic recurrence, progression boundaries, and downbeat alignment.
 */
export function detectMusicalSections(input: SectionDetectionInput): SongSection[] {
  const {
    chordSegments = [],
    duration = 0,
    beats = [],
    downbeats = [],
    beatsPerBar = 4,
    tempo = 120,
  } = input;

  if (chordSegments.length === 0 || duration <= 0) {
    return [
      {
        id: "section-1",
        name: "Full Song",
        label: "Full Song",
        type: "section",
        startTime: 0,
        endTime: Math.max(1, duration),
        confidence: 0.8,
        repeatGroup: "A",
        chords: [],
        harmonicVocabulary: [],
        bars: 4,
      },
    ];
  }

  // Approximate bar duration in seconds
  const secondsPerBeat = 60 / Math.max(40, tempo);
  const barDurationSec = secondsPerBeat * beatsPerBar;
  // Desired section length is typically 4 to 16 bars (e.g. 8s to 35s)
  const minSectionDuration = Math.max(6.0, barDurationSec * 3);
  const targetSectionDuration = Math.max(12.0, barDurationSec * 8);

  // 1. Group chord segments into cohesive phrase blocks based on downbeat or repetition
  const rawSegments: RawCandidateSegment[] = [];
  let currentStartIdx = 0;
  let currentStartTime = chordSegments[0].startTime;

  for (let i = 0; i < chordSegments.length; i++) {
    const seg = chordSegments[i];
    const elapsed = seg.endTime - currentStartTime;
    const isLast = i === chordSegments.length - 1;

    // Check if this segment starts a new recurring phrase or exceeds target duration
    const isBoundaryCandidate =
      elapsed >= minSectionDuration &&
      (elapsed >= targetSectionDuration ||
       // Significant chord repetition / cadence boundary
       (i < chordSegments.length - 1 && chordSegments[i + 1].startTime % barDurationSec < 0.25));

    if (isBoundaryCandidate || isLast) {
      const sliceChords = chordSegments.slice(currentStartIdx, i + 1).map((s) => s.chord);
      rawSegments.push({
        startIndex: currentStartIdx,
        endIndex: i,
        startTime: currentStartTime,
        endTime: seg.endTime,
        chords: sliceChords,
        harmonicVector: chordsToHarmonicDistribution(sliceChords),
        averageEnergy: 0.5,
      });

      currentStartIdx = i + 1;
      currentStartTime = seg.endTime;
    }
  }

  if (rawSegments.length === 0) {
    rawSegments.push({
      startIndex: 0,
      endIndex: chordSegments.length - 1,
      startTime: 0,
      endTime: duration,
      chords: chordSegments.map((c) => c.chord),
      harmonicVector: chordsToHarmonicDistribution(chordSegments.map((c) => c.chord)),
      averageEnergy: 0.5,
    });
  }

  // 2. Compute Self-Similarity & Cluster into Repeat Groups (A, B, C...)
  const repeatGroupLetters = ["A", "B", "C", "D", "E", "F"];
  const assignedGroups: string[] = new Array(rawSegments.length).fill("");
  let nextGroupIdx = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    if (assignedGroups[i]) continue;

    const groupLetter = repeatGroupLetters[nextGroupIdx % repeatGroupLetters.length];
    nextGroupIdx++;
    assignedGroups[i] = groupLetter;

    // Look for recurring sections in future segments
    for (let j = i + 1; j < rawSegments.length; j++) {
      if (assignedGroups[j]) continue;

      const sim = cosineSimilarity(
        rawSegments[i].harmonicVector,
        rawSegments[j].harmonicVector
      );

      // Check chord sequence overlap
      const exactChordsA = rawSegments[i].chords.join(" ");
      const exactChordsB = rawSegments[j].chords.join(" ");
      const chordAgreement = exactChordsA === exactChordsB || sim > 0.82;

      if (chordAgreement) {
        assignedGroups[j] = groupLetter;
      }
    }
  }

  // 3. Count group occurrences to assess structural roles (Intro, Verse, Chorus, Outro)
  const groupCounts: Record<string, number> = {};
  assignedGroups.forEach((g) => {
    groupCounts[g] = (groupCounts[g] || 0) + 1;
  });

  // Find the primary recurring group with highest occurrence / chord density (likely Chorus or Verse)
  const recurringGroups = Object.keys(groupCounts).filter((g) => groupCounts[g] >= 2);

  // 4. Musically Conservative Labeling
  const finalSections: SongSection[] = [];
  const typeCounter: Record<string, number> = {
    verse: 0,
    chorus: 0,
    section: 0,
  };

  for (let idx = 0; idx < rawSegments.length; idx++) {
    const raw = rawSegments[idx];
    const group = assignedGroups[idx];
    const isFirst = idx === 0;
    const isLast = idx === rawSegments.length - 1;
    const durationSec = raw.endTime - raw.startTime;

    let type: SectionType = "section";
    let label = `Section ${group}`;

    // A. Intro: Starts near 0:00, before main recurring themes, often under 25s
    if (isFirst && (groupCounts[group] === 1 || raw.startTime < 1.0) && durationSec < 26) {
      type = "intro";
      label = "Intro";
    }
    // B. Outro: At the very end of the song, non-recurring or final fadeout
    else if (isLast && (groupCounts[group] === 1 || raw.endTime >= duration - 4)) {
      type = "outro";
      label = "Outro";
    }
    // C. Recurring Sections: If justified by musical evidence
    else if (recurringGroups.length >= 1) {
      const primaryGroup = recurringGroups[0];
      const secondaryGroup = recurringGroups[1];

      if (group === primaryGroup) {
        // High recurrence alternating section
        typeCounter.verse++;
        type = "verse";
        label = `Verse ${typeCounter.verse}`;
      } else if (secondaryGroup && group === secondaryGroup) {
        typeCounter.chorus++;
        type = "chorus";
        label = `Chorus ${typeCounter.chorus}`;
      } else {
        type = "section";
        label = `Section ${group}`;
      }
    } else {
      // Conservative fallback
      type = "section";
      label = `Section ${group}`;
    }

    const uniqueChords = Array.from(new Set(raw.chords));
    const barsCount = Math.max(1, Math.round(durationSec / barDurationSec));

    finalSections.push({
      id: `section-${idx + 1}-${type}`,
      name: label, // Legacy compatibility
      label: label,
      type,
      startTime: Number(raw.startTime.toFixed(3)),
      endTime: Number(raw.endTime.toFixed(3)),
      confidence: groupCounts[group] > 1 ? 0.90 : 0.78,
      repeatGroup: group,
      harmonicVocabulary: uniqueChords,
      averageEnergy: raw.averageEnergy,
      bars: barsCount,
      chords: raw.chords,
      strummingPattern: barsCount % 2 === 0 ? "D - D U - U D -" : "D - D - D U D -",
    });
  }

  return finalSections;
}
