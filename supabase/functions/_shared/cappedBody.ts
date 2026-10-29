// Reads a request body up to a declared or streamed byte limit.
// Returns the body as a UTF-8 string, or null if the body exceeds maxBytes.
// Does not touch the request body stream when Content-Length declares an oversize payload.
export async function readCappedText(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  const declared = Number(req.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > maxBytes) return null
  const reader = req.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
