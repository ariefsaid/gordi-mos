import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, useI18n } from './I18nProvider'

const observedValues: ReturnType<typeof useI18n>[] = []

function LocaleConsumer() {
  const value = useI18n()
  observedValues.push(value)
  return <button type="button" onClick={() => value.setLocale('id')}>{value.locale}</button>
}

function ParentRerender() {
  const [, setRevision] = useState(0)
  return <>
    <button type="button" onClick={() => setRevision(revision => revision + 1)}>Refresh parent</button>
    <I18nProvider><LocaleConsumer /></I18nProvider>
  </>
}

describe('I18nProvider', () => {
  it('keeps the context stable for unrelated renders and still changes language', () => {
    observedValues.length = 0
    render(<ParentRerender />)
    const englishValue = observedValues.at(-1)
    expect(screen.getByRole('button', { name: 'en' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh parent' }))
    expect(observedValues.at(-1)).toBe(englishValue)

    fireEvent.click(screen.getByRole('button', { name: 'en' }))
    expect(screen.getByRole('button', { name: 'id' })).toBeInTheDocument()
    expect(observedValues.at(-1)).not.toBe(englishValue)
  })
})
