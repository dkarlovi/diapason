// Shared presentation data and download helpers.

import type { QualityStats } from "./recorder";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface Check {
  label: string;
  pass: boolean;
  detail: string;
}

export function checksFor(stats: QualityStats): Check[] {
  return [
    {
      label: "Signal detected",
      pass: stats.voicedRatio >= 0.25,
      detail: `${Math.round(stats.voicedRatio * 100)}% voiced`,
    },
    {
      label: "Clear tone",
      pass: stats.medianClarity >= 0.9,
      detail: `clarity ${stats.medianClarity.toFixed(2)}`,
    },
    { label: "No clipping", pass: !stats.clipped, detail: `peak ${stats.peak.toFixed(2)}` },
    {
      label: "Steady pitch",
      pass: stats.centsStd <= 20 && stats.voicedRatio >= 0.25,
      detail: `±${stats.centsStd.toFixed(0)}¢`,
    },
  ];
}

export const fmtDate = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
