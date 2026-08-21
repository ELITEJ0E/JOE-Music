import { buildChord, ChordDefinition, QUALITY_ALIASES } from "./chordTheory";

// Regex to parse a chord symbol
// Examples: C, Cm, C#m7, Bbmaj7, F#m7b5/E, C/G, Aadd9
const CHORD_REGEX = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

export interface ParseResult {
  isValid: boolean;
  chord?: ChordDefinition;
  symbol?: string;
}

export function parseChordSymbol(symbol: string): ParseResult {
  const match = symbol.trim().match(CHORD_REGEX);
  if (!match) return { isValid: false };

  const rootName = match[1];
  const qualityAlias = match[2].trim();
  const bassName = match[3];

  if (qualityAlias !== "" && !(qualityAlias in QUALITY_ALIASES)) {
    return { isValid: false };
  }

  try {
    const chord = buildChord(rootName, qualityAlias, bassName);
    const formattedSymbol = chord.bassName 
      ? `${chord.rootName}${qualityAlias}/${chord.bassName}`
      : symbol.trim();
    return { isValid: true, chord, symbol: formattedSymbol };
  } catch (e) {
    return { isValid: false };
  }
}
