/** Independent SMF reader for assertions on the emitted wire format. */
export function readMidiEvents(bytes: Uint8Array) {
  let position = 22,
    tick = 0;
  const events: { tick: number; status: number; midi: number; velocity: number }[] = [];
  const variable = () => {
    let value = 0,
      byte: number;
    do {
      byte = bytes[position++]!;
      value = value * 128 + (byte & 127);
    } while (byte & 128);
    return value;
  };
  while (position < bytes.length) {
    tick += variable();
    const status = bytes[position++]!;
    if (status === 255) {
      position++;
      const length = variable();
      position += length;
    } else if ((status & 0xf0) === 0xc0) {
      position++;
    } else {
      events.push({ tick, status, midi: bytes[position++]!, velocity: bytes[position++]! });
    }
  }
  return events;
}
