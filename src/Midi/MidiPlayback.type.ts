export type MidiSink = Pick<MIDIOutput, "send"> & { clear?: () => void };
