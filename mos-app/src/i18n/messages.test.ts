import { createElement, type ReactNode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { messages } from './messages'
import { I18nProvider } from './I18nProvider'
import { useT, interpolate } from './use-t'

/**
 * i18n catalog + seam tests (ADR-0021, plan §4.6/§5).
 * The catalog is the seam: both locales must expose identical key sets
 * (compile-time via MessageKey, and here at test-time as a guard), and
 * useT() must resolve/interpolate/fall back without ever throwing.
 *
 * (Plain .ts, not .tsx — the wrapper uses createElement instead of JSX.)
 */
function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, null, children)
}

describe('i18n messages catalog', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('AC-I01: en and id key sets are identical', () => {
    const enKeys = Object.keys(messages.en).sort()
    const idKeys = Object.keys(messages.id).sort()
    expect(idKeys).toEqual(enKeys)
  })

  it('AC-I02: with locale persisted as id, t("dest.home") returns "Beranda"', () => {
    localStorage.setItem('mos.locale', 'id')
    const { result } = renderHook(() => useT(), { wrapper })
    expect(result.current('dest.home')).toBe('Beranda')
  })

  it('AC-I02: default locale (en) resolves t("dest.home") to "Home"', () => {
    const { result } = renderHook(() => useT(), { wrapper })
    expect(result.current('dest.home')).toBe('Home')
  })

  it('AC-I03: t() for a key missing at runtime falls back to en, then the key, and never throws', () => {
    const { result } = renderHook(() => useT(), { wrapper })
    // @ts-expect-error — deliberately passing an unknown key to prove runtime safety
    expect(() => result.current('not.a.real.key')).not.toThrow()
    // @ts-expect-error — same as above
    expect(result.current('not.a.real.key')).toBe('not.a.real.key')
  })

  it('useT resolves a catalog string unchanged when no vars are passed', () => {
    const { result } = renderHook(() => useT(), { wrapper })
    expect(result.current('home.title')).toBe('Home')
  })

  it('interpolate() replaces ${name} placeholders with the provided vars', () => {
    expect(interpolate('Hello ${name}, you have ${count} tasks', { name: 'Arief', count: 3 })).toBe(
      'Hello Arief, you have 3 tasks'
    )
  })

  it('interpolate() leaves unknown placeholders untouched and never throws', () => {
    expect(() => interpolate('Hi ${missing}', {})).not.toThrow()
    expect(interpolate('Hi ${missing}', {})).toBe('Hi ${missing}')
  })
})

describe('nav i18n (AC-409, FR-440) — every nav label through the catalog', () => {
  const NAV_KEYS = [
    'nav.tasks',
    'nav.home',
    'nav.inbox',
    'nav.updates',
    'nav.sales',
    'nav.objectives',
    'nav.projectsProcesses',
    // issue 455: the Café module's children — `nav.kitchen.*` retired with the wrong name.
    'nav.cafe',
    'nav.cafe.log',
    'nav.cafe.plan',
    'nav.cafe.stock',
    'nav.cafe.review',
    'nav.cafe.pushes',
  ] as const

  it('AC-409: every nav.* key is present in both en and id (shape-identical parity)', () => {
    for (const key of NAV_KEYS) {
      expect(messages.en[key], `en missing ${key}`).toBeDefined()
      expect(messages.id[key], `id missing ${key}`).toBeDefined()
    }
  })

  it('AC-409: under locale:id, every nav.* key resolves to a localized string, not the key itself', () => {
    localStorage.setItem('mos.locale', 'id')
    const { result } = renderHook(() => useT(), { wrapper })
    for (const key of NAV_KEYS) {
      const resolved = result.current(key)
      expect(resolved, `${key} fell back to the key stub under id`).not.toBe(key)
      expect(resolved.length).toBeGreaterThan(0)
    }
  })
})

// AC-P2-AP-004/005 (plan T26) — the assistant panel's i18n catalog. Every assistant.* key must
// ship in BOTH locales and resolve to a real localized string under `id` (never fall back to the
// key itself — that would surface an English-key stub to an Indonesian user).
describe('assistant panel i18n (T26, AC-P2-AP-004/005)', () => {
  const ASSISTANT_KEYS = [
    'assistant.title',
    'assistant.history',
    'assistant.newConversation',
    'assistant.open',
    'assistant.empty.title',
    'assistant.empty.body',
    'assistant.empty.suggestion1',
    'assistant.empty.suggestion2',
    'assistant.empty.suggestion3',
    'assistant.composer.placeholder',
    'assistant.composer.sendHint',
    'assistant.send',
    'assistant.retry',
    'assistant.streaming',
    'assistant.approval.header',
    'assistant.approval.approve',
    'assistant.approval.deny',
    'assistant.action.create_task',
    'assistant.action.post_update',
    'assistant.error.title',
    'assistant.error.cta',
    'assistant.stuck.banner',
    'assistant.stuck.stop',
    'assistant.thread.empty',
  ] as const

  it('every assistant.* key is present in both en and id (key-parity holds)', () => {
    for (const key of ASSISTANT_KEYS) {
      expect(messages.en[key], `en missing ${key}`).toBeDefined()
      expect(messages.id[key], `id missing ${key}`).toBeDefined()
    }
  })

  it('under locale:id, every assistant.* key resolves to a localized string, not the key itself', () => {
    localStorage.setItem('mos.locale', 'id')
    const { result } = renderHook(() => useT(), { wrapper })
    for (const key of ASSISTANT_KEYS) {
      const resolved = result.current(key)
      expect(resolved, `${key} fell back to the key stub under id`).not.toBe(key)
      // A localized string must contain at least one non-ASCII OR be a real Indonesian word;
      // the guard above (not the key) is the binding assertion.
      expect(resolved.length).toBeGreaterThan(0)
    }
  })
})

// The cascade screen is cut (#179, OD-WAY-32), so the strings that only ever labelled it are cut
// with it — a translator should never be asked to keep copy for a surface that no longer exists.
// "Cascade" survives as glossary vocabulary in CONTEXT.md, not as UI copy.
describe('cascade i18n is retired with the surface (#179)', () => {
  it('no cascade.* key survives in either locale', () => {
    for (const locale of ['en', 'id'] as const) {
      expect(Object.keys(messages[locale]).filter((k) => k.startsWith('cascade.'))).toEqual([])
    }
  })

})
