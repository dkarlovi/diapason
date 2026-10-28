export function requireTune(condition: unknown): asserts condition {
  if (!condition) throw new Error("This tune contains damaged or unsupported Diapason data.");
}
export const finiteBetween = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;
export const integerBetween = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && finiteBetween(value, min, max);
