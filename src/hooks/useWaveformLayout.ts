import { useLayoutEffect, useRef, useState } from "react";

/** SVG viewport attributes need actual lengths; CSS geometry on nested SVGs is unreliable. */
export function useWaveformLayout() {
  const ref = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState({ x: 70, y: 20, width: 480, height: 48 });
  useLayoutEffect(() => {
    const svg = ref.current;
    const row = svg?.parentElement;
    const info = row?.querySelector(".recording-info");
    if (!svg || !row || !info) return;
    const measure = () => {
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width) return;
      const label = info.getBoundingClientRect();
      const x = label.left - bounds.left;
      const height = Math.min(50, label.height);
      const next = {
        x,
        y: label.top - bounds.top + (label.height - height) / 2,
        width: Math.max(0, bounds.width - x),
        height,
      };
      setLayout((current) =>
        current.x === next.x &&
        current.y === next.y &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(svg);
    observer.observe(info);
    return () => observer.disconnect();
  }, []);
  return { ref, layout };
}
