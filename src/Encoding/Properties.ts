export function hasProperties<Key extends string>(
  value: unknown,
  ...keys: Key[]
): value is Record<Key, unknown> {
  return value !== null && typeof value === "object" && keys.every((key) => key in value);
}
