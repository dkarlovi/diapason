import type { Report } from "../../src/Inspection/Inspection.type.ts";

export function cliErrorCode(value: unknown): string | undefined {
  if (
    value !== null &&
    typeof value === "object" &&
    "code" in value &&
    typeof value.code === "string"
  )
    return value.code;
  return undefined;
}

export function cliErrorMessage(value: unknown): string {
  if (
    value !== null &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  )
    return value.message;
  return String(value);
}

export interface CliError {
  code?: string;
  message: string;
  path?: string;
  check?: string;
  context?: unknown;
  trusted?: boolean;
}
export interface ErrorData {
  error: Omit<CliError, "code"> & { code: string };
}
export const errorReport = (error: CliError): Report<ErrorData> => ({
  schemaVersion: 1,
  kind: "error",
  input: null,
  view: null,
  execution: null,
  scope: { total: 0, returned: 0, offset: 0, limit: 20, omitted: 0 },
  overall: "fail",
  findings: [],
  data: {
    error: {
      code: error.code ?? "operation.failed",
      message: error.message,
      ...(error.path && error.trusted === false
        ? { path: error.path, check: error.check, context: error.context, trusted: false }
        : {}),
    },
  },
  nextSteps: [],
});
