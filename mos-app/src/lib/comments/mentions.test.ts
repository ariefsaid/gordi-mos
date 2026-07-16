import { describe, expect, it } from 'vitest'
import { buildPersonMentionIndex, extractMentions, currentMentionToken, filterMentionCandidates } from './mentions'

describe('comments mentions (T26, AC-P3-CM-002)', () => {
  const people = [
    { id: 'person-arief', full_name: 'Arief Said' },
    { id: 'person-riri', full_name: 'Riri Kitchen' },
    { id: 'person-rina-1', full_name: 'Rina Ops' },
    { id: 'person-rina-2', full_name: 'Rina Finance' },
  ]

  it('extracts resolvable @first-name slugs and ignores unknown slugs', () => {
    const index = buildPersonMentionIndex(people)

    expect(extractMentions('@arief please sync with @unknown and @riri', index)).toEqual([
      'person-arief',
      'person-riri',
    ])
  })

  it('deduplicates repeated mentions in first-seen order', () => {
    const index = buildPersonMentionIndex(people)

    expect(extractMentions('@riri @arief @riri', index)).toEqual(['person-riri', 'person-arief'])
  })

  it('fails quiet on colliding first-name slugs', () => {
    const index = buildPersonMentionIndex(people)

    expect(extractMentions('@rina @arief', index)).toEqual(['person-arief'])
  })
})

// Step 4 (Signal composer, B9) — grammar shared with the Signal `@` grouped picker (Rule 11:
// extend the existing mention grammar, do not re-implement fuzzy matching).
describe('currentMentionToken', () => {
  it('detects an in-progress @token immediately before the cursor', () => {
    expect(currentMentionToken('Freezer alarm @ri', 18)).toEqual({ query: 'ri', start: 14 })
  })

  it('detects an empty token right after a bare @', () => {
    expect(currentMentionToken('Hello @', 7)).toEqual({ query: '', start: 6 })
  })

  it('returns null when no @token is open at the cursor', () => {
    expect(currentMentionToken('Freezer alarm went off', 10)).toBeNull()
  })

  it('returns null once the token is closed by whitespace', () => {
    expect(currentMentionToken('Hi @riri ', 9)).toBeNull()
  })
})

describe('filterMentionCandidates', () => {
  const candidates = [
    { id: 'p1', label: 'Riri Kitchen' },
    { id: 'p2', label: 'Rina Ops' },
    { id: 'p3', label: 'Arief Said' },
  ]

  it('returns a case-insensitive substring match, limited to `limit`', () => {
    expect(filterMentionCandidates('ri', candidates, 1)).toEqual([{ id: 'p1', label: 'Riri Kitchen' }])
  })

  it('returns the first `limit` candidates unfiltered for an empty query', () => {
    expect(filterMentionCandidates('', candidates, 2)).toEqual(candidates.slice(0, 2))
  })

  it('returns [] when nothing matches', () => {
    expect(filterMentionCandidates('zzz', candidates)).toEqual([])
  })
})
