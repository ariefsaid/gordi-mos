// Base64url helpers for the segments of a compact JWT. Decoding is not verification: callers read a
// payload only to refuse early or after the token has been verified.
export function b64urlToBytes(encoded: string): Uint8Array<ArrayBuffer> {
  const bin = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// The JSON object a segment encodes, or null when it is not one.
export function parseSegment(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)))
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}
