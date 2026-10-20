import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { Chip } from './chip'

describe('Chip', () => {
  it.each(['en', 'id'] as const)('keeps long chip labels discoverable in locale %s', (locale) => {
    const fullLabel = `Gordi HQ ${'retail operations and customer experience '.repeat(5)}`.trim()
    render(
      <I18nProvider initialLocale={locale}>
        <>
          <Chip label={fullLabel} clickable />
          <Chip label={`${fullLabel} static`} />
        </>
      </I18nProvider>,
    )

    const clickable = screen.getByRole('button', { name: fullLabel })
    expect(clickable).toHaveAccessibleName(fullLabel)
    expect(clickable.querySelector('.mk-chip__label')).toHaveAttribute('title', fullLabel)

    const staticLabel = `${fullLabel} static`
    expect(screen.getByText(staticLabel)).toHaveAttribute('title', staticLabel)
  })
})
