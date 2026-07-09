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
