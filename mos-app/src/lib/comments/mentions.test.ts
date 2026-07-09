import { describe, expect, it } from 'vitest'
import { buildPersonMentionIndex, extractMentions } from './mentions'

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
