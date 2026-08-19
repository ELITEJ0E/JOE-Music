import { GuitarTuning } from "../types";

export const GUITAR_TUNINGS: GuitarTuning[] = [
  {
    name: "Standard (EADGBE)",
    notes: ["E2", "A2", "D3", "G3", "B3", "E4"],
    frequencies: [82.41, 110.0, 146.83, 196.0, 246.94, 329.63],
    description: "The universal reference guitar tuning for classical, rock, acoustic, jazz, and pop.",
  },
  {
    name: "Drop D (DADGBE)",
    notes: ["D2", "A2", "D3", "G3", "B3", "E4"],
    frequencies: [73.42, 110.0, 146.83, 196.0, 246.94, 329.63],
    description: "Low E string tuned down 1 full step to D. Perfect for heavy rock riffs and one-finger power chords.",
  },
  {
    name: "DADGAD (Celtic)",
    notes: ["D2", "A2", "D3", "G3", "A3", "D4"],
    frequencies: [73.42, 110.0, 146.83, 196.0, 220.0, 293.66],
    description: "Modal Celtic and fingerstyle tuning popular with Jimmy Page, Pierre Bensusan, and Andy McKee.",
  },
  {
    name: "Open D (DADF#AD)",
    notes: ["D2", "A2", "D3", "F#3", "A3", "D4"],
    frequencies: [73.42, 110.0, 146.83, 185.0, 220.0, 293.66],
    description: "Strummed open it sounds a full D major chord. Ideal for slide guitar and Delta blues.",
  },
  {
    name: "Open G (DGDGBD)",
    notes: ["D2", "G2", "D3", "G3", "B3", "D4"],
    frequencies: [73.42, 98.0, 146.83, 196.0, 246.94, 293.66],
    description: "Keith Richards / Rolling Stones signature tuning. Resonant open G major triad.",
  },
  {
    name: "Open E (EBEG#BE)",
    notes: ["E2", "B2", "E3", "G#3", "B3", "E4"],
    frequencies: [82.41, 123.47, 164.81, 207.65, 246.94, 329.63],
    description: "Duane Allman & Derek Trucks slide guitar powerhouse open tuning.",
  },
  {
    name: "Half-Step Down (Eb Ab Db Gb Bb Eb)",
    notes: ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
    frequencies: [77.78, 103.83, 138.59, 185.0, 233.08, 311.13],
    description: "Jimi Hendrix, Stevie Ray Vaughan, Guns N' Roses, and Nirvana standard down-tuning.",
  },
  {
    name: "Full-Step Down (D G C F A D)",
    notes: ["D2", "G2", "C3", "F3", "A3", "D4"],
    frequencies: [73.42, 98.0, 130.81, 174.61, 220.0, 293.66],
    description: "D Standard tuning with lower string tension, deeper resonance, and warm vocal accompaniment.",
  },
  {
    name: "Drop C (CGCFAD)",
    notes: ["C2", "G2", "C3", "F3", "A3", "D4"],
    frequencies: [65.41, 98.0, 130.81, 174.61, 220.0, 293.66],
    description: "Low-end metal and modern hardcore tuning with thunderous drop-C bass response.",
  },
  {
    name: "B Standard / 7-String (BEADGBE)",
    notes: ["B1", "E2", "A2", "D3", "G3", "B3", "E4"],
    frequencies: [61.74, 82.41, 110.0, 146.83, 196.0, 246.94, 329.63],
    description: "Extended range 7-string tuning with low B sub-fundamental.",
  },
];
