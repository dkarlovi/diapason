export class EditStorageError extends Error {
  constructor(
    public readonly code: "conflict" | "missing" | "duplicate-name" | "invalid-version" | "storage",
    message: string,
  ) {
    super(message);
    this.name = "EditStorageError";
  }
}
