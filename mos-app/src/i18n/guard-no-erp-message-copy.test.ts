import { describe, expect, it } from 'vitest'
import { messages } from './messages'

describe('ESB terminology in user-facing messages', () => {
  it('uses ESB instead of ERP in both locales', () => {
    const violations = (['en', 'id'] as const).flatMap(locale =>
      Object.entries(messages[locale])
        .filter(([, value]) => /\bERP\b/i.test(value))
        .map(([key]) => `${locale}.${key}`),
    )

    expect(violations).toEqual([])
  })
})
