export interface Playback {
  /** Seconds into the recording, or null once finished/stopped. */
  position(): number | null;
  stop(): void;
}
