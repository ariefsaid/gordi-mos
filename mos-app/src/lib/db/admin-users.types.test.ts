// ROLE_META — centralized human role labels + descriptions (visual-polish round).
// The DB stores slugs; the UI must never show raw slugs. These tests pin the single
// source of truth so every role surface (create dialog, RoleEditor, RoleChips) renders
// the human label, not 'ops_lead'.

import { describe, it, expect } from 'vitest'
import { messages } from '@/i18n/messages'
import type { MessageKey } from '@/i18n/messages'
import {
  ROLE_META,
  ASSIGNABLE_ROLES,
  roleLabel,
  roleDescription,
  localizedRoleMeta,
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

  it('AC-120: manager is an assignable role with a non-derived description', () => {
    expect(ASSIGNABLE_ROLES).toContain('manager')
    expect(ROLE_META.manager.label).toBe('Manager')
    expect(ROLE_META.manager.description.length).toBeGreaterThan(0)
    expect(ROLE_META.manager.description.toLowerCase()).not.toContain('derived')
  })

  it('AC-321: supervisor is an assignable role with a revenue-oriented description', () => {
    expect(ASSIGNABLE_ROLES).toContain('supervisor')
    expect(ROLE_META.supervisor.label).toBe('Supervisor')
    expect(ROLE_META.supervisor.description.length).toBeGreaterThan(0)
    expect(ROLE_META.supervisor.description.toLowerCase()).toContain('revenue')
  })
})

// #201 — the surface renders roles through the catalog, so the catalog is what has to be
// complete. ROLE_META is the slug registry; `admin.role.*` is the copy. If a role is added
// to one and not the other the UI shows a bare slug (or, worse, a missing-key marker), so
// the two are asserted to agree here rather than discovered on screen.
describe('localizedRoleMeta — every assignable role has catalog copy in both locales', () => {
  const t = (key: MessageKey) => messages.en[key] as string

  it('resolves a label and a description for every assignable role', () => {
    for (const slug of ASSIGNABLE_ROLES) {
      const meta = localizedRoleMeta(slug, t)
      expect(meta.label.length, `${slug} label`).toBeGreaterThan(0)
      expect(meta.label, `${slug} label must not be a raw slug`).not.toBe(slug)
      expect(meta.description.length, `${slug} description`).toBeGreaterThan(0)
    }
  })

  it('both locales carry a non-empty label and description for every assignable role', () => {
    for (const locale of ['en', 'id'] as const) {
      for (const slug of ASSIGNABLE_ROLES) {
        const catalog = messages[locale] as Record<string, string>
        expect(catalog[`admin.role.${slug}`], `${locale}/${slug}`).toBeTruthy()
        expect(catalog[`admin.role.${slug}.desc`], `${locale}/${slug}.desc`).toBeTruthy()
      }
    }
  })

  it('falls back to the raw slug for a role with no registry entry', () => {
    expect(localizedRoleMeta('mystery_role', t)).toEqual({ label: 'mystery_role', description: '' })
  })

  it('AC-321: the localized supervisor description stays revenue-oriented', () => {
    expect(localizedRoleMeta('supervisor', t).description.toLowerCase()).toContain('revenue')
  })

  it('AC-120: the localized manager description is not the derived-manager wording', () => {
    expect(localizedRoleMeta('manager', t).description.toLowerCase()).not.toContain('derived')
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
