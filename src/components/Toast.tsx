import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Play, X } from "lucide-react";
import { Link } from "react-router";
import type { Notice } from "../hooks/useNotice";
import { Button } from "../UI/Primitives";

const icons = { success: CircleCheck, error: CircleAlert, info: Play };

export function Toast({
  notice,
  onDismiss,
  label,
}: {
  notice: Notice | null;
  onDismiss(): void;
  label?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!notice) {
      setHovered(false);
      setFocused(false);
    }
  }, [notice]);
  useEffect(() => {
    if (!notice || hovered || focused) return;
    const timer = window.setTimeout(
      onDismiss,
      notice.kind === "error" ? 10000 : notice.action ? 8000 : 6000,
    );
    return () => window.clearTimeout(timer);
  }, [notice, hovered, focused, onDismiss]);
  if (!notice) return null;
  const Icon = icons[notice.kind];
  return (
    <div
      className="studio-toast"
      data-kind={notice.kind}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-label={label}
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <Icon className="toast-icon" aria-hidden="true" />
      <span className="toast-message">{notice.message}</span>
      {notice.action && (
        <Link className="button toast-action" to={notice.action.to} onClick={onDismiss}>
          {notice.action.label}
        </Link>
      )}
      <Button className="toast-dismiss" aria-label="Dismiss notification" onClick={onDismiss}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
