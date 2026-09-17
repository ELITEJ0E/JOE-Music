// Analysis algorithm version tracking for JOE-Music
// Bump this version whenever the MIR detection, Viterbi HMM, or stabilization algorithms change.

export const CURRENT_ANALYSIS_VERSION = "2.0.0";

/**
 * Checks whether an existing saved analysis matches the current MIR algorithm version.
 */
export function isAnalysisVersionCurrent(version?: string): boolean {
  if (!version) return false;
  return version === CURRENT_ANALYSIS_VERSION;
}

/**
 * Determines whether a song's chord analysis should be re-run because
 * it was analyzed with an older version or lacks versioning metadata.
 */
export function needsReanalysis(song: { analysisVersion?: string; chordSegments?: unknown[] }): boolean {
  if (!song) return true;
  if (!song.chordSegments || song.chordSegments.length === 0) return true;
  if (!song.analysisVersion) return true;
  return song.analysisVersion !== CURRENT_ANALYSIS_VERSION;
}
