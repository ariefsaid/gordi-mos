import { describe, expect, it } from 'vitest'
import { moduleFacts, roleAdmittedTo } from './module-switches-preview'

describe('module facts used by Admin settings', () => {
  it('keeps the six switches in the existing Admin order and preserves release status', () => {
    expect(moduleFacts().map(({ id }) => id)).toEqual(['work', 'money', 'cafe', 'assistant', 'roastery', 'ecommerce'])
    expect(moduleFacts().find((fact) => fact.id === 'roastery')?.released).toBe(false)
    expect(moduleFacts().find((fact) => fact.id === 'cafe')?.released).toBe(true)
  })

  it('reports normal route admission without synthesizing a role for Allow', () => {
    expect(roleAdmittedTo('money', ['member'])).toBe(false)
    expect(roleAdmittedTo('money', ['finance'])).toBe(true)
    expect(roleAdmittedTo('cafe', [])).toBe(true)
    expect(roleAdmittedTo('assistant', [])).toBe(true)
    expect(roleAdmittedTo('roastery', ['admin'])).toBe(false)
  })
})
