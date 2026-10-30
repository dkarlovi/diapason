/** Canonical, unpadded base64url for bounded binary URL payloads. */
export function toBase64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string, maxLength: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length > maxLength)
    throw new Error("Invalid or oversized base64url payload");
  const bytes = Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
  if (toBase64Url(bytes) !== text) throw new Error("Invalid base64url encoding");
  return bytes;
}
