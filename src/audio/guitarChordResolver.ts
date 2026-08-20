// Dedicated Guitar Diagram Resolver for JOE-Music
// Separates raw acoustic detection from guitarist playability & voicing confidence.

import { ChordVoicing } from "../types";
import { findChordByName } from "../data/chordDatabase";
import { parseChordLabel, normalizeChord, NormalizedChord, RawChordHypothesis } from "./chordNormalizer";

export interface GuitarVoicingResult {
  detectedChord: string;        // e.g. "Cm7/Bb"
  displayChord: string;         // e.g. "Cm7/Bb" (exact) or "Cm7" (simplified)
  voicing: ChordVoicing | null;  // The guitar voicing object or null if none
  voicingType: "exact" | "simplified" | "none";
  detectionConfidence: number;  // Acoustic detection confidence (e.g. 87%)
  voicingConfidence: number;    // Playability confidence (e.g. 98% exact, 80% simplified, 0% none)
  bassNote?: string;            // e.g. "Bb"
  hasExactSlashVoicing: boolean;
  simplificationReason?: string;
}

export interface ResolveOptions {
  keyContext?: string;
  detectionConfidence?: number;
  simplifyIfUnavailable?: boolean;
}

/**
 * Resolves a canonical chord into a playable guitar voicing with fallback simplification.
 * Does NOT invent fret positions or display incorrect diagrams.
 */
export function resolveGuitarChord(
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

  // 1. Invalid chord safety
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

  // 2. Exact match attempt for full label (including slash bass if present)
  const exactVoicing = findChordByName(detectedLabel);
  if (exactVoicing) {
    return {
      detectedChord: detectedLabel,
      displayChord: detectedLabel,
      voicing: exactVoicing,
      voicingType: "exact",
      detectionConfidence: detectConf,
      voicingConfidence: 98,
      bassNote: norm.bass,
      hasExactSlashVoicing: !!norm.bass,
    };
  }

  // 3. Slash chord simplification rule:
  // If detected chord has a slash bass (e.g. Cm7/Bb), attempt base chord lookup (Cm7)
  if (norm.bass) {
    const baseLabel = `${norm.root}${norm.qualitySymbol}`;
    const baseVoicing = findChordByName(baseLabel);

    if (baseVoicing) {
      return {
        detectedChord: detectedLabel,
        displayChord: baseLabel,
        voicing: baseVoicing,
        voicingType: "simplified",
        detectionConfidence: detectConf,
        voicingConfidence: 85,
        bassNote: norm.bass,
        hasExactSlashVoicing: false,
        simplificationReason: `Simplified ${detectedLabel} to ${baseLabel} (Detected bass: ${norm.bass})`
      };
    }
  }

  // 4. Complex quality simplification fallback:
  // e.g. m9 -> m7 -> min; maj9 -> maj7 -> maj
  const fallbackQualities: Record<string, string[]> = {
    m9: ["m7", "m"],
    maj9: ["maj7", ""],
    "9": ["7", ""],
    "11": ["7", ""],
    "13": ["7", ""],
    min7b5: ["dim", "m"],
    dim7: ["dim", "m"],
    m6: ["m"],
    add9: [""]
  };

  const candidates = fallbackQualities[norm.qualitySymbol] || [];
  for (const fallbackSymbol of candidates) {
    const candidateLabel = `${norm.root}${fallbackSymbol}`;
    const candidateVoicing = findChordByName(candidateLabel);
    if (candidateVoicing) {
      return {
        detectedChord: detectedLabel,
        displayChord: candidateLabel,
        voicing: candidateVoicing,
        voicingType: "simplified",
        detectionConfidence: detectConf,
        voicingConfidence: 75,
        bassNote: norm.bass,
        hasExactSlashVoicing: false,
        simplificationReason: `Simplified complex voicing ${detectedLabel} to ${candidateLabel}`
      };
    }
  }

  // 5. Unresolved: No safe guitar voicing available
  return {
    detectedChord: detectedLabel,
    displayChord: detectedLabel,
    voicing: null,
    voicingType: "none",
    detectionConfidence: detectConf,
    voicingConfidence: 0,
    bassNote: norm.bass,
    hasExactSlashVoicing: false,
    simplificationReason: "No safe guitar voicing available in dictionary"
  };
}
