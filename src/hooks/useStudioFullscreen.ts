import { useEffect, useState, type MouseEvent } from "react";
import { BASE } from "../router";

const MOBILE = "(max-width: 760px), (pointer: coarse) and (max-width: 1024px)";
const supported = () =>
  !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;

const plainClick = (event: MouseEvent<HTMLElement>) =>
  !event.defaultPrevented &&
  event.button === 0 &&
  ![event.metaKey, event.ctrlKey, event.shiftKey, event.altKey].some(Boolean);

/** Navigation runs inside the click gesture required by the Fullscreen API. */
export function useStudioFullscreen() {
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  const [available, setAvailable] = useState(
    () => supported() && !!window.matchMedia?.(MOBILE).matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.(MOBILE);
    const update = () => setAvailable(supported() && !!media?.matches);
    const changed = () => setActive(!!document.fullscreenElement);
    media?.addEventListener?.("change", update);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      media?.removeEventListener?.("change", update);
      document.removeEventListener("fullscreenchange", changed);
    };
  }, []);
  const enter = () => {
    if (!supported() || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen().catch(() => {});
  };
  const onNavigate = (event: MouseEvent<HTMLElement>) => {
    if (!available || !plainClick(event)) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link || link.download || !["", "_self"].includes(link.target)) return;
    const url = new URL(link.href);
    if (
      url.origin === location.origin &&
      (url.pathname === `${BASE}new` || url.pathname.startsWith(`${BASE}recording/`))
    )
      enter();
  };
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else enter();
  };
  return { active, available, onNavigate, toggle };
}
