// ROLE_META — centralized human role labels + descriptions (visual-polish round).
// The DB stores slugs; the UI must never show raw slugs. These tests pin the single
// source of truth so every role surface (create dialog, RoleEditor, RoleChips) renders
// the human label, not 'ops_lead'.

import { describe, it, expect } from 'vitest'
import {
  ROLE_META,
  ASSIGNABLE_ROLES,
  roleLabel,
  roleDescription,
} from './admin-users.types'

describe('ROLE_META', () => {
  it('has a human label + description for every assignable role', () => {
    for (const slug of ASSIGNABLE_ROLES) {
      expect(ROLE_META[slug]).toBeDefined()
      expect(ROLE_META[slug].label.length).toBeGreaterThan(0)
      expect(ROLE_META[slug].description.length).toBeGreaterThan(0)
    }
  })

  it('renders ops_lead as the human label "Ops Lead" (no raw slug)', () => {
    expect(ROLE_META.ops_lead.label).toBe('Ops Lead')
    expect(ROLE_META.ops_lead.label).not.toContain('_')
  })

  it('maps each role to its specified label + description', () => {
    expect(ROLE_META.member).toEqual({ label: 'Member', description: 'Submits logs and updates' })
    expect(ROLE_META.ops_lead).toEqual({ label: 'Ops Lead', description: 'Plans and approves' })
    expect(ROLE_META.admin).toEqual({ label: 'Admin', description: 'Manages users and settings' })
    expect(ROLE_META.finance).toEqual({ label: 'Finance', description: 'Sees financial reports' })
  })

  it('includes derived manager for chip rendering', () => {
    expect(ROLE_META.manager.label).toBe('Manager')
  })
})

describe('roleLabel / roleDescription helpers', () => {
  it('roleLabel returns the human label for a known slug', () => {
    expect(roleLabel('ops_lead')).toBe('Ops Lead')
    expect(roleLabel('admin')).toBe('Admin')
  })

  it('roleLabel falls back to the slug for an unknown role', () => {
    expect(roleLabel('mystery_role')).toBe('mystery_role')
  })

  it('roleDescription returns the description for a known slug, empty for unknown', () => {
    expect(roleDescription('finance')).toBe('Sees financial reports')
    expect(roleDescription('mystery_role')).toBe('')
  })
})
