/** Position within a note (0–1), and semitones relative to its target pitch. */
export interface PitchPoint {
  position: number;
  offset: number;
}

export interface NoteBend {
  points: PitchPoint[];
  glide: number;
}
