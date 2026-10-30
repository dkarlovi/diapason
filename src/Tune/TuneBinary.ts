/** Bounded arithmetic varints avoid JavaScript's signed 32-bit bitwise truncation. */
export class TuneWriter {
  private bytes: number[] = [];
  byte(value: number) {
    this.bytes.push(value);
  }
  uint(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid packed integer");
    do {
      const part = value % 128;
      value = Math.floor(value / 128);
      this.byte(part + (value ? 128 : 0));
    } while (value);
  }
  float(value: number) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, value, true);
    this.bytes.push(...b);
  }
  text(value: string) {
    const b = new TextEncoder().encode(value);
    this.uint(b.length);
    this.bytes.push(...b);
  }
  finish() {
    return Uint8Array.from(this.bytes);
  }
}
export class TuneReader {
  private position = 0;
  constructor(private bytes: Uint8Array) {}
  byte(): number {
    if (this.position >= this.bytes.length) throw new Error("Truncated tune");
    return this.bytes[this.position++]!;
  }
  uint(): number {
    let value = 0,
      factor = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.byte();
      value += (b % 128) * factor;
      if (!Number.isSafeInteger(value)) break;
      if (b < 128) {
        if (i && b === 0) throw new Error("Noncanonical integer");
        return value;
      }
      factor *= 128;
    }
    throw new Error("Packed integer overflow");
  }
  float(): number {
    const b = Uint8Array.from({ length: 8 }, () => this.byte());
    const value = new DataView(b.buffer).getFloat64(0, true);
    if (!Number.isFinite(value)) throw new Error("Invalid packed number");
    return value;
  }
  text(max: number): string {
    const len = this.uint();
    if (len > max || len > this.bytes.length - this.position)
      throw new Error("Tune string too large");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from({ length: len }, () => this.byte()),
    );
  }
  end() {
    if (this.position !== this.bytes.length) throw new Error("Trailing tune data");
  }
}
