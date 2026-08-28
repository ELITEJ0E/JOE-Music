import { ChordVoicing } from "../types";

export const CHORD_DATABASE: ChordVoicing[] = [
  // C Family
  {
    id: "c-maj-open",
    name: "C Major",
    root: "C",
    quality: "Major",
    frets: ["x", 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    notes: ["C", "E", "G", "C", "E"],
    intervals: ["1", "3", "5", "1", "3"],
    cagedShape: "C",
    difficulty: "Beginner",
  },
  {
    id: "c-maj-barre-a",
    name: "C Major (Barre 3rd Fret)",
    root: "C",
    quality: "Major",
    frets: ["x", 3, 5, 5, 5, 3],
    barre: { fret: 3, fromString: 1, toString: 5 },
    notes: ["C", "G", "C", "E", "G"],
    cagedShape: "A",
    difficulty: "Intermediate",
  },
  {
    id: "c-maj-barre-e",
    name: "C Major (Barre 8th Fret)",
    root: "C",
    quality: "Major",
    frets: [8, 10, 10, 9, 8, 8],
    barre: { fret: 8, fromString: 0, toString: 5 },
    notes: ["C", "G", "C", "E", "G", "C"],
    cagedShape: "E",
    difficulty: "Intermediate",
  },
  {
    id: "c-min-barre",
    name: "C Minor (Cm)",
    root: "C",
    quality: "Minor",
    frets: ["x", 3, 5, 5, 4, 3],
    barre: { fret: 3, fromString: 1, toString: 5 },
    notes: ["C", "G", "C", "Eb", "G"],
    cagedShape: "A",
    difficulty: "Intermediate",
  },
  {
    id: "c-dom7-open",
    name: "C Dominant 7th (C7)",
    root: "C",
    quality: "7",
    frets: ["x", 3, 2, 3, 1, 0],
    fingers: [0, 3, 2, 4, 1, 0],
    notes: ["C", "E", "Bb", "C", "E"],
    difficulty: "Beginner",
  },
  {
    id: "c-maj7-open",
    name: "C Major 7th (Cmaj7)",
    root: "C",
    quality: "maj7",
    frets: ["x", 3, 2, 0, 0, 0],
    notes: ["C", "E", "G", "B", "E"],
    difficulty: "Beginner",
  },
  {
    id: "c-add9-open",
    name: "C Add 9 (Cadd9)",
    root: "C",
    quality: "add9",
    frets: ["x", 3, 2, 0, 3, 3],
    fingers: [0, 2, 1, 0, 3, 4],
    notes: ["C", "E", "G", "D", "G"],
    difficulty: "Beginner",
  },
  {
    id: "c-sus4-open",
    name: "C Suspended 4th (Csus4)",
    root: "C",
    quality: "sus4",
    frets: ["x", 3, 3, 0, 1, 1],
    notes: ["C", "F", "G", "C", "F"],
    difficulty: "Intermediate",
  },

  // D Family
  {
    id: "d-maj-open",
    name: "D Major",
    root: "D",
    quality: "Major",
    frets: ["x", "x", 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    notes: ["D", "A", "D", "F#"],
    cagedShape: "D",
    difficulty: "Beginner",
  },
  {
    id: "d-min-open",
    name: "D Minor (Dm)",
    root: "D",
    quality: "Minor",
    frets: ["x", "x", 0, 2, 3, 1],
    fingers: [0, 0, 0, 2, 3, 1],
    notes: ["D", "A", "D", "F"],
    difficulty: "Beginner",
  },
  {
    id: "d-min7-open",
    name: "D Minor 7th (Dm7)",
    root: "D",
    quality: "min7",
    frets: ["x", "x", 0, 2, 1, 1],
    fingers: [0, 0, 0, 2, 1, 1],
    notes: ["D", "A", "C", "F"],
    difficulty: "Beginner",
  },
  {
    id: "d-dom7-open",
    name: "D Dominant 7th (D7)",
    root: "D",
    quality: "7",
    frets: ["x", "x", 0, 2, 1, 2],
    fingers: [0, 0, 0, 2, 1, 3],
    notes: ["D", "A", "C", "F#"],
    difficulty: "Beginner",
  },
  {
    id: "d-maj7-open",
    name: "D Major 7th (Dmaj7)",
    root: "D",
    quality: "maj7",
    frets: ["x", "x", 0, 2, 2, 2],
    barre: { fret: 2, fromString: 3, toString: 5 },
    notes: ["D", "A", "C#", "F#"],
    difficulty: "Beginner",
  },
  {
    id: "d-sus2-open",
    name: "D Suspended 2nd (Dsus2)",
    root: "D",
    quality: "sus2",
    frets: ["x", "x", 0, 2, 3, 0],
    notes: ["D", "A", "D", "E"],
    difficulty: "Beginner",
  },
  {
    id: "d-sus4-open",
    name: "D Suspended 4th (Dsus4)",
    root: "D",
    quality: "sus4",
    frets: ["x", "x", 0, 2, 3, 3],
    notes: ["D", "A", "D", "G"],
    difficulty: "Beginner",
  },

  // E Family
  {
    id: "e-maj-open",
    name: "E Major",
    root: "E",
    quality: "Major",
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [0, 2, 3, 1, 0, 0],
    notes: ["E", "B", "E", "G#", "B", "E"],
    cagedShape: "E",
    difficulty: "Beginner",
  },
  {
    id: "e-min-open",
    name: "E Minor (Em)",
    root: "E",
    quality: "Minor",
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
    notes: ["E", "B", "E", "G", "B", "E"],
    difficulty: "Beginner",
  },
  {
    id: "e-dom7-open",
    name: "E Dominant 7th (E7)",
    root: "E",
    quality: "7",
    frets: [0, 2, 0, 1, 0, 0],
    notes: ["E", "B", "D", "G#", "B", "E"],
    difficulty: "Beginner",
  },
  {
    id: "e-min7-open",
    name: "E Minor 7th (Em7)",
    root: "E",
    quality: "min7",
    frets: [0, 2, 2, 0, 3, 3],
    fingers: [0, 1, 2, 0, 3, 4],
    notes: ["E", "B", "E", "G", "D", "G"],
    difficulty: "Beginner",
  },
  {
    id: "e-maj7-open",
    name: "E Major 7th (Emaj7)",
    root: "E",
    quality: "maj7",
    frets: [0, 2, 1, 1, 0, 0],
    notes: ["E", "B", "D#", "G#", "B", "E"],
    difficulty: "Beginner",
  },
  {
    id: "e-sus4-open",
    name: "E Suspended 4th (Esus4)",
    root: "E",
    quality: "sus4",
    frets: [0, 2, 2, 2, 0, 0],
    notes: ["E", "B", "E", "A", "B", "E"],
    difficulty: "Beginner",
  },

  // F Family
  {
    id: "f-maj-barre",
    name: "F Major",
    root: "F",
    quality: "Major",
    frets: [1, 3, 3, 2, 1, 1],
    barre: { fret: 1, fromString: 0, toString: 5 },
    notes: ["F", "C", "F", "A", "C", "F"],
    cagedShape: "E",
    difficulty: "Intermediate",
  },
  {
    id: "f-maj7-open",
    name: "F Major 7th (Fmaj7)",
    root: "F",
    quality: "maj7",
    frets: ["x", "x", 3, 2, 1, 0],
    notes: ["F", "A", "C", "E"],
    difficulty: "Beginner",
  },
  {
    id: "f-min-barre",
    name: "F Minor (Fm)",
    root: "F",
    quality: "Minor",
    frets: [1, 3, 3, 1, 1, 1],
    barre: { fret: 1, fromString: 0, toString: 5 },
    notes: ["F", "C", "F", "Ab", "C", "F"],
    difficulty: "Intermediate",
  },
  {
    id: "f-sharp-min-barre",
    name: "F# Minor (F#m)",
    root: "F#",
    quality: "Minor",
    frets: [2, 4, 4, 2, 2, 2],
    barre: { fret: 2, fromString: 0, toString: 5 },
    notes: ["F#", "C#", "F#", "A", "C#", "F#"],
    difficulty: "Intermediate",
  },

  // G Family
  {
    id: "g-maj-open",
    name: "G Major",
    root: "G",
    quality: "Major",
    frets: [3, 2, 0, 0, 3, 3],
    fingers: [2, 1, 0, 0, 3, 4],
    notes: ["G", "B", "D", "G", "D", "G"],
    cagedShape: "G",
    difficulty: "Beginner",
  },
  {
    id: "g-dom7-open",
    name: "G Dominant 7th (G7)",
    root: "G",
    quality: "7",
    frets: [3, 2, 0, 0, 0, 1],
    notes: ["G", "B", "D", "G", "B", "F"],
    difficulty: "Beginner",
  },
  {
    id: "g-maj7-barre",
    name: "G Major 7th (Gmaj7)",
    root: "G",
    quality: "maj7",
    frets: [3, "x", 4, 4, 3, "x"],
    notes: ["G", "F#", "B", "D"],
    difficulty: "Intermediate",
  },
  {
    id: "g-min-barre",
    name: "G Minor (Gm)",
    root: "G",
    quality: "Minor",
    frets: [3, 5, 5, 3, 3, 3],
    barre: { fret: 3, fromString: 0, toString: 5 },
    notes: ["G", "D", "G", "Bb", "D", "G"],
    difficulty: "Intermediate",
  },
  {
    id: "g-sus4-open",
    name: "G Suspended 4th (Gsus4)",
    root: "G",
    quality: "sus4",
    frets: [3, "x", 0, 0, 1, 3],
    notes: ["G", "D", "G", "C", "G"],
    difficulty: "Beginner",
  },

  // A Family
  {
    id: "a-maj-open",
    name: "A Major",
    root: "A",
    quality: "Major",
    frets: ["x", 0, 2, 2, 2, 0],
    fingers: [0, 0, 1, 2, 3, 0],
    notes: ["A", "E", "A", "C#", "E"],
    cagedShape: "A",
    difficulty: "Beginner",
  },
  {
    id: "a-min-open",
    name: "A Minor (Am)",
    root: "A",
    quality: "Minor",
    frets: ["x", 0, 2, 2, 1, 0],
    fingers: [0, 0, 2, 3, 1, 0],
    notes: ["A", "E", "A", "C", "E"],
    difficulty: "Beginner",
  },
  {
    id: "a-dom7-open",
    name: "A Dominant 7th (A7)",
    root: "A",
    quality: "7",
    frets: ["x", 0, 2, 0, 2, 0],
    notes: ["A", "E", "G", "C#", "E"],
    difficulty: "Beginner",
  },
  {
    id: "a-maj7-open",
    name: "A Major 7th (Amaj7)",
    root: "A",
    quality: "maj7",
    frets: ["x", 0, 2, 1, 2, 0],
    notes: ["A", "E", "G#", "C#", "E"],
    difficulty: "Beginner",
  },
  {
    id: "a-min7-open",
    name: "A Minor 7th (Am7)",
    root: "A",
    quality: "min7",
    frets: ["x", 0, 2, 0, 1, 0],
    notes: ["A", "E", "G", "C", "E"],
    difficulty: "Beginner",
  },
  {
    id: "a-sus2-open",
    name: "A Suspended 2nd (Asus2)",
    root: "A",
    quality: "sus2",
    frets: ["x", 0, 2, 2, 0, 0],
    notes: ["A", "E", "A", "B", "E"],
    difficulty: "Beginner",
  },
  {
    id: "a-sus4-open",
    name: "A Suspended 4th (Asus4)",
    root: "A",
    quality: "sus4",
    frets: ["x", 0, 2, 2, 3, 0],
    notes: ["A", "E", "A", "D", "E"],
    difficulty: "Beginner",
  },

  // B Family
  {
    id: "b-maj-barre",
    name: "B Major",
    root: "B",
    quality: "Major",
    frets: ["x", 2, 4, 4, 4, 2],
    barre: { fret: 2, fromString: 1, toString: 5 },
    notes: ["B", "F#", "B", "D#", "F#"],
    cagedShape: "A",
    difficulty: "Intermediate",
  },
  {
    id: "b-min-barre",
    name: "B Minor (Bm)",
    root: "B",
    quality: "Minor",
    frets: ["x", 2, 4, 4, 3, 2],
    barre: { fret: 2, fromString: 1, toString: 5 },
    notes: ["B", "F#", "B", "D", "F#"],
    cagedShape: "A",
    difficulty: "Intermediate",
  },
  {
    id: "b-dom7-open",
    name: "B Dominant 7th (B7)",
    root: "B",
    quality: "7",
    frets: ["x", 2, 1, 2, 0, 2],
    fingers: [0, 2, 1, 3, 0, 4],
    notes: ["B", "D#", "A", "B", "F#"],
    difficulty: "Beginner",
  },
  {
    id: "b-min7-barre",
    name: "B Minor 7th (Bm7)",
    root: "B",
    quality: "min7",
    frets: ["x", 2, 4, 2, 3, 2],
    barre: { fret: 2, fromString: 1, toString: 5 },
    notes: ["B", "F#", "A", "D", "F#"],
    difficulty: "Intermediate",
  },

  // Jazz / Extended Chords
  {
    id: "g-maj9",
    name: "G Major 9th (Gmaj9)",
    root: "G",
    quality: "maj9",
    frets: [3, "x", 4, 2, 3, "x"],
    notes: ["G", "F#", "A", "D"],
    difficulty: "Advanced",
  },
  {
    id: "e-dom9-hendrix",
    name: "E7#9 (Hendrix Chord)",
    root: "E",
    quality: "7#9",
    frets: [0, 7, 6, 7, 8, "x"],
    fingers: [0, 2, 1, 3, 4, 0],
    notes: ["E", "E", "G#", "D", "G"],
    difficulty: "Intermediate",
  },
  {
    id: "d-min9",
    name: "D Minor 9th (Dm9)",
    root: "D",
    quality: "min9",
    frets: ["x", 5, 3, 5, 5, "x"],
    notes: ["D", "F", "C", "E"],
    difficulty: "Advanced",
  },
  {
    id: "b-min7b5",
    name: "B Half-Diminished (Bm7b5)",
    root: "B",
    quality: "min7b5",
    frets: ["x", 2, 3, 2, 3, "x"],
    notes: ["B", "F", "A", "D"],
    difficulty: "Advanced",
  },
  {
    id: "f-dim7",
    name: "F Diminished 7th (Fdim7)",
    root: "F",
    quality: "dim7",
    frets: ["x", "x", 3, 4, 3, 4],
    notes: ["F", "B", "D", "Ab"],
    difficulty: "Advanced",
  },
  {
    id: "a-aug",
    name: "A Augmented (Aaug)",
    root: "A",
    quality: "aug",
    frets: ["x", 0, 3, 2, 2, 1],
    notes: ["A", "F", "A", "C#", "F"],
    difficulty: "Intermediate",
  },

  // Power Chords (5)
  {
    id: "e5-open",
    name: "E Power Chord (E5)",
    root: "E",
    quality: "5",
    frets: [0, 2, 2, "x", "x", "x"],
    fingers: [0, 1, 2, 0, 0, 0],
    notes: ["E", "B", "E"],
    difficulty: "Beginner",
  },
  {
    id: "a5-open",
    name: "A Power Chord (A5)",
    root: "A",
    quality: "5",
    frets: ["x", 0, 2, 2, "x", "x"],
    fingers: [0, 0, 1, 2, 0, 0],
    notes: ["A", "E", "A"],
    difficulty: "Beginner",
  },
  {
    id: "d5-open",
    name: "D Power Chord (D5)",
    root: "D",
    quality: "5",
    frets: ["x", "x", 0, 2, 3, "x"],
    fingers: [0, 0, 0, 1, 3, 0],
    notes: ["D", "A", "D"],
    difficulty: "Beginner",
  },
  {
    id: "c5-barre",
    name: "C Power Chord (C5)",
    root: "C",
    quality: "5",
    frets: ["x", 3, 5, 5, "x", "x"],
    fingers: [0, 1, 3, 4, 0, 0],
    notes: ["C", "G", "C"],
    difficulty: "Beginner",
  },
  {
    id: "g5-barre",
    name: "G Power Chord (G5)",
    root: "G",
    quality: "5",
    frets: [3, 5, 5, "x", "x", "x"],
    fingers: [1, 3, 4, 0, 0, 0],
    notes: ["G", "D", "G"],
    difficulty: "Beginner",
  },
  {
    id: "f5-barre",
    name: "F Power Chord (F5)",
    root: "F",
    quality: "5",
    frets: [1, 3, 3, "x", "x", "x"],
    fingers: [1, 3, 4, 0, 0, 0],
    notes: ["F", "C", "F"],
    difficulty: "Beginner",
  },
  {
    id: "f-sharp-5-barre",
    name: "F# Power Chord (F#5)",
    root: "F#",
    quality: "5",
    frets: [2, 4, 4, "x", "x", "x"],
    fingers: [1, 3, 4, 0, 0, 0],
    notes: ["F#", "C#", "F#"],
    difficulty: "Beginner",
  },
  {
    id: "b5-barre",
    name: "B Power Chord (B5)",
    root: "B",
    quality: "5",
    frets: ["x", 2, 4, 4, "x", "x"],
    fingers: [0, 1, 3, 4, 0, 0],
    notes: ["B", "F#", "B"],
    difficulty: "Beginner",
  },
  {
    id: "bb-maj-barre",
    name: "Bb Major (Bb)",
    root: "Bb",
    quality: "Major",
    frets: ["x", 1, 3, 3, 3, 1],
    barre: { fret: 1, fromString: 1, toString: 5 },
    notes: ["Bb", "F", "Bb", "D", "F"],
    cagedShape: "A",
    difficulty: "Intermediate",
  },
  {
    id: "eb-maj-barre",
    name: "Eb Major (Eb)",
    root: "Eb",
    quality: "Major",
    frets: ["x", 6, 8, 8, 8, 6],
    barre: { fret: 6, fromString: 1, toString: 5 },
    notes: ["Eb", "Bb", "Eb", "G", "Bb"],
    cagedShape: "A",
    difficulty: "Intermediate",
  },
  {
    id: "ab-maj-barre",
    name: "Ab Major (Ab)",
    root: "Ab",
    quality: "Major",
    frets: [4, 6, 6, 5, 4, 4],
    barre: { fret: 4, fromString: 0, toString: 5 },
    notes: ["Ab", "Eb", "Ab", "C", "Eb", "Ab"],
    cagedShape: "E",
    difficulty: "Intermediate",
  },
  {
    id: "c-sus2-open",
    name: "C Suspended 2nd (Csus2)",
    root: "C",
    quality: "sus2",
    frets: ["x", 3, 0, 0, 1, 3],
    notes: ["C", "G", "D", "C", "G"],
    difficulty: "Beginner",
  },
  {
    id: "g-sus2-open",
    name: "G Suspended 2nd (Gsus2)",
    root: "G",
    quality: "sus2",
    frets: [3, 0, 0, 0, 3, 3],
    notes: ["G", "A", "D", "G", "D", "G"],
    difficulty: "Beginner",
  },
];

let shorthandMap: Record<string, ChordVoicing> | null = null;

import { parseChordLabel, pitchClassOfNote, normalizeNoteSpelling } from "../audio/chordNormalizer";

// Helper for dynamic barre chord transposition if explicit entry is not in database
function generateBarreVoicing(root: string, quality: string): ChordVoicing | undefined {
  const pc = pitchClassOfNote(root);
  if (pc === -1) return undefined;

  const normRoot = normalizeNoteSpelling(root);

  // A-shape (5th string root): root pc = 9 (A)
  const aFret = (pc - 9 + 12) % 12;
  // E-shape (6th string root): root pc = 4 (E)
  const eFret = (pc - 4 + 12) % 12;

  // Prefer 5th string root for C, Db, D, Eb; 6th string for F, F#, G, Ab, A, Bb, B
  const preferE = [5, 6, 7, 8, 9, 10, 11].includes(pc);

  if (quality === "maj" || quality === "major") {
    if (preferE) {
      return {
        id: `gen-${normRoot.toLowerCase()}-maj-barre-e`,
        name: `${normRoot} Major`,
        root: normRoot,
        quality: "Major",
        frets: [eFret, eFret + 2, eFret + 2, eFret + 1, eFret, eFret],
        barre: eFret > 0 ? { fret: eFret, fromString: 0, toString: 5 } : undefined,
        notes: [normRoot],
        cagedShape: "E",
        difficulty: "Intermediate",
      };
    } else {
      return {
        id: `gen-${normRoot.toLowerCase()}-maj-barre-a`,
        name: `${normRoot} Major`,
        root: normRoot,
        quality: "Major",
        frets: ["x", aFret, aFret + 2, aFret + 2, aFret + 2, aFret],
        barre: aFret > 0 ? { fret: aFret, fromString: 1, toString: 5 } : undefined,
        notes: [normRoot],
        cagedShape: "A",
        difficulty: "Intermediate",
      };
    }
  }

  if (quality === "min" || quality === "minor") {
    if (preferE) {
      return {
        id: `gen-${normRoot.toLowerCase()}-min-barre-e`,
        name: `${normRoot} Minor`,
        root: normRoot,
        quality: "Minor",
        frets: [eFret, eFret + 2, eFret + 2, eFret, eFret, eFret],
        barre: eFret > 0 ? { fret: eFret, fromString: 0, toString: 5 } : undefined,
        notes: [normRoot],
        cagedShape: "E",
        difficulty: "Intermediate",
      };
    } else {
      return {
        id: `gen-${normRoot.toLowerCase()}-min-barre-a`,
        name: `${normRoot} Minor`,
        root: normRoot,
        quality: "Minor",
        frets: ["x", aFret, aFret + 2, aFret + 2, aFret + 1, aFret],
        barre: aFret > 0 ? { fret: aFret, fromString: 1, toString: 5 } : undefined,
        notes: [normRoot],
        cagedShape: "A",
        difficulty: "Intermediate",
      };
    }
  }

  if (quality === "m7" || quality === "min7") {
    return {
      id: `gen-${normRoot.toLowerCase()}-min7`,
      name: `${normRoot} Minor 7th`,
      root: normRoot,
      quality: "min7",
      frets: ["x", aFret, aFret + 2, aFret, aFret + 1, aFret],
      barre: aFret > 0 ? { fret: aFret, fromString: 1, toString: 5 } : undefined,
      notes: [normRoot],
      difficulty: "Intermediate",
    };
  }

  if (quality === "7") {
    return {
      id: `gen-${normRoot.toLowerCase()}-7`,
      name: `${normRoot} Dominant 7th`,
      root: normRoot,
      quality: "7",
      frets: [eFret, eFret + 2, eFret, eFret + 1, eFret, eFret],
      barre: eFret > 0 ? { fret: eFret, fromString: 0, toString: 5 } : undefined,
      notes: [normRoot],
      difficulty: "Intermediate",
    };
  }

  if (quality === "maj7") {
    return {
      id: `gen-${normRoot.toLowerCase()}-maj7`,
      name: `${normRoot} Major 7th`,
      root: normRoot,
      quality: "maj7",
      frets: ["x", aFret, aFret + 2, aFret + 1, aFret + 2, aFret],
      barre: aFret > 0 ? { fret: aFret, fromString: 1, toString: 5 } : undefined,
      notes: [normRoot],
      difficulty: "Intermediate",
    };
  }

  if (quality === "5" || quality === "power") {
    if (preferE) {
      return {
        id: `gen-${normRoot.toLowerCase()}-5-e`,
        name: `${normRoot} Power Chord (5)`,
        root: normRoot,
        quality: "5",
        frets: [eFret, eFret + 2, eFret + 2, "x", "x", "x"],
        notes: [normRoot],
        difficulty: "Beginner",
      };
    } else {
      return {
        id: `gen-${normRoot.toLowerCase()}-5-a`,
        name: `${normRoot} Power Chord (5)`,
        root: normRoot,
        quality: "5",
        frets: ["x", aFret, aFret + 2, aFret + 2, "x", "x"],
        notes: [normRoot],
        difficulty: "Beginner",
      };
    }
  }

  if (quality === "sus4") {
    return {
      id: `gen-${normRoot.toLowerCase()}-sus4`,
      name: `${normRoot} Suspended 4th (sus4)`,
      root: normRoot,
      quality: "sus4",
      frets: ["x", aFret, aFret + 2, aFret + 2, aFret + 3, aFret],
      barre: aFret > 0 ? { fret: aFret, fromString: 1, toString: 5 } : undefined,
      notes: [normRoot],
      difficulty: "Intermediate",
    };
  }

  if (quality === "sus2") {
    return {
      id: `gen-${normRoot.toLowerCase()}-sus2`,
      name: `${normRoot} Suspended 2nd (sus2)`,
      root: normRoot,
      quality: "sus2",
      frets: ["x", aFret, aFret + 2, aFret + 2, aFret, aFret],
      barre: aFret > 0 ? { fret: aFret, fromString: 1, toString: 5 } : undefined,
      notes: [normRoot],
      difficulty: "Intermediate",
    };
  }

  if (quality === "add9") {
    return {
      id: `gen-${normRoot.toLowerCase()}-add9`,
      name: `${normRoot} Add 9 (add9)`,
      root: normRoot,
      quality: "add9",
      frets: ["x", aFret, aFret + 2, aFret + 2, aFret + 5, aFret],
      barre: aFret > 0 ? { fret: aFret, fromString: 1, toString: 5 } : undefined,
      notes: [normRoot],
      difficulty: "Advanced",
    };
  }

  if (quality === "dim" || quality === "dim7") {
    return {
      id: `gen-${normRoot.toLowerCase()}-dim7`,
      name: `${normRoot} Diminished 7th`,
      root: normRoot,
      quality: "dim7",
      frets: ["x", aFret, aFret + 1, aFret + 2, aFret + 1, "x"],
      notes: [normRoot],
      difficulty: "Advanced",
    };
  }

  if (quality === "aug") {
    return {
      id: `gen-${normRoot.toLowerCase()}-aug`,
      name: `${normRoot} Augmented`,
      root: normRoot,
      quality: "aug",
      frets: ["x", aFret, aFret + 3, aFret + 2, aFret + 2, "x"],
      notes: [normRoot],
      difficulty: "Intermediate",
    };
  }

  return undefined;
}

export function findChordByName(name: string): ChordVoicing | undefined {
  if (!name || typeof name !== "string") return undefined;
  const clean = name.trim();
  if (!clean) return undefined;

  // 1. Parse via chordNormalizer
  const norm = parseChordLabel(clean);
  if (!norm.isValid) return undefined;

  const targetRootPc = pitchClassOfNote(norm.root);

  // 2. Exact name or shorthand map lookup
  if (!shorthandMap) {
    shorthandMap = {};
    for (const c of CHORD_DATABASE) {
      const match = c.name.match(/\(([^)]+)\)/);
      if (match) {
        shorthandMap[match[1].toLowerCase()] = c;
      }
    }
  }

  const lowerClean = clean.toLowerCase();
  if (shorthandMap[lowerClean]) return shorthandMap[lowerClean];

  const exact = CHORD_DATABASE.find((c) => c.name.toLowerCase() === lowerClean);
  if (exact) return exact;

  // 3. Match by root pitch class and quality
  const targetQuality = norm.quality;
  const targetQualitySymbol = norm.qualitySymbol;

  // Search database for pitch class match + quality match
  const dbMatch = CHORD_DATABASE.find((c) => {
    const cRootPc = pitchClassOfNote(c.root);
    if (cRootPc !== targetRootPc) return false;

    const cQual = c.quality.toLowerCase();
    if (targetQuality === "maj" && (cQual === "major" || cQual === "maj" || cQual === "")) return true;
    if (targetQuality === "min" && (cQual === "minor" || cQual === "min" || cQual === "m")) return true;
    if (targetQuality === "m7" && (cQual === "min7" || cQual === "m7")) return true;
    if (targetQuality === "maj7" && (cQual === "maj7" || cQual === "m7_maj")) return true;
    if (targetQuality === "7" && cQual === "7") return true;
    if (targetQuality === "sus2" && cQual === "sus2") return true;
    if (targetQuality === "sus4" && cQual === "sus4") return true;
    if (targetQuality === "add9" && cQual === "add9") return true;
    if (targetQuality === "5" && (cQual === "5" || cQual === "power")) return true;

    return cQual === targetQualitySymbol;
  });

  if (dbMatch) return dbMatch;

  // 4. Generate barre chord if not explicitly in CHORD_DATABASE
  return generateBarreVoicing(norm.root, norm.quality);
}

export function getChordsByRoot(root: string): ChordVoicing[] {
  const pc = pitchClassOfNote(root);
  if (pc === -1) return [];
  return CHORD_DATABASE.filter((c) => pitchClassOfNote(c.root) === pc);
}
