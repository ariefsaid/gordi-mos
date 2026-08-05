export type MentionPerson = {
  id: string
  full_name: string | null
}

export type PersonMentionIndex = ReadonlyMap<string, string>

function slugForPerson(person: MentionPerson): string | null {
  const firstToken = person.full_name?.trim().split(/\s+/)[0]
  if (!firstToken) return null
  return firstToken.toLowerCase()
}

export function buildPersonMentionIndex(people: MentionPerson[]): PersonMentionIndex {
  const firstPass = new Map<string, string>()
  const collisions = new Set<string>()

  for (const person of people) {
    const slug = slugForPerson(person)
    if (!slug) continue
    if (firstPass.has(slug)) {
      firstPass.delete(slug)
      collisions.add(slug)
      continue
    }
    if (!collisions.has(slug)) firstPass.set(slug, person.id)
  }

  return firstPass
}

export function extractMentions(body: string, personIndex: PersonMentionIndex): string[] {
  const seen = new Set<string>()
  const matches = body.matchAll(/(^|[^\w])@([a-z0-9_.-]+)/gi)
  const ids: string[] = []

  for (const match of matches) {
    const slug = match[2]?.toLowerCase()
    if (!slug) continue
    const id = personIndex.get(slug)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

// ── Step 4 (Signal composer) — shared trigger + fuzzy-filter grammar ─────────
// Extends this module (Rule 11) rather than re-implementing mention matching in the Signal
// composer; CommentThread's own inline trigger regex predates this and is left as-is (out of
// this task's scope — a follow-up could fold it onto currentMentionToken()).

export interface MentionToken {
  query: string
  /** Index of the triggering `@` within the body string. */
  start: number
}

/** Detect an in-progress `@token` immediately before `cursor`. Returns null once the token is
 * closed by whitespace (or there is no open `@`). */
export function currentMentionToken(value: string, cursor: number): MentionToken | null {
  const before = value.slice(0, cursor)
  const match = before.match(/(^|\s)@([^\s@]*)$/)
  if (!match) return null
  const query = match[2] ?? ''
  return { query, start: before.length - query.length - 1 }
}

export interface MentionCandidate {
  id: string
  label: string
}

/** Case-insensitive substring filter (the "fuzzy" grammar's matching rule — a scored/fuzzy ranker
 * is not needed at Gordi's ~30-person scale). An empty query returns the first `limit` candidates
 * unfiltered, so the picker has a sane default list before the author types anything. */
export function filterMentionCandidates(
  query: string, candidates: MentionCandidate[], limit = 5,
): MentionCandidate[] {
  const q = query.trim().toLowerCase()
  const matches = q ? candidates.filter((c) => c.label.toLowerCase().includes(q)) : candidates
  return matches.slice(0, limit)
}
