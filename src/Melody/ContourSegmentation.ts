import { medianPitch } from "./PitchStatistics";
import type { ContourPart } from "./ContourSegmentation.type";
import type { PitchPoint } from "./PitchCurve.type";

function stableRegions(pitch: number[], length: number, tolerance: number): ContourPart[] {
  const regions: (ContourPart & { spread: number })[] = [];
  for (let start = 0; start + length <= pitch.length; start++) {
    const window = pitch.slice(start, start + length);
    const spread = Math.max(...window) - Math.min(...window);
    if (spread > tolerance) continue;
    const previous = regions.at(-1);
    if (previous && start < previous.end) {
      if (start < previous.start + length && spread < previous.spread) {
        previous.pitch = medianPitch(window);
        previous.spread = spread;
      }
      previous.end = start + length;
    } else regions.push({ start, end: start + length, pitch: medianPitch(window), spread });
  }
  return regions;
}

function nearbyRegions(regions: ContourPart[], steadiness: number): ContourPart[] {
  const result: ContourPart[] = [];
  for (const region of regions) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.pitch - region.pitch) < 0.45 + 0.25 * steadiness)
      previous.end = region.end;
    else result.push({ ...region });
  }
  return result;
}

function periodicMovement(regions: ContourPart[], steadiness: number): boolean {
  if (regions.length < 5 || steadiness === 0) return false;
  const pitches = regions.map((region) => region.pitch);
  if (Math.max(...pitches) - Math.min(...pitches) > 1 + 2 * steadiness) return false;
  let reversals = 0;
  for (let i = 2; i < regions.length; i++)
    if ((pitches[i]! - pitches[i - 1]!) * (pitches[i - 1]! - pitches[i - 2]!) < 0) reversals++;
  return reversals >= 3;
}

function stabilityTolerance(pitch: number[], length: number, steadiness: number): number {
  const tolerance = 0.08 + 0.2 * steadiness;
  const distance = Math.abs(pitch.at(-1)! - pitch[0]!);
  const travel = pitch.slice(1).reduce((sum, value, i) => sum + Math.abs(value - pitch[i]!), 0);
  if (distance <= 0.4 + 2 * steadiness || distance <= travel * 0.8) return tolerance;
  // A broad monotonic slide can look stable in every short window. Plateaus vary
  // more slowly than the traversal itself, even when the traversal takes seconds.
  return Math.min(tolerance, (distance * (length - 1)) / (pitch.length - 1) / 2);
}

export function findContourParts(
  pitch: number[],
  minLength: number,
  steadiness: number,
): ContourPart[] {
  if (!pitch.length) return [];
  const length = Math.min(pitch.length, Math.max(2, minLength));
  const tolerance = stabilityTolerance(pitch, length, steadiness);
  const regions = nearbyRegions(stableRegions(pitch, length, tolerance), steadiness);
  if (periodicMovement(regions, steadiness))
    return [{ start: 0, end: pitch.length, pitch: medianPitch(pitch) }];
  if (!regions.length) {
    const range = Math.max(...pitch) - Math.min(...pitch);
    const first = medianPitch(pitch.slice(0, length));
    const last = medianPitch(pitch.slice(-length));
    const travel = pitch.slice(1).reduce((sum, value, i) => sum + Math.abs(value - pitch[i]!), 0);
    const representative =
      Math.abs(last - first) > Math.max(range, travel) * 0.8 ? last : medianPitch(pitch);
    return [{ start: 0, end: pitch.length, pitch: representative }];
  }
  return regions.map((region, i) => {
    const previous = regions[i - 1];
    const start = previous
      ? region.start - previous.end >= minLength
        ? previous.end
        : region.start
      : 0;
    const next = regions[i + 1];
    const end = next
      ? next.start - region.end >= minLength
        ? region.end
        : next.start
      : pitch.length;
    return { start, end, pitch: region.pitch };
  });
}

export function extractPitchContour(
  pitch: number[],
  anchor: number,
  steadiness: number,
): PitchPoint[] | undefined {
  if (pitch.length < 2) return undefined;
  const sorted = pitch.toSorted((a, b) => a - b);
  const trim = Math.floor(pitch.length * 0.05);
  if (sorted[sorted.length - 1 - trim]! - sorted[trim]! <= 0.4 + 2 * steadiness) return undefined;
  const count = Math.min(8, pitch.length);
  const points = Array.from({ length: count }, (_, i) => {
    const index = Math.round((i * (pitch.length - 1)) / (count - 1));
    const offset = Math.max(-48, Math.min(48, pitch[index]! - anchor));
    return { position: i / (count - 1), offset: Math.abs(offset) < 0.08 ? 0 : offset };
  });
  points.at(-1)!.offset = 0;
  return points;
}
