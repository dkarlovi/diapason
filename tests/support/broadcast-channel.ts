// Node's BroadcastChannel reaches every worker thread, so parallel test files would hear each other.
const channels = new Map<string, Set<LocalBroadcastChannel>>();

class LocalBroadcastChannel extends EventTarget {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(readonly name: string) {
    super();
    const peers = channels.get(name) ?? new Set();
    peers.add(this);
    channels.set(name, peers);
  }
  postMessage(data: unknown): void {
    const message = structuredClone(data);
    for (const peer of channels.get(this.name) ?? [])
      if (peer !== this)
        setTimeout(() => {
          if (!channels.get(peer.name)?.has(peer)) return;
          const event = new MessageEvent("message", { data: message });
          peer.onmessage?.(event);
          peer.dispatchEvent(event);
        });
  }
  close(): void {
    channels.get(this.name)?.delete(this);
  }
}
globalThis.BroadcastChannel = LocalBroadcastChannel as unknown as typeof BroadcastChannel;
export {};
