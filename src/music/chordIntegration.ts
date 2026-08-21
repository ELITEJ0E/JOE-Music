import { parseChordSymbol } from "./chordParser";
import { generateVoicings, GeneratedVoicing } from "./chordVoicingGenerator";
import { buildChord } from "./chordTheory";
import { ChordVoicing } from "../types";

const ALIAS_MAP: Record<string, string> = {
  "All": "",
  "Major": "maj",
  "Minor": "min",
  "7": "7",
  "maj7": "maj7",
  "min7": "m7",
  "sus4": "sus4",
  "sus2": "sus2",
  "add9": "add9",
  "dim7": "dim7",
  "min7b5": "m7b5",
  "aug": "aug",
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
      // maybe search by name? we don't have static list anymore.
      // just generate basic ones if no valid symbol
      return [];
    }
  } else {
    const roots = rootName === "All" ? ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"] : [rootName];
    const qualities = qualityName === "All" 
      ? ["Major", "Minor", "7", "maj7", "min7", "sus4", "add9", "dim7"]
      : [qualityName];
      
    for (const r of roots) {
      for (const q of qualities) {
        voicingsToGenerate.push({
          root: r,
          quality: q,
          alias: ALIAS_MAP[q] || "maj"
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
      for (const g of generated) {
        if (caged !== "ALL" && g.cagedShape !== caged) continue;
        
        results.push({
          id: `${t.root}-${t.alias}-${index}`,
          name: `${t.root} ${t.quality} (Var ${index})`,
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
          difficulty: g.type === "exact" ? "Intermediate" : "Beginner" // simplistic
        });
        index++;
        if (index > 5) break; // Limit to 5 variations per chord type
      }
    } catch (e) {
      console.warn("Failed to generate chord:", t);
    }
  }
  
  return results;
}
