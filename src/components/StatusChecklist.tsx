import { Button } from "./primitives";
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
            {check.detail && ` · ${check.detail}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MeasurementControl({
  label,
  pendingLabel,
  pending,
  checks,
  onStart,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  checks: SetupCheck[];
  onStart(): void;
}) {
  return (
    <>
      <Button variant="primary" disabled={pending} onClick={onStart}>
        {pending ? pendingLabel : label}
      </Button>
      {pending && <progress aria-label={pendingLabel} />}
      <StatusChecklist checks={checks} />
    </>
  );
}
