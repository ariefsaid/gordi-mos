import { describe, it, expect } from 'vitest'
import {
  assertBlockDocumentSize, BLOCK_DOCUMENT_MAX_BYTES, BlockDocumentTooLargeError,
  collectDocumentReferences, sanitizeBlockDocument,
} from './block-document'

const ID = '0f4c2d6a-8a3e-4b8e-9a53-2c1f6d9e7b10'
const ID2 = '5d9e1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b'
const text = (t: string) => ({ type: 'text', text: t, styles: {} })
const mention = (kind: string, id: string) => ({ type: 'mention', props: { kind, id } })
const recordLink = (kind: string, id: string) => ({ type: 'recordLink', props: { kind, id } })
const doc = (...inline: unknown[]) => [{ type: 'paragraph', content: inline }]

describe('block document sanitizer: mentions and record links', () => {
  it('drops mentions and record links unless the document allows them', () => {
    const out = sanitizeBlockDocument(doc(text('a'), mention('person', ID), recordLink('task', ID2)))
    expect(out).toEqual([{ type: 'paragraph', content: [text('a')] }])
  })

  it('keeps an allowed mention and record link as kind and id only, never a name or title', () => {
    const out = sanitizeBlockDocument(
      doc(
        { ...mention('team', ID), props: { kind: 'team', id: ID, name: 'Injected name' } },
        { ...recordLink('signal', ID2), content: [text('Injected title')] },
      ),
      { mentions: true, recordLinks: true },
    )
    expect(out).toEqual([{ type: 'paragraph', content: [mention('team', ID), recordLink('signal', ID2)] }])
  })

  it('refuses a Business Unit mention, an unknown record kind and a non-uuid id', () => {
    const out = sanitizeBlockDocument(
      doc(mention('bu', ID), recordLink('invoice', ID), recordLink('task', 'not-a-uuid'), mention('person', '../../x')),
      { mentions: true, recordLinks: true },
    )
    expect(out).toEqual([{ type: 'paragraph', content: [] }])
  })

  it('allows each inline node independently', () => {
    const blocks = doc(mention('person', ID), recordLink('task', ID2))
    expect(sanitizeBlockDocument(blocks, { mentions: true })).toEqual(doc(mention('person', ID)))
    expect(sanitizeBlockDocument(blocks, { recordLinks: true })).toEqual(doc(recordLink('task', ID2)))
  })
})

describe('block document references', () => {
  it('collects each distinct reference once, children included', () => {
    const blocks = [
      { type: 'paragraph', content: [mention('person', ID), mention('person', ID), recordLink('task', ID2)],
        children: [{ type: 'quote', content: [mention('team', ID2)] }] },
    ]
    expect(collectDocumentReferences(blocks, 'mention')).toEqual([{ kind: 'person', id: ID }, { kind: 'team', id: ID2 }])
    expect(collectDocumentReferences(blocks, 'recordLink')).toEqual([{ kind: 'task', id: ID2 }])
  })
})

describe('block document size cap', () => {
  it('refuses a document over the cap and accepts one under it', () => {
    expect(() => assertBlockDocumentSize([{ type: 'paragraph', content: 'x'.repeat(BLOCK_DOCUMENT_MAX_BYTES) }])).toThrow(BlockDocumentTooLargeError)
    expect(() => assertBlockDocumentSize([{ type: 'paragraph', content: 'short' }])).not.toThrow()
  })
})
