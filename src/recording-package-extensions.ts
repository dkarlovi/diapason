import { isObject } from "./diagnostics-validation";
import { KNOB_DEFS } from "./melody/knobs";

function optionalKnownKeys(path: string): string[] {
  if (path === "intent.intent")
    return ["melody", "tuning", "quantize", "noteEdits", "muted", "play"];
  if (path.endsWith(".overrides")) return KNOB_DEFS.map((d) => d.key);
  if (path.endsWith(".analysis")) return ["preferredRange"];
  return [];
}
/** Preserve compatible object extensions, but replace arrays and remove absent
 * known optional state. Array entries belong to the newly generated result. */
export function mergePackageExtensions(previous: unknown, current: unknown, path = ""): unknown {
  if (!isObject(previous) || !isObject(current)) return current;
  const merged = { ...previous };
  for (const key of optionalKnownKeys(path)) delete merged[key];
  for (const [key, value] of Object.entries(current)) {
    const nextPath = path ? `${path}.${key}` : key;
    merged[key] = mergePackageExtensions(previous[key], value, nextPath);
  }
  return merged;
}
