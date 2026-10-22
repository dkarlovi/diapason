import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { Checklist } from "./Capture";

it("renders checklist labels and details as text", () => {
  const { container } = render(
    <Checklist checks={[{ label: "<b>signal</b>", detail: "<img src=x>", pass: true }]} />,
  );
  expect(container.textContent).toContain("<b>signal</b>");
  expect(container.textContent).toContain("<img src=x>");
  expect(container.querySelector("b, img")).toBeNull();
});
