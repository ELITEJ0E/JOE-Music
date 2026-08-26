import { GuitarVoicingResult, ResolveOptions } from "../audio/guitarChordResolver";
import { parseChordLabel, NormalizedChord, RawChordHypothesis, normalizeChord } from "../audio/chordNormalizer";
import { parseChordSymbol } from "./chordParser";
import { generateVoicings, GeneratedVoicing } from "./chordVoicingGenerator";
import { buildChord } from "./chordTheory";
import { ChordVoicing } from "../types";
import { resolvePowerChord } from "../audio/powerChordResolver";

export function resolveGuitarChordProcedural(
  input: string | NormalizedChord | RawChordHypothesis,
  options: ResolveOptions = {}
): GuitarVoicingResult {
  const detectConf = options.detectionConfidence ?? 90;
  const keyCtx = options.keyContext;

  let norm: NormalizedChord;
  if (typeof input === "string") {
    norm = parseChordLabel(input, keyCtx);
  } else if ("canonicalLabel" in input) {
    norm = input as NormalizedChord;
  } else {
    norm = normalizeChord(input as RawChordHypothesis, keyCtx);
  }

  if (!norm.isValid || !norm.root) {
    return {
      detectedChord: "Unknown chord",
      displayChord: "Unknown chord",
      voicing: null,
      voicingType: "none",
      detectionConfidence: 0,
      voicingConfidence: 0,
      hasExactSlashVoicing: false,
      simplificationReason: "Invalid or malformed chord specification"
    };
  }

  const detectedLabel = norm.canonicalLabel;
  const parsed = parseChordSymbol(detectedLabel);
  
  if (!parsed.isValid || !parsed.chord) {
    return {
      detectedChord: detectedLabel,
      displayChord: detectedLabel,
      voicing: null,
      voicingType: "none",
      detectionConfidence: detectConf,
      voicingConfidence: 0,
      hasExactSlashVoicing: false,
      simplificationReason: "Unsupported chord symbol"
    };
  }
  
  // Power chords
  if (parsed.chord.quality === "5") {
      const pVoicing = resolvePowerChord(parsed.chord.rootName);
      if (pVoicing) {
         return {
           detectedChord: detectedLabel,
           displayChord: detectedLabel,
           voicing: pVoicing,
           voicingType: "generated",
           detectionConfidence: detectConf,
           voicingConfidence: 90,
           hasExactSlashVoicing: false
         };
      }
  }

  const generated = generateVoicings(parsed.chord, { maxFretSpan: 4, maxFret: 15 });
  
  if (generated.length > 0) {
    const best = generated[0];
    const voicing: ChordVoicing = {
      id: "procedural-" + detectedLabel,
      name: detectedLabel,
      root: parsed.chord.rootName,
      quality: parsed.chord.quality,
      frets: best.frets,
      fingers: best.fingers,
      barre: best.barre,
      baseFret: best.baseFret,
      notes: best.notes,
      intervals: best.intervals,
      cagedShape: best.cagedShape,
      voicingType: best.type,
      difficulty: best.type === "exact" ? "Intermediate" : "Beginner"
    };
    
    return {
      detectedChord: detectedLabel,
      displayChord: detectedLabel,
      playableShapeChord: detectedLabel,
      voicing,
      voicingType: best.type,
      detectionConfidence: detectConf,
      voicingConfidence: best.type === "exact" ? 95 : 70,
      hasExactSlashVoicing: parsed.chord.bass !== undefined && best.type === "exact",
      simplificationReason: best.type === "simplified" ? "Simplified voicing used" : undefined
    };
  }
  
  return {
    detectedChord: detectedLabel,
    displayChord: detectedLabel,
    voicing: null,
    voicingType: "none",
    detectionConfidence: detectConf,
    voicingConfidence: 0,
    hasExactSlashVoicing: false,
    simplificationReason: "No playable voicing found"
  };
}
