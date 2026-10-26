import { useEffect, useState } from "react";

type Notice = { kind: "success" | "error"; message: string } | null;

/** A toast message that dismisses itself; errors stay up longer. */
export function useNotice() {
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.kind === "error" ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return [notice, setNotice] as const;
}
