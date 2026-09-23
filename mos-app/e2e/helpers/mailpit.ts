// Mailpit/inbucket helper for retrieving magic-link and recovery emails in e2e tests.
// Local Supabase stack uses mailpit at :44324.
// Verified endpoint: GET /api/v1/messages → { messages: [...] } (mailpit v2 API shape).
// If this 404s, fall back to inbucket's /api/v1/mailbox/<addr>.
//
// ── The one thing to understand about this helper (issue #137) ────────────────────────────────
// The catcher is ONE mailbox. It is not per-address and not per-run: every spec, every rerun, and
// every other checkout pointed at this Supabase stack delivers into the same box, and mail from a
// run that finished yesterday is still sitting in it.
//
// So "give me the message addressed to X" is not a well-formed question — it matches whatever
// happens to be there. This helper used to answer it anyway, and paid for it with a
// DELETE-everything `clearMailpit()` at the top of each spec to keep the box empty enough for the
// answer to be right. Two shared-state hazards fall out of that: a spec's correctness depends on
// nobody else having put mail in the box, and its cleanup destroys mail another run (another
// checkout on the same stack, a rerun, the next spec) may still be waiting for.
//
// The fix is to stop needing an empty box. `watchInbox()` records which message ids exist BEFORE
// the action that sends the mail; the returned waiter accepts only an id that was not in that set.
// A spec now identifies its OWN message, never deletes anyone else's, and cannot be handed mail
// that predates it. There is no `clearMailpit` any more, deliberately — see issue #137.
//
// Honest scope: this removes the coupling, and the intermittent CI failure it was filed for was
// never reproduced locally, so it is not proven to be the whole cause. What IS proven: with the
// clear gone, the old address-only matcher hands back a message from a previous run on its first
// poll, and this one does not.

const MAILPIT_BASE = process.env.MAILPIT_URL ?? 'http://127.0.0.1:44324'

// Ask for more than mailpit's default page of 50 so a busy shared box can't push our own message
// off the end. Snapshot and poll read the same window, and a message only ever moves DOWN the
// newest-first list, so anything the poll can see was either in the snapshot or genuinely new.
const LIST_URL = `${MAILPIT_BASE}/api/v1/messages?limit=200`

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

async function listMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(LIST_URL)
  if (!res.ok) throw new Error(`[mailpit] GET ${LIST_URL} → ${res.status} (is the local stack up?)`)
  const data = (await res.json()) as MailpitListResponse
  return data.messages ?? []
}

async function readBody(id: string): Promise<{ html: string; text: string } | null> {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/message/${id}`)
  if (!res.ok) return null
  const body = (await res.json()) as MailpitMessageDetail
  return { html: body.HTML ?? '', text: body.Text ?? '' }
}

/**
 * Start watching the shared mail catcher for mail to `toEmail`.
 *
 * Call this BEFORE the click that sends the email — it snapshots what is already in the box, which
 * is what makes the returned waiter immune to mail from earlier runs and other specs. Then await
 * the returned function to get the body of the first message to that address which was NOT already
 * there.
 *
 *   const recoveryMail = await watchInbox(RECOVERY_VIEWER.email)
 *   await page.getByRole('button', { name: /forgot password/i }).click()
 *   const { html, text } = await recoveryMail(20_000)
 */
export async function watchInbox(
  toEmail: string,
): Promise<(timeoutMs?: number) => Promise<{ html: string; text: string }>> {
  const addressee = toEmail.toLowerCase()
  // Deliberately NOT fault-tolerant: a snapshot that silently came back empty because the catcher
  // was unreachable would quietly restore the old "accept any message to this address" behaviour.
  const before = new Set((await listMessages()).map((m) => m.ID))

  return async function waitForNewEmail(timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      // A blip while polling is fine to ride out — the snapshot above is the load-bearing read.
      const messages = await listMessages().catch(() => [])
      const fresh = messages.find(
        (m) => !before.has(m.ID) && m.To?.some((t) => t.Address.toLowerCase() === addressee),
      )
      if (fresh) {
        const body = await readBody(fresh.ID)
        if (body) return body
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(
      `[mailpit] Timed out waiting for a NEW email to ${toEmail} (${timeoutMs}ms). ` +
        `${before.size} message(s) were already in the shared box when the watch started; ` +
        `none newer than that arrived — the app never sent it.`,
    )
  }
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
