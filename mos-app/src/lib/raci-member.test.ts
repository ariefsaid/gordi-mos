import { describe, it, expect } from 'vitest'
import { raciMember, raciOwner } from './raci-member'

const P_R  = 'person-r'
const P_A  = 'person-a'
const P_C  = 'person-c'
const P_I  = 'person-i'
const P_X  = 'person-not-involved'

const task = {
  responsible_person_id:  P_R,
  accountable_person_id:  P_A,
  consulted_person_ids:   [P_C],
  informed_person_ids:    [P_I],
}

describe('raciMember — RACI membership predicate (R/A/C/I)', () => {
  it('returns true when person is Responsible', () => {
    expect(raciMember(task, P_R)).toBe(true)
  })

  it('returns true when person is Accountable', () => {
    expect(raciMember(task, P_A)).toBe(true)
  })

  it('returns true when person is Consulted', () => {
    expect(raciMember(task, P_C)).toBe(true)
  })

  it('returns true when person is Informed', () => {
    expect(raciMember(task, P_I)).toBe(true)
  })

  it('returns false when person has no RACI role on the task', () => {
    expect(raciMember(task, P_X)).toBe(false)
  })

  it('handles empty C/I arrays (no false positive)', () => {
    const minimal = {
      responsible_person_id: P_R,
      accountable_person_id: P_A,
      consulted_person_ids: [] as string[],
      informed_person_ids: [] as string[],
    }
    expect(raciMember(minimal, P_C)).toBe(false)
    expect(raciMember(minimal, P_I)).toBe(false)
  })

  it('handles A=R (same person in both roles) correctly', () => {
    const dual = {
      responsible_person_id: P_R,
      accountable_person_id: P_R,
      consulted_person_ids: [] as string[],
      informed_person_ids: [] as string[],
    }
    expect(raciMember(dual, P_R)).toBe(true)
    expect(raciMember(dual, P_X)).toBe(false)
  })
})

describe('raciOwner — Mine segment predicate (R or A only)', () => {
  it('returns true when person is Responsible', () => {
    expect(raciOwner(task, P_R)).toBe(true)
  })

  it('returns true when person is Accountable', () => {
    expect(raciOwner(task, P_A)).toBe(true)
  })

  it('returns false when person is only Consulted (not Mine)', () => {
    expect(raciOwner(task, P_C)).toBe(false)
  })

  it('returns false when person is only Informed (not Mine)', () => {
    expect(raciOwner(task, P_I)).toBe(false)
  })

  it('returns false when person has no role at all', () => {
    expect(raciOwner(task, P_X)).toBe(false)
  })
})
