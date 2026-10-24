/* eslint-disable react-refresh/only-export-components -- the inline specs, their context and hook belong with the nodes they render */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createReactInlineContentSpec } from '@blocknote/react'
import { useT } from '@/i18n/use-t'
import {
  collectDocumentReferences,
  type BlockDocument,
  type MentionNodeKind,
  type RecordLinkKind,
} from '@/lib/db/block-document'
import { recordKey, resolveMentionNames, resolveRecordTitles, type RecordRef } from '@/lib/db/document-references'

// The two inline nodes a block document can carry beyond text: a @mention of a person or Team, and a
// link to a MOS record. The document stores kind + id only; names and titles are looked up here, so
// a rename shows everywhere and a record the viewer cannot read never leaks its title.

type RecordState = { status: 'loading' } | { status: 'found'; title: string } | { status: 'restricted' }

export interface DocumentReferences {
  /** The current name of a mention, undefined while loading, null when it cannot be read. */
  mentionName: (kind: MentionNodeKind, id: string) => string | null | undefined
  record: (kind: RecordLinkKind, id: string) => RecordState
  /** Opens a linked record (the panel stack on a page that has one); absent when nothing can open it. */
  openRecord?: (ref: RecordRef) => void
}

const ReferencesContext = createContext<DocumentReferences | null>(null)

const NO_REFERENCES: DocumentReferences = {
  mentionName: () => undefined,
  record: () => ({ status: 'loading' }),
}

const useReferences = () => useContext(ReferencesContext) ?? NO_REFERENCES

export const DocumentReferencesProvider = ReferencesContext.Provider

/**
 * Resolves the names and titles a document points at, in batches: `refresh(document)` looks up what
 * has not been looked up yet; `remember` records a pick made in a menu without a round trip.
 */
export function useDocumentReferences(openRecord?: (ref: RecordRef) => void) {
  const [names, setNames] = useState<ReadonlyMap<string, string | null>>(new Map())
  const [titles, setTitles] = useState<ReadonlyMap<string, string | null>>(new Map())
  const asked = useRef(new Set<string>())

  const refresh = useCallback((blocks: BlockDocument) => {
    const mentions = collectDocumentReferences<MentionNodeKind>(blocks, 'mention')
      .filter((m) => !asked.current.has(`mention:${m.kind}:${m.id}`))
    const records = collectDocumentReferences<RecordLinkKind>(blocks, 'recordLink')
      .filter((r) => !asked.current.has(recordKey(r.kind, r.id)))
    if (mentions.length === 0 && records.length === 0) return
    for (const m of mentions) asked.current.add(`mention:${m.kind}:${m.id}`)
    for (const r of records) asked.current.add(recordKey(r.kind, r.id))
    // A failed lookup is asked again on the next refresh instead of showing a record as restricted.
    const forget = () => {
      for (const m of mentions) asked.current.delete(`mention:${m.kind}:${m.id}`)
      for (const r of records) asked.current.delete(recordKey(r.kind, r.id))
    }
    void Promise.all([
      resolveMentionNames(mentions.filter((m) => m.kind === 'person').map((m) => m.id), mentions.filter((m) => m.kind === 'team').map((m) => m.id)),
      resolveRecordTitles(records),
    ]).then(([found, foundTitles]) => {
      setNames((prev) => {
        const next = new Map(prev)
        for (const m of mentions) next.set(`${m.kind}:${m.id}`, (m.kind === 'person' ? found.people : found.teams).get(m.id) ?? null)
        return next
      })
      setTitles((prev) => {
        const next = new Map(prev)
        for (const r of records) next.set(recordKey(r.kind, r.id), foundTitles.get(recordKey(r.kind, r.id)) ?? null)
        return next
      })
    }).catch(forget)
  }, [])

  const remember = useCallback((entry: { mention?: { kind: MentionNodeKind; id: string; name: string }; record?: { kind: RecordLinkKind; id: string; title: string } }) => {
    if (entry.mention) {
      const { kind, id, name } = entry.mention
      asked.current.add(`mention:${kind}:${id}`)
      setNames((prev) => new Map(prev).set(`${kind}:${id}`, name))
    }
    if (entry.record) {
      const { kind, id, title } = entry.record
      asked.current.add(recordKey(kind, id))
      setTitles((prev) => new Map(prev).set(recordKey(kind, id), title))
    }
  }, [])

  const value = useMemo<DocumentReferences>(() => ({
    mentionName: (kind, id) => names.get(`${kind}:${id}`),
    record: (kind, id) => {
      const title = titles.get(recordKey(kind, id))
      if (title === undefined) return { status: 'loading' }
      return title === null ? { status: 'restricted' } : { status: 'found', title }
    },
    openRecord,
  }), [names, titles, openRecord])

  return { value, refresh, remember }
}

export const KIND_LABEL: Record<RecordLinkKind, Parameters<ReturnType<typeof useT>>[0]> = {
  task: 'blockDoc.kind.task',
  objective: 'blockDoc.kind.objective',
  project: 'blockDoc.kind.project',
  signal: 'blockDoc.kind.signal',
  meeting: 'blockDoc.kind.meeting',
}

export function MentionNode({ kind, id }: { kind: MentionNodeKind; id: string }) {
  const t = useT()
  const name = useReferences().mentionName(kind, id)
  // Blue bold text, never a control: a mention only names someone.
  return (
    <span className="block-doc__mention" data-kind={kind}>
      @{name === undefined ? '…' : name ?? t(kind === 'person' ? 'blockDoc.mention.unknownPerson' : 'blockDoc.mention.unknownTeam')}
    </span>
  )
}

export function RecordLinkNode({ kind, id }: { kind: RecordLinkKind; id: string }) {
  const t = useT()
  const references = useReferences()
  const state = references.record(kind, id)
  if (state.status === 'restricted') {
    // The viewer cannot read the record: neutral, no title, nothing to open.
    return <span className="block-doc__chip block-doc__chip--restricted">{t('blockDoc.restricted')}</span>
  }
  const content = (
    <>
      <span className="block-doc__chip-kind">{t(KIND_LABEL[kind])}</span>
      <span className="block-doc__chip-title">{state.status === 'found' ? state.title : '…'}</span>
    </>
  )
  if (state.status !== 'found' || !references.openRecord) return <span className="block-doc__chip">{content}</span>
  return (
    <button
      type="button"
      className="block-doc__chip block-doc__chip--link"
      onClick={() => references.openRecord?.({ kind, id })}
    >
      {content}
      <span className="block-doc__chip-hit" aria-hidden="true" />
    </button>
  )
}

/** The inline specs for a document that allows mentions and/or record links. Built on demand, never at module load. */
export function createInlineSpecs(options: { mentions?: boolean; recordLinks?: boolean }) {
  const specs: Record<string, unknown> = {}
  if (options.mentions) {
    specs.mention = createReactInlineContentSpec(
      { type: 'mention', propSchema: { kind: { default: 'person', values: ['person', 'team'] }, id: { default: '' } }, content: 'none' } as const,
      { render: ({ inlineContent }) => <MentionNode kind={inlineContent.props.kind as MentionNodeKind} id={inlineContent.props.id} /> },
    )
  }
  if (options.recordLinks) {
    specs.recordLink = createReactInlineContentSpec(
      { type: 'recordLink', propSchema: { kind: { default: 'task', values: ['task', 'objective', 'project', 'signal', 'meeting'] }, id: { default: '' } }, content: 'none' } as const,
      { render: ({ inlineContent }) => <RecordLinkNode kind={inlineContent.props.kind as RecordLinkKind} id={inlineContent.props.id} /> },
    )
  }
  return specs
}
