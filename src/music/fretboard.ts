import { PitchClass } from "./chordTheory";

export const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40]; // 1st to 6th string
// Actually, it's easier to order 6th string to 1st string for [E, A, D, G, B, E]
// But the ChordVoicing type expects frets: [6th, 5th, 4th, 3rd, 2nd, 1st]
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

export function getMidiNote(stringIdx: number, fret: number, tuning = STANDARD_TUNING): number {
  return tuning[stringIdx] + fret;
}

export function getPitchClassFromMidi(midi: number): PitchClass {
  return midi % 12;
}

export function getStringPitchClass(stringIdx: number, fret: number, tuning = STANDARD_TUNING): PitchClass {
  return getMidiNote(stringIdx, fret, tuning) % 12;
}
