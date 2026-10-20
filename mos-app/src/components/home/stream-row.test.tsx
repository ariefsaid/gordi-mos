import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { StreamItem } from '@/lib/home-stream'
import { StreamRow } from './stream-row'

describe('StreamRow', () => {
  it.each(['en', 'id'] as const)('exposes full long row text in the accessible link name and titles in locale %s', (locale) => {
    const item = {
      id: 'task-long-name',
      title: `Review ${'regional customer experience plans '.repeat(5)}`.trim(),
      route: '/work/tasks/task-long-name',
      pic: { name: `Arden ${'Sample regional operations '.repeat(5)}`.trim() },
      caption: `Business unit ${'Retail operations '.repeat(5)}`.trim(),
      meta: `Due ${'Thursday, October '.repeat(5)}`.trim(),
    } satisfies StreamItem
    render(
      <I18nProvider initialLocale={locale}>
        <MemoryRouter>
          <StreamRow item={item} />
        </MemoryRouter>
      </I18nProvider>,
    )

    const namePattern = new RegExp(`${item.title}.*${item.pic.name}.*${item.caption}.*${item.meta}`)
    const link = screen.getByRole('link', { name: namePattern })
    expect(link).toHaveAccessibleName(namePattern)
    expect(screen.getByText(item.title)).toHaveAttribute('title', item.title)
    expect(screen.getByText(item.pic.name)).toHaveAttribute('title', item.pic.name)
    expect(screen.getByText(item.caption)).toHaveAttribute('title', item.caption)
    expect(screen.getByText(item.meta)).toHaveAttribute('title', item.meta)
  })
})
