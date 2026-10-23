const MIN_BPM = 40;
const MAX_BPM = 220;
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
export function estimateTempo(eventsSec: number[]): {
  bpm: number | null;
  stable: boolean;
  eventCount: number;
} {
  let events: number[] = [];
  for (const event of eventsSec) {
    if (!Number.isFinite(event) || (events.length && event <= events.at(-1)!)) continue;
    if (events.length && event - events.at(-1)! > 2) events = [];
    events.push(event);
  }
  events = events.slice(-9);
  const intervals = events.slice(1).map((t, i) => t - events[i]!);
  const valid = intervals.filter(
    (interval) => interval >= 60 / MAX_BPM - 1e-8 && interval <= 60 / MIN_BPM + 1e-8,
  );
  const interval = median(valid);
  const bpm = interval ? Math.round(60 / interval) : null;
  const stable =
    events.length >= 5 &&
    valid.length === intervals.length &&
    interval > 0 &&
    median(valid.map((value) => Math.abs(value - interval))) / interval <= 0.15;
  return { bpm, stable, eventCount: events.length };
}
export function adjustTempo(bpm: number, factor: 0.5 | 2): number | null {
  const value = Math.round(bpm * factor);
  return Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM ? value : null;
}
