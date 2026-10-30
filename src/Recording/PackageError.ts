export type PackageErrorCode = "malformed" | "unsupported" | "historical-default";
export interface PackageErrorContext {
  schemaVersion?: number;
  interpretationVersion?: number;
  build?: unknown;
}
export class PackageError extends Error {
  readonly trusted = false;
  constructor(
    readonly code: PackageErrorCode,
    readonly path: string,
    readonly check: string,
    message = "This WAV's diapason package is damaged or unsupported.",
    public context: PackageErrorContext = {},
  ) {
    super(message);
    this.name = "PackageError";
  }
}
function isPackageDiagnostic(error: PackageError): boolean {
  return error.trusted === false && error.path !== "$";
}
export function packageError(error: unknown, path: string, check = "package.valid"): PackageError {
  return error instanceof PackageError && isPackageDiagnostic(error)
    ? error
    : new PackageError(
        "malformed",
        path,
        check,
        error instanceof Error ? error.message : String(error),
      );
}
export function atPackagePath<T>(path: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    throw packageError(error, path);
  }
}
export function requirePackage(condition: boolean, path: string, check: string): void {
  if (!condition) throw new PackageError("malformed", path, check);
}
