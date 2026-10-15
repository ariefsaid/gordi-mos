import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AssistantMarkdown } from './AssistantMarkdown'

describe('AssistantMarkdown links', () => {
  it('does not turn a protocol-relative target into an external link', () => {
    render(<AssistantMarkdown source="[open](//outside.example/path)" />)
    expect(screen.queryByRole('link', { name: 'open' })).toBeNull()
  })

  it('keeps approved absolute and relative links usable', () => {
    render(<AssistantMarkdown source="[external](https://example.test) [internal](/tasks)" />)
    expect(screen.getByRole('link', { name: 'external' })).toHaveAttribute('href', 'https://example.test')
    expect(screen.getByRole('link', { name: 'internal' })).toHaveAttribute('href', '/tasks')
  })
})
