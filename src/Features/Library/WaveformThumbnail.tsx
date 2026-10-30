import { useId } from "react";
import { waveformBars, type WaveformSummary } from "../../Audio/Waveform";
import { useWaveformLayout } from "./useWaveformLayout";

export function WaveformThumbnail({ summary }: { summary: WaveformSummary | undefined }) {
  const id = useId();
  const { ref, layout } = useWaveformLayout();
  const gradientId = `${id}-gradient`;
  const maskId = `${id}-cutout`;
  const bars = summary ? waveformBars(summary, 48) : null;
  const waveform = bars && (
    <svg
      className="recording-waveform-cutout"
      {...layout}
      viewBox="0 0 320 100"
      preserveAspectRatio="none"
      overflow="visible"
    >
      {bars.map((height, index) => (
        <rect
          key={index}
          x={index * (320 / 48)}
          y={50 - height * 50}
          width={4.4}
          height={height * 100}
          rx={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
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
            <g fill="black">{waveform}</g>
          </mask>
        )}
      </defs>
      <rect
        width="100%"
        height="100%"
        fill={`url(#${gradientId})`}
        mask={bars ? `url(#${maskId})` : undefined}
      />
      {/* Temporary interior shading for visual comparison. */}
      <g fill="#000">{waveform}</g>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        mask={bars ? `url(#${maskId})` : undefined}
      >
        {waveform}
      </g>
    </svg>
  );
}
