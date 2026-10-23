import { useEffect, useMemo, type FC, type ReactElement } from 'react'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { useComponentsContext, useDictionary, type DefaultReactSuggestionItem, type SuggestionMenuProps } from '@blocknote/react'
import { filterMentionCandidates } from '@/lib/comments/mentions'
import type { MentionNodeKind, RecordLinkKind } from '@/lib/db/block-document'
import type { LinkableRecord, MentionRoster } from '@/lib/db/document-references'

// The `@` and `[[` menus of a block document. They reuse the library's suggestion menu (keyboard
// navigation, placement, Esc) and add only grouped rows and a footer line.

export type DocumentMenuItem = DefaultReactSuggestionItem & { onItemClick: () => void }

const MENTION_LIMITS = { person: 5, team: 4 } as const

/** Anything the editor needs to insert one node and remember its label without a round trip. */
interface InsertTarget {
  insertInlineContent: (content: Array<string | { type: string; props: Record<string, string> }>) => void
}

export function mentionItems(
  editor: InsertTarget,
  roster: MentionRoster,
  query: string,
  labels: { person: string; team: string },
  remember: (mention: { kind: MentionNodeKind; id: string; name: string }) => void,
): DocumentMenuItem[] {
  const pick = (kind: MentionNodeKind, id: string, name: string) => () => {
    remember({ kind, id, name })
    editor.insertInlineContent([{ type: 'mention', props: { kind, id } }, ' '])
  }
  return [
    ...filterMentionCandidates(query, roster.people, MENTION_LIMITS.person).map((p) => (
      { title: p.label, group: labels.person, onItemClick: pick('person', p.id, p.label) })),
    ...filterMentionCandidates(query, roster.teams, MENTION_LIMITS.team).map((tm) => (
      { title: tm.label, group: labels.team, onItemClick: pick('team', tm.id, tm.label) })),
  ]
}

export function recordItems(
  editor: InsertTarget,
  records: LinkableRecord[],
  kindLabel: (kind: RecordLinkKind) => string,
  remember: (record: { kind: RecordLinkKind; id: string; title: string }) => void,
): DocumentMenuItem[] {
  return records.map((r) => ({
    title: r.title || kindLabel(r.kind),
    subtext: r.detail ?? undefined,
    group: kindLabel(r.kind),
    onItemClick: () => {
      remember({ kind: r.kind, id: r.id, title: r.title })
      editor.insertInlineContent([{ type: 'recordLink', props: { kind: r.kind, id: r.id } }, ' '])
    },
  }))
}

/** The slash item that hands over to the `[[` menu. */
export function linkRecordSlashItem(
  editor: { getExtension: (ext: typeof SuggestionMenu) => { openSuggestionMenu: (trigger: string, options: { deleteTriggerCharacter: boolean; ignoreQueryLength: boolean }) => void } | undefined },
  copy: { title: string; subtext: string; group: string },
): DocumentMenuItem {
  return {
    ...copy,
    aliases: ['link', 'record', 'task', 'objective', 'project', 'signal', 'meeting'],
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </svg>
    ),
    onItemClick: () => {
      editor.getExtension(SuggestionMenu)?.openSuggestionMenu('[[', { deleteTriggerCharacter: true, ignoreQueryLength: true })
    },
  }
}

/** A suggestion menu with a footer line under the rows ("Only records you can open are listed."). */
export function useFooterMenu(footer: string, label: string): FC<SuggestionMenuProps<DocumentMenuItem>> {
  return useMemo(() => function FooterMenu({ items, loadingState, selectedIndex, onItemClick }: SuggestionMenuProps<DocumentMenuItem>) {
    const Components = useComponentsContext()!
    const dict = useDictionary()
    // The library's listbox root takes no label prop, so the open list is named here.
    useEffect(() => { document.getElementById('bn-suggestion-menu')?.setAttribute('aria-label', label) })
    const rows: ReactElement[] = []
    let group: string | undefined
    items.forEach((item, index) => {
      if (item.group !== group) {
        group = item.group
        rows.push(<Components.SuggestionMenu.Label className="bn-suggestion-menu-label" key={`group-${group}`}>{group}</Components.SuggestionMenu.Label>)
      }
      rows.push(
        <Components.SuggestionMenu.Item
          className="bn-suggestion-menu-item"
          item={item}
          id={`bn-suggestion-menu-item-${index}`}
          isSelected={index === selectedIndex}
          key={`item-${index}`}
          onClick={() => onItemClick?.(item)}
        />,
      )
    })
    return (
      <Components.SuggestionMenu.Root id="bn-suggestion-menu" className="bn-suggestion-menu">
        {rows}
        {rows.length === 0 && loadingState !== 'loading-initial' ? (
          <Components.SuggestionMenu.EmptyItem className="bn-suggestion-menu-item">{dict.suggestion_menu.no_items_title}</Components.SuggestionMenu.EmptyItem>
        ) : null}
        <p className="block-doc__menu-footer">{footer}</p>
      </Components.SuggestionMenu.Root>
    )
  }, [footer, label])
}
