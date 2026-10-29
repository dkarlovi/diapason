import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useEditorLayout } from "./useEditorLayout";

afterEach(cleanup);

it("enables panel motion only for user toggles, not initial audio loading", () => {
  const { result, rerender } = renderHook(({ audio }) => useEditorLayout(audio), {
    initialProps: { audio: false },
  });
  expect(result.current.sourceHidden).toBe(true);
  expect(result.current.motion).toEqual({ source: false, tune: false });
  rerender({ audio: true });
  expect(result.current.sourceHidden).toBe(false);
  expect(result.current.motion).toEqual({ source: false, tune: false });
  act(() => result.current.toggleSource());
  expect(result.current.motion).toEqual({ source: true, tune: false });
  act(() => result.current.setOpen(false));
  expect(result.current.motion).toEqual({ source: true, tune: true });
});
