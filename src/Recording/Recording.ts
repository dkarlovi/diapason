import type { Recording, AudioRecording } from "./Recording.type";

export function isAudioRecording(record: Recording): record is AudioRecording {
  return record.noteSource === undefined;
}
