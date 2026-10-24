import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@blocknote/react', () => ({
  useDictionary: () => ({ suggestion_menu: { no_items_title: 'No matches' } }),
  useComponentsContext: () => ({
    SuggestionMenu: {
      Root: ({ children }: { children?: ReactNode }) => <div role="listbox">{children}</div>,
      Label: ({ children }: { children?: ReactNode }) => <div role="presentation">{children}</div>,
      EmptyItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      Item: ({ item, onClick, isSelected }: { item: { title: string; subtext?: string }; onClick: () => void; isSelected: boolean }) => (
        <div role="option" aria-selected={isSelected} onClick={onClick}>{item.title}{item.subtext ? ` (${item.subtext})` : ''}</div>
      ),
    },
  }),
}))

import { useFooterMenu, type DocumentMenuItem } from './block-document-menus'

function Menu({ items, footer }: { items: DocumentMenuItem[]; footer: string }) {
  const FooterMenu = useFooterMenu(footer, 'Link a record')
  return <FooterMenu items={items} loadingState="loaded" selectedIndex={0} onItemClick={(item) => item.onItemClick()} />
}

describe('the @ and [[ menu', () => {
  it('lists rows under their group, selects on click, and ends with its footer line', () => {
    const pick = vi.fn()
    render(<Menu footer="Only records you can open are listed." items={[
      { title: 'Cafe 2 espresso', group: 'Signal', onItemClick: vi.fn() },
      { title: 'Update recipe cards', subtext: 'In Progress', group: 'Task', onItemClick: pick },
    ]} />)
    expect(screen.getByText('Signal')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Update recipe cards \(In Progress\)/ }))
    expect(pick).toHaveBeenCalled()
    expect(screen.getByText('Only records you can open are listed.')).toBeInTheDocument()
  })

  it('gives the open list a name', () => {
    render(<div id="bn-suggestion-menu" role="listbox"><Menu footer="f" items={[]} /></div>)
    expect(screen.getByRole('listbox', { name: 'Link a record' })).toBeInTheDocument()
  })

  it('says so when nothing matches, still with the footer', () => {
    render(<Menu footer="They get an Inbox notice" items={[]} />)
    expect(screen.getByText('No matches')).toBeInTheDocument()
    expect(screen.getByText('They get an Inbox notice')).toBeInTheDocument()
  })
})
