import { useState } from "react";

export type Notice = {
  kind: "success" | "error" | "info";
  message: string;
  action?: { label: string; to: string };
};

/** Notice state belongs to the operation; Toast owns its dismissal timer. */
export function useNotice() {
  return useState<Notice | null>(null);
}
