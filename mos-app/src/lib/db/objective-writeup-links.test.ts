import { describe, it, expect } from 'vitest'
import { isSafeWriteUpLink, sanitizeWriteUp } from './objective-writeup'

const link = (href: string) => ({ type: 'link', href, content: [{ type: 'text', text: 'here', styles: {} }] })

describe('write-up link schemes', () => {
  it.each(['http://a.test', 'https://a.test/x', 'mailto:a@b.test', 'tel:+62123'])('allows %s', (h) => {
    expect(isSafeWriteUpLink(h)).toBe(true)
  })
  it.each(['javascript:alert(1)', ' JaVaScript:alert(1)', 'data:text/html,x', 'vbscript:x', 'ftp://a.test', 'file:///etc/passwd', '//evil.test', ''])('refuses %j', (h) => {
    expect(isSafeWriteUpLink(h)).toBe(false)
  })
  it('turns unsafe links into plain text and keeps safe ones, at any depth', () => {
    const blocks = [{ type: 'paragraph', content: [link('javascript:alert(1)'), link('https://ok.test')], children: [
      { type: 'quote', content: [link('data:x')], children: [] },
    ] }]
    const out = sanitizeWriteUp(blocks) as typeof blocks
    expect(out[0].content[0]).toEqual({ type: 'text', text: 'here', styles: {} })
    expect(out[0].content[1]).toEqual(link('https://ok.test'))
    expect(out[0].children[0].content[0]).toEqual({ type: 'text', text: 'here', styles: {} })
  })
})

const text = (t: string, styles: Record<string, unknown> = {}) => ({ type: 'text', text: t, styles })

describe('sanitizeWriteUp', () => {
  it('returns an empty document for anything that is not an array', () => {
    expect(sanitizeWriteUp(null as never)).toEqual([])
    expect(sanitizeWriteUp({ type: 'paragraph' } as never)).toEqual([])
  })

  it('keeps only the allowed text blocks, dropping others with their children', () => {
    const out = sanitizeWriteUp([
      { type: 'image', props: { url: 'https://outside.test/a.png' } },
      { type: 'table', content: { type: 'tableContent', rows: [] } },
      { type: 'unknown', children: [{ type: 'paragraph', content: [text('orphan')] }] },
      { type: 'paragraph', content: [text('ok')], children: [{ type: 'video', props: { url: 'https://outside.test/v' } }, { type: 'quote', content: [text('q')] }] },
      'nope',
      null,
    ] as never) as Array<{ type: string; children?: Array<{ type: string }> }>
    expect(out.map((b) => b.type)).toEqual(['paragraph'])
    expect(out[0].children?.map((b) => b.type)).toEqual(['quote'])
  })

  it('keeps only valid props for the block type and drops unknown fields', () => {
    const [heading, para, check] = sanitizeWriteUp([
      { type: 'heading', props: { level: 2, textAlignment: 'center', textColor: 'red', isToggleable: true, onclick: 'x' }, content: [], extra: 1 },
      { type: 'paragraph', props: { textColor: 'url(javascript:x)', textAlignment: 'diagonal', level: 3, backgroundColor: { a: 1 } }, content: [] },
      { type: 'checkListItem', props: { checked: 'yes' }, content: [] },
    ] as never) as Array<Record<string, unknown>>
    expect(heading).toEqual({ type: 'heading', props: { level: 2, textAlignment: 'center', textColor: 'red' }, content: [] })
    expect(para).toEqual({ type: 'paragraph', content: [] })
    expect(check).toEqual({ type: 'checkListItem', content: [] })
  })

  it('keeps well-formed inline text and safe links, and drops malformed or unknown inline content', () => {
    const [block] = sanitizeWriteUp([{ type: 'paragraph', content: [
      text('a', { bold: true, onclick: 'x', textColor: 'blue', backgroundColor: 'javascript:x', italic: 'true' }),
      { type: 'image', url: 'https://outside.test/i.png' },
      { type: 'text', text: 42, styles: {} },
      { type: 'text', styles: {} },
      7,
      null,
      link('javascript:alert(1)'),
      link('https://ok.test'),
      { type: 'link', href: 'https://ok.test', content: [{ type: 'link', href: 'https://nested.test', content: [] }, text('t')] },
    ] }] as never) as Array<{ content: unknown[] }>
    expect(block.content).toEqual([
      text('a', { bold: true, textColor: 'blue' }),
      text('here'),
      link('https://ok.test'),
      { type: 'link', href: 'https://ok.test', content: [text('t')] },
    ])
  })

  it('accepts string content and bounds nesting depth', () => {
    expect(sanitizeWriteUp([{ type: 'paragraph', content: 'plain' }] as never)).toEqual([{ type: 'paragraph', content: [text('plain')] }])
    let deep: Record<string, unknown> = { type: 'paragraph', content: [] }
    for (let i = 0; i < 500; i += 1) deep = { type: 'paragraph', content: [], children: [deep] }
    expect(() => JSON.stringify(sanitizeWriteUp([deep] as never))).not.toThrow()
  })
})
