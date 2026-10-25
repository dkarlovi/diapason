import { useId } from "react";
import { waveformBars, type WaveformSummary } from "../waveform";
import { useWaveformLayout } from "../hooks/useWaveformLayout";

export function WaveformThumbnail({ summary }: { summary: WaveformSummary | undefined }) {
  const id = useId();
  const { ref, layout } = useWaveformLayout();
  const gradientId = `${id}-gradient`;
  const maskId = `${id}-cutout`;
  const bars = summary ? waveformBars(summary, 80) : null;
  return (
    <svg ref={ref} className="recording-waveform" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId}>
          <stop stopColor="currentColor" />
          <stop offset="38%" stopColor="currentColor" stopOpacity={0.8} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
        {bars && (
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width="100%"
            height="100%"
            style={{ maskType: "luminance" }}
          >
            <rect width="100%" height="100%" fill="white" />
            <svg
              className="recording-waveform-cutout"
              {...layout}
              viewBox="0 0 320 100"
              preserveAspectRatio="none"
            >
              {bars.map((height, index) => (
                <rect
                  key={index}
                  x={index * 4}
                  y={50 - height * 50}
                  width={2.6}
                  height={height * 100}
                  rx={1.3}
                  fill="black"
                />
              ))}
            </svg>
          </mask>
        )}
      </defs>
      <rect
        width="100%"
        height="100%"
        fill={`url(#${gradientId})`}
        mask={bars ? `url(#${maskId})` : undefined}
      />
    </svg>
  );
}
