import { BASE } from "./router";
import { type PortableTune } from "./portable-tune";
import { decodeTune, encodeTune, fromBase64Url, toBase64Url } from "./tune-codec";
const MAX_TUNE_URL = 16_384;
export async function tuneUrl(tune: PortableTune, origin: string): Promise<string> {
  const url = `${origin}${BASE}#tune=${toBase64Url(await encodeTune(tune))}`;
  if (url.length > MAX_TUNE_URL)
    throw new Error("This tune is too large for a share link. Download Diapason MIDI instead.");
  return url;
}
export async function tuneFromFragment(fragment: string): Promise<PortableTune | null> {
  if (!fragment.startsWith("#tune=")) return null;
  if (fragment.length > MAX_TUNE_URL)
    throw new Error("This tune link is too large. Import Diapason MIDI instead.");
  return decodeTune(fromBase64Url(fragment.slice(6)));
}
