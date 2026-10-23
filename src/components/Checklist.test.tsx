import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { StatusChecklist } from "./StatusChecklist";

it("renders checklist labels and details as text", () => {
  const { container } = render(
    <StatusChecklist
      checks={[
        {
          id: "signal",
          status: "passed",
          blocking: true,
          label: "<b>signal</b>",
          detail: "<img src=x>",
        },
      ]}
    />,
  );
  expect(container.textContent).toContain("<b>signal</b>");
  expect(container.textContent).toContain("<img src=x>");
  expect(container.querySelector("b, img")).toBeNull();
});
