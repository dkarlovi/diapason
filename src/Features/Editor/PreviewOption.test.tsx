import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PreviewOption } from "./PreviewOption";

afterEach(cleanup);

function renderRow(state: { selected?: boolean; base?: boolean; previewing?: boolean }) {
  const { container } = render(
    <PreviewOption
      label="Flute"
      selected={state.selected ?? false}
      base={state.base ?? false}
      previewing={state.previewing ?? false}
      disabled={false}
      previewLabel="Preview Flute"
      useLabel="Use Flute"
      onPreview={() => {}}
      onUse={() => {}}
    />,
  );
  const active = (selector: string) =>
    [...container.querySelectorAll(`${selector} > [data-active="true"]`)].map(
      (element) => element.textContent || element.getAttribute("aria-label"),
    );
  return { container, active };
}

it("keeps every alternative in its slot and shows only the current one", () => {
  const idle = renderRow({});
  expect(idle.container.querySelectorAll(".preview-option-stack > *")).toHaveLength(4);
  expect(idle.active(".preview-option-stack")).toEqual(["Preview", "Use"]);
  cleanup();
  const applied = renderRow({ selected: true, previewing: true });
  expect(applied.active(".preview-option-stack")).toEqual(["Stop", "Flute applied"]);
  expect(screen.getByRole("button", { name: "Use Flute", hidden: true })).toHaveProperty(
    "disabled",
    true,
  );
});

it("explains that using the base preset replaces adjustments", () => {
  renderRow({ base: true });
  expect(screen.getByRole("button", { name: "Use Flute" }).getAttribute("title")).toBe(
    "Base preset: Use replaces your adjustments",
  );
  expect(
    screen.getByRole("button", { name: "Use Flute" }).getAttribute("aria-describedby"),
  ).toBeTruthy();
});
