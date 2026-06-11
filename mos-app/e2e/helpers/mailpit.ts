// Mailpit/inbucket helper for retrieving magic-link and recovery emails in e2e tests.
// Local Supabase stack uses mailpit at :55324.
// Verified endpoint: GET /api/v1/messages → { messages: [...] } (mailpit v2 API shape).
// If this 404s, fall back to inbucket's /api/v1/mailbox/<addr>.

const MAILPIT_BASE = process.env.MAILPIT_URL ?? 'http://127.0.0.1:55324'

interface MailpitMessage {
  ID: string
  To: Array<{ Address: string }>
  Subject: string
}

interface MailpitListResponse {
  messages: MailpitMessage[]
}

interface MailpitMessageDetail {
  HTML: string
  Text: string
}

/** Wait up to `timeoutMs` for a new email to arrive for the given address, then return its body. */
export async function waitForEmail(
  toEmail: string,
  timeoutMs = 10_000,
): Promise<{ html: string; text: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`)
    if (res.ok) {
      const data = (await res.json()) as MailpitListResponse
      const msg = data.messages?.find((m) =>
        m.To?.some((t) => t.Address.toLowerCase() === toEmail.toLowerCase()),
      )
      if (msg) {
        const detail = await fetch(`${MAILPIT_BASE}/api/v1/message/${msg.ID}`)
        if (detail.ok) {
          const body = (await detail.json()) as MailpitMessageDetail
          return { html: body.HTML ?? '', text: body.Text ?? '' }
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`[mailpit] Timed out waiting for email to ${toEmail} (${timeoutMs}ms)`)
}

/** Delete all messages in the mailpit inbox (call between tests to avoid stale mail). */
export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_BASE}/api/v1/messages`, { method: 'DELETE' })
}

/**
 * Extract the Supabase magic-link (or recovery link) URL from an email body.
 * Supabase local sends URLs matching /auth/v1/verify?... or /auth/v1/...confirm...
 */
/** Decode HTML entities in a URL string (e.g. &amp; → &). */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function extractAuthLink(html: string, text: string): string {
  // Try HTML first — links are in href="...". HTML entities in URL must be decoded.
  const htmlMatch = html.match(/href="(https?:\/\/[^"]*(?:\/auth\/v1\/verify|confirm)[^"]*)"/i)
  if (htmlMatch?.[1]) return decodeHtmlEntities(htmlMatch[1])

  // Fallback: plain text — look for a URL on its own line (no HTML entities expected)
  const textMatch = text.match(/(https?:\/\/\S+(?:\/auth\/v1\/verify|confirm)\S+)/i)
  if (textMatch?.[1]) return textMatch[1]

  throw new Error('[mailpit] Could not extract auth link from email body')
}
