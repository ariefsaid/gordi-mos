import { describe, expect, it } from 'vitest'
import {
  buildPersonMentionIndex,
  extractMentions,
  currentMentionToken,
  filterMentionCandidates,
} from './mentions'

// Fixture names here are deliberately synthetic. This repo is world-readable (CLAUDE.md banner),
// and a mention fixture is exactly the shape that leaks a roster: first name, surname, and the
// collision structure between two colleagues who share one. The assertions below are unchanged —
// what each case proves (slug resolution, dedup order, collision fail-quiet, the `@` trigger, the
// substring filter and its limit) is identical; only the strings people would recognise are gone.

describe('comments mentions (T26, AC-P3-CM-002)', () => {
  const people = [
    { id: 'person-alpha', full_name: 'Alpha Warehouse' },
    { id: 'person-bravo', full_name: 'Bravo Kitchen' },
    { id: 'person-clash-1', full_name: 'Clash Ops' },
    { id: 'person-clash-2', full_name: 'Clash Finance' },
  ]

  it('extracts resolvable @first-name slugs and ignores unknown slugs', () => {
    const index = buildPersonMentionIndex(people)

    expect(extractMentions('@alpha please sync with @unknown and @bravo', index)).toEqual([
      'person-alpha',
      'person-bravo',
    ])
  })

  it('deduplicates repeated mentions in first-seen order', () => {
    const index = buildPersonMentionIndex(people)

    expect(extractMentions('@bravo @alpha @bravo', index)).toEqual(['person-bravo', 'person-alpha'])
  })

  it('fails quiet on colliding first-name slugs', () => {
    const index = buildPersonMentionIndex(people)

    expect(extractMentions('@clash @alpha', index)).toEqual(['person-alpha'])
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
    expect(currentMentionToken('Hi @crew ', 9)).toBeNull()
  })
})

describe('filterMentionCandidates', () => {
  // Two of the three labels contain "ri", so the first case proves BOTH that the filter matches on
  // a case-insensitive substring and that `limit` truncates a multi-match result — which is what
  // v4's version proved with its own three-label fixture.
  const candidates = [
    { id: 'p1', label: 'Bridge Crew' },
    { id: 'p2', label: 'Prime Shift' },
    { id: 'p3', label: 'Night Crew' },
  ]

  it('returns a case-insensitive substring match, limited to `limit`', () => {
    expect(filterMentionCandidates('ri', candidates, 1)).toEqual([{ id: 'p1', label: 'Bridge Crew' }])
  })

  it('returns the first `limit` candidates unfiltered for an empty query', () => {
    expect(filterMentionCandidates('', candidates, 2)).toEqual(candidates.slice(0, 2))
  })

  it('returns [] when nothing matches', () => {
    expect(filterMentionCandidates('zzz', candidates)).toEqual([])
  })
})
