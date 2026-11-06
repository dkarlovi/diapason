import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useRecordingSetup } from "./useRecordingSetup";

afterEach(cleanup);

it("uses the current busy guard for tempo changes and confirmation", () => {
  const { result, rerender } = renderHook(
    ({ busy }) =>
      useRecordingSetup({
        isBusy: () => busy,
        onBeforeClose: () => {},
        transport: null,
        setStatus: () => {},
      }),
    { initialProps: { busy: false } },
  );
  act(() => result.current.tempo.changeBpm(120));
  expect(result.current.setup.bpm).toBe(120);
  rerender({ busy: true });
  act(() => {
    result.current.tempo.changeBpm(150);
    result.current.tempo.confirm();
  });
  expect(result.current.setup.bpm).toBe(120);
  expect(result.current.setup.tempoConfirmed).toBe(false);
  rerender({ busy: false });
  act(() => result.current.tempo.confirm());
  expect(result.current.setup.tempoConfirmed).toBe(true);
});
