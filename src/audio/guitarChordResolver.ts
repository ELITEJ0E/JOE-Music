// Dedicated Guitar Diagram Resolver for JOE-Music
// Separates raw acoustic detection from guitarist playability & voicing confidence.

import { ChordVoicing } from "../types";
import { parseChordLabel, normalizeChord, NormalizedChord, RawChordHypothesis } from "./chordNormalizer";
import { resolvePowerChord } from "./powerChordResolver";
import { parseChordSymbol } from "../music/chordParser";
import { generateVoicings, PlayabilityMode } from "../music/chordVoicingGenerator";

export interface GuitarVoicingResult {
  detectedChord: string;        // e.g. "Cm7/Bb" or "B5"
  displayChord: string;         // Canonical playable shape chord symbol (e.g. "Bm7")
  playableShapeChord?: string;  // Canonical playable shape chord (e.g. "Bm7")
  voicing: ChordVoicing | null;  // The guitar voicing object or null if none
  voicingType: "exact" | "simplified" | "generated" | "none";
  detectionConfidence: number;  // Acoustic detection confidence (e.g. 87%)
  voicingConfidence: number;    // Playability confidence (e.g. 98% exact, 90% generated, 80% simplified, 0% none)
  bassNote?: string;            // e.g. "Bb" (present ONLY if original chord contains slash bass)
  hasExactSlashVoicing: boolean;
  simplificationReason?: string;
  availableVoicingsCount?: number;
  allVoicings?: ChordVoicing[];
  selectedVoicingIndex?: number;
  playabilityMode?: PlayabilityMode;
  voicingDescription?: string;
  capo?: number;
}

export interface ResolveOptions {
  keyContext?: string;
  detectionConfidence?: number;
  simplifyIfUnavailable?: boolean;
  voicingIndex?: number; // 1-indexed voicing selector
  playabilityMode?: PlayabilityMode;
  capo?: number;
  detectedChord?: string;
}

export function resolveGuitarChord(
  input: string | NormalizedChord | RawChordHypothesis,
  options: ResolveOptions = {}
): GuitarVoicingResult {
  const detectConf = options.detectionConfidence ?? 90;
  const keyCtx = options.keyContext;
  const requestedVoicingIdx = options.voicingIndex ?? 1;

  let norm: NormalizedChord;
  if (typeof input === "string") {
    norm = parseChordLabel(input, keyCtx);
  } else if ("canonicalLabel" in input) {
    norm = input as NormalizedChord;
  } else {
    norm = normalizeChord(input as RawChordHypothesis, keyCtx);
  }

  // Canonical Play Shape Chord (the target physical chord symbol to finger on the fretboard)
  const canonicalPlayShape = norm.canonicalLabel;

  // Authoritative raw detected chord label (sounding chord from MIR, e.g. "C#m7")
  const authoritativeDetectedChord = options.detectedChord || canonicalPlayShape;

  // 1. Invalid chord safety
  if (!norm.isValid || !norm.root) {
    return {
      detectedChord: authoritativeDetectedChord || "Unknown chord",
      displayChord: "Unknown chord",
      playableShapeChord: "Unknown chord",
      voicing: null,
      voicingType: "none",
      detectionConfidence: 0,
      voicingConfidence: 0,
      hasExactSlashVoicing: false,
      simplificationReason: "Invalid or malformed chord specification",
      availableVoicingsCount: 0,
      allVoicings: [],
      selectedVoicingIndex: 1
    };
  }

  const detectedLabel = canonicalPlayShape;
  
  // Use procedural parser
  const parsed = parseChordSymbol(detectedLabel);
  
  if (!parsed.isValid || !parsed.chord) {
    return {
      detectedChord: authoritativeDetectedChord,
      displayChord: detectedLabel,
      playableShapeChord: detectedLabel,
      voicing: null,
      voicingType: "none",
      detectionConfidence: detectConf,
      voicingConfidence: 0,
      hasExactSlashVoicing: false,
      simplificationReason: "Unsupported chord symbol",
      availableVoicingsCount: 0,
      allVoicings: [],
      selectedVoicingIndex: 1
    };
  }
  
  // Power chords handling
  if (parsed.chord.quality === "5") {
      const pVoicing = resolvePowerChord(parsed.chord.rootName, parsed.chord.bassName);
      if (pVoicing) {
         return {
           detectedChord: authoritativeDetectedChord,
           displayChord: detectedLabel,
           playableShapeChord: detectedLabel,
           voicing: pVoicing,
           voicingType: "generated",
           detectionConfidence: detectConf,
           voicingConfidence: 90,
           hasExactSlashVoicing: false,
           bassNote: parsed.chord.bassName,
           availableVoicingsCount: 1,
           allVoicings: [pVoicing],
           selectedVoicingIndex: 1
         };
      }
  }

  // Generate procedural voicings for canonical play shape
  const generated = generateVoicings(parsed.chord, {
    maxFretSpan: 4,
    maxFret: 15,
    playabilityMode: options.playabilityMode,
    capo: options.capo,
  });
  
  if (generated.length > 0) {
    const allVoicings: ChordVoicing[] = generated.map((g, idx) => ({
      id: `procedural-${detectedLabel}-${idx + 1}`,
      name: detectedLabel,
      root: parsed.chord.rootName,
      quality: parsed.chord.quality,
      frets: g.frets,
      fingers: g.fingers,
      barre: g.barre,
      baseFret: g.baseFret,
      notes: g.notes,
      intervals: g.intervals,
      cagedShape: g.cagedShape,
      voicingType: g.type,
      difficulty: g.type === "exact" ? (g.baseFret <= 3 ? "Beginner" : "Intermediate") : "Beginner"
    }));

    const clampedIdx = Math.max(1, Math.min(requestedVoicingIdx, allVoicings.length));
    const selectedVoicing = allVoicings[clampedIdx - 1];
    const selectedGen = generated[clampedIdx - 1];
    
    return {
      detectedChord: authoritativeDetectedChord,
      displayChord: detectedLabel,
      playableShapeChord: detectedLabel,
      voicing: selectedVoicing,
      voicingType: selectedGen.type,
      detectionConfidence: detectConf,
      voicingConfidence: selectedGen.type === "exact" ? 95 : 70,
      bassNote: parsed.chord.bassName,
      hasExactSlashVoicing: parsed.chord.bass !== undefined && selectedGen.type === "exact",
      simplificationReason: selectedGen.type === "simplified" ? "Simplified voicing used" : undefined,
      availableVoicingsCount: allVoicings.length,
      allVoicings,
      selectedVoicingIndex: clampedIdx,
      playabilityMode: options.playabilityMode || "standard",
      voicingDescription: selectedGen.description,
      capo: options.capo
    };
  }
  
  return {
    detectedChord: authoritativeDetectedChord,
    displayChord: detectedLabel,
    playableShapeChord: detectedLabel,
    voicing: null,
    voicingType: "none",
    detectionConfidence: detectConf,
    voicingConfidence: 0,
    hasExactSlashVoicing: false,
    bassNote: parsed.chord.bassName,
    simplificationReason: "No playable voicing found",
    availableVoicingsCount: 0,
    allVoicings: [],
    selectedVoicingIndex: 1
  };
}
