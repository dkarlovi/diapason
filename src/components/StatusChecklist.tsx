import type { SetupCheck } from "../recording-setup";
const labels = {
  unchecked: "Not checked",
  checking: "Checking",
  passed: "Passed",
  attention: "Needs attention",
};
export function StatusChecklist({ checks }: { checks: SetupCheck[] }) {
  return (
    <ul className="checklist status-checklist">
      {checks.map((check) => (
        <li
          key={check.id}
          className={
            check.status === "passed" ? "pass" : check.status === "attention" ? "fail" : ""
          }
        >
          <span className="dot" aria-hidden="true" />
          <span>
            {check.label}
            {!check.blocking && <small> · Optional</small>}
          </span>
          <span className="detail">
            {labels[check.status]}
            {check.detail && " · " + check.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}
