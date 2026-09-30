import { describe, it, expect } from 'vitest'
import { isSafeWriteUpLink, plainTextUnsafeLinks } from './objective-writeup'

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
    const out = plainTextUnsafeLinks(blocks) as typeof blocks
    expect(out[0].content[0]).toEqual({ type: 'text', text: 'here', styles: {} })
    expect(out[0].content[1]).toEqual(link('https://ok.test'))
    expect(out[0].children[0].content[0]).toEqual({ type: 'text', text: 'here', styles: {} })
  })
})
