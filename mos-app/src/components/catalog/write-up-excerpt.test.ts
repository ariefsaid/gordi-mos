import { describe, expect, it } from 'vitest'
import { writeUpExcerpt } from './write-up-excerpt'

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text, styles: {} }] })

describe('writeUpExcerpt', () => {
  it('reads the text of the blocks in order, links and nested blocks included', () => {
    const blocks = [
      p('First line.'),
      { type: 'bulletListItem', content: [{ type: 'link', href: 'https://example.test', content: [{ type: 'text', text: 'A link', styles: {} }] }], children: [p('Nested.')] },
    ]
    expect(writeUpExcerpt(blocks)).toBe('First line. A link Nested.')
  })

  it('reads prose, not headings, while any prose exists, and falls back to a heading alone', () => {
    const heading = { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Why weekdays', styles: {} }] }
    expect(writeUpExcerpt([heading, p('Lunch is our slow spot.')])).toBe('Lunch is our slow spot.')
    expect(writeUpExcerpt([heading])).toBe('Why weekdays')
  })

  it('is empty for no blocks and for blocks with no text', () => {
    expect(writeUpExcerpt([])).toBe('')
    expect(writeUpExcerpt([{ type: 'paragraph', content: [] }, p('   ')])).toBe('')
  })

  it('stops at a short excerpt with an ellipsis', () => {
    const out = writeUpExcerpt([p('word '.repeat(200))])
    expect(out.length).toBeLessThanOrEqual(241)
    expect(out.endsWith('…')).toBe(true)
    expect(out.slice(0, -1)).toMatch(/word$/)
  })
})
