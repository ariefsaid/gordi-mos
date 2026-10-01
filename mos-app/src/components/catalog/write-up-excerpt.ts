import type { WriteUpBlocks } from '@/lib/db/objective-writeup'

const MAX_CHARS = 240

/** The first words of a write-up as plain text, for the collapsed summary; empty when it has none.
 *  Headings are skipped while any other text exists, so the summary reads as prose, not a run-on. */
export function writeUpExcerpt(blocks: WriteUpBlocks): string {
  const parts: string[] = []
  const headings: string[] = []
  const walk = (list: unknown[]) => {
    for (const block of list) {
      if (parts.join(' ').length >= MAX_CHARS) return
      const node = block as { type?: unknown; content?: unknown; children?: unknown }
      if (Array.isArray(node.content)) {
        const text = node.content
          .map((item) => {
            const inline = item as { text?: unknown; content?: unknown }
            if (typeof inline.text === 'string') return inline.text
            return Array.isArray(inline.content) ? inline.content.map((inner) => (inner as { text?: unknown }).text ?? '').join('') : ''
          })
          .join('')
          .trim()
        if (text) (node.type === 'heading' ? headings : parts).push(text)
      }
      if (Array.isArray(node.children)) walk(node.children)
    }
  }
  walk(blocks)
  const text = (parts.length > 0 ? parts : headings).join(' ')
  if (text.length <= MAX_CHARS) return text
  // Cut at a word boundary so the summary never ends mid-word.
  const cut = text.slice(0, MAX_CHARS)
  const at = cut.lastIndexOf(' ')
  return `${(at > MAX_CHARS / 3 ? cut.slice(0, at) : cut).trimEnd()}…`
}
