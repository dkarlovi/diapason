import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { sidebarWidth, uncoveredTimeFraction } from "../editor-viewport";

const isNarrow = () =>
  window.matchMedia?.("(max-width: 760px)").matches ?? window.innerWidth <= 760;
export function useEditorLayout(hasAudio = true) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(isNarrow);
  const [open, setOpen] = useState(() => !isNarrow());
  const [sourceHidden, setSourceHidden] = useState(isNarrow);
  const [width, setWidth] = useState(360);
  const [workspaceWidth, setWorkspaceWidth] = useState(1200);
  const changedSource = useRef(false);
  useEffect(() => {
    const update = () => {
      setMobile(isNarrow());
      setWorkspaceWidth(workspaceRef.current?.clientWidth || 1200);
      if (!changedSource.current) setSourceHidden(isNarrow());
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (workspaceRef.current) observer?.observe(workspaceRef.current);
    update();
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const actualWidth = mobile
    ? Math.min(360, workspaceWidth - 16)
    : sidebarWidth(width, workspaceWidth);
  const resize = useCallback(
    (value: number) => setWidth(sidebarWidth(value, workspaceWidth)),
    [workspaceWidth],
  );
  const resizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: width + 24,
      ArrowRight: width - 24,
      Home: 286,
      End: workspaceWidth / 2,
    };
    if (event.key in steps) {
      event.preventDefault();
      resize(steps[event.key]!);
    }
  };
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    resize((workspaceRef.current?.getBoundingClientRect().right ?? 0) - event.clientX);
  };
  return {
    workspaceRef,
    mobile,
    open,
    setOpen,
    sourceHidden: !hasAudio || sourceHidden,
    toggleSource: () => {
      if (!hasAudio) return;
      changedSource.current = true;
      setSourceHidden((value) => !value);
    },
    width: actualWidth,
    maxWidth: workspaceWidth / 2,
    resizeKey,
    drag,
    visibleFraction: open && !mobile ? uncoveredTimeFraction(workspaceWidth, actualWidth) : 1,
  };
}
export type EditorLayout = ReturnType<typeof useEditorLayout>;
