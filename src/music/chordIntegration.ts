import { parseChordSymbol } from "./chordParser";
import { generateVoicings, GeneratedVoicing } from "./chordVoicingGenerator";
import { buildChord, ALL_SUPPORTED_QUALITIES } from "./chordTheory";
import { ChordVoicing } from "../types";

export const ALIAS_MAP: Record<string, string> = {
  "All": "",
  "Major": "maj",
  "Minor": "min",
  "maj": "maj",
  "min": "min",
  "5": "5",
  "dim": "dim",
  "aug": "aug",
  "sus2": "sus2",
  "sus4": "sus4",
  "6": "6",
  "m6": "m6",
  "7": "7",
  "maj7": "maj7",
  "m7": "m7",
  "min7": "m7",
  "dim7": "dim7",
  "m7b5": "m7b5",
  "min7b5": "m7b5",
  "add9": "add9",
  "9": "9",
  "m9": "m9",
  "maj9": "maj9",
  "11": "11",
  "m11": "m11",
  "13": "13",
};

export function getChordsForDictionary(
  rootName: string, 
  qualityName: string, 
  caged: string,
  searchQuery: string
): ChordVoicing[] {
  let voicingsToGenerate: {root: string, quality: string, alias: string}[] = [];
  
  if (searchQuery) {
    const parse = parseChordSymbol(searchQuery);
    if (parse.isValid && parse.chord) {
      voicingsToGenerate.push({
        root: parse.chord.rootName,
        quality: parse.chord.quality,
        alias: parse.chord.quality
      });
    } else {
      return [];
    }
  } else {
    const roots = rootName === "All" ? ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"] : [rootName];
    const qualities = qualityName === "All" 
      ? ALL_SUPPORTED_QUALITIES
      : [qualityName];
      
    for (const r of roots) {
      for (const q of qualities) {
        voicingsToGenerate.push({
          root: r,
          quality: q,
          alias: ALIAS_MAP[q] || q
        });
      }
    }
  }

  const results: ChordVoicing[] = [];
  
  for (const t of voicingsToGenerate) {
    try {
      const def = buildChord(t.root, t.alias);
      const generated = generateVoicings(def, { maxFret: 15 });
      
      let index = 1;
      const seenFretKeys = new Set<string>();

      for (const g of generated) {
        if (caged !== "ALL" && g.cagedShape !== caged) continue;
        
        const fretKey = g.frets.join(",");
        if (seenFretKeys.has(fretKey)) continue;
        seenFretKeys.add(fretKey);

        const cagedSuffix = g.cagedShape ? ` [${g.cagedShape}-Shape]` : "";
        const nameLabel = `${t.root}${def.bassName ? '/' + def.bassName : ''} ${t.quality}${cagedSuffix}`;

        results.push({
          id: `${t.root}-${t.alias}-${index}-${fretKey}`,
          name: nameLabel,
          root: t.root,
          quality: t.quality,
          frets: g.frets,
          fingers: g.fingers,
          barre: g.barre,
          baseFret: g.baseFret,
          notes: g.notes,
          intervals: g.intervals,
          cagedShape: g.cagedShape,
          voicingType: g.type,
          difficulty: g.baseFret <= 3 ? "Beginner" : g.barre ? "Intermediate" : "Advanced"
        });

        index++;
        if (index > 5) break; // Take top 5 distinct, highest ranked voicings
      }
    } catch (e) {
      console.warn("Failed to generate chord:", t);
    }
  }
  
  return results;
}
