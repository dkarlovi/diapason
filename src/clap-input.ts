import { ensureAudioWorklet } from "./audio-worklet";
const SOURCE = `
class ClapInput extends AudioWorkletProcessor {
  constructor() {
    super(); this.active = true; this.buffer = new Float32Array(2048); this.offset = 0; this.start = 0;
    this.port.onmessage = () => { this.active = false; };
  }
  process(inputs) {
    if (!this.active) return false;
    const samples = inputs[0] && inputs[0][0];
    if (samples) for (let i = 0; i < samples.length; i++) {
      if (!this.offset) this.start = currentTime + i/sampleRate;
      this.buffer[this.offset++] = samples[i];
      if (this.offset === this.buffer.length) {
        this.port.postMessage({ samples: this.buffer, start: this.start }); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('diapason-clap-input', ClapInput);
`;
export async function subscribePcm(
  ctx: AudioContext,
  source: AudioNode,
  listener: (samples: Float32Array, startSec: number) => void,
): Promise<() => void> {
  await ensureAudioWorklet(ctx, "clap-input", SOURCE);
  if (ctx.state === "closed") throw new Error("Microphone is closed");
  const node = new AudioWorkletNode(ctx, "diapason-clap-input", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  });
  let stopped = false;
  node.port.onmessage = (event: MessageEvent<{ samples: Float32Array; start: number }>) => {
    if (!stopped) listener(event.data.samples, event.data.start);
  };
  source.connect(node);
  return () => {
    if (stopped) return;
    stopped = true;
    node.port.onmessage = null;
    node.port.postMessage("stop");
    source.disconnect(node);
    node.disconnect();
    node.port.close();
  };
}
