import { useEffect, useState } from 'react'
import { listAdminPeople } from '@/lib/db/admin-users'
import { localizedRoleMeta, type AdminPersonRow } from '@/lib/db/admin-users.types'
import { supabase } from '@/lib/supabase'
import type { MessageKey } from '@/i18n/messages'

const ORIGINAL_KEY = 'mos.local-view-as.original'
const PEOPLE_KEY = 'mos.local-view-as.people'

type ViewAsPerson = { id: string; full_name: string; email: string; primaryRole: string | null; accessRole: string | null }
type OriginalAccount = { email: string; full_name: string }
type Viewer = { person: { id: string; full_name: string } } | null
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

function readSessionValue(key: string): string | null {
  try { return window.sessionStorage.getItem(key) } catch { return null }
}

function readOriginalAccount(): OriginalAccount | null {
  const value = readSessionValue(ORIGINAL_KEY)
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<OriginalAccount>
    return typeof parsed.email === 'string' && typeof parsed.full_name === 'string'
      ? { email: parsed.email, full_name: parsed.full_name }
      : null
  } catch { return null }
}

function readCachedPeople(): ViewAsPerson[] | null {
  const value = readSessionValue(PEOPLE_KEY)
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every((person) =>
      typeof person.id === 'string' && typeof person.full_name === 'string' &&
      typeof person.email === 'string' && (typeof person.primaryRole === 'string' || person.primaryRole === null) &&
      (typeof person.accessRole === 'string' || person.accessRole === null),
    ) ? parsed as ViewAsPerson[] : null
  } catch { return null }
}

function viewAsCandidates(people: AdminPersonRow[]): ViewAsPerson[] {
  return people
    .filter((person) => person.login === 'active' && person.archived_at === null && person.email)
    .map((person) => ({
      id: person.id,
      full_name: person.full_name,
      email: person.email!,
      primaryRole: person.jabatan[0]?.role_name ?? null,
      accessRole: person.access_roles[0] ?? null,
    }))
}

export function clearLocalViewAsSession(): void {
  try {
    window.sessionStorage.removeItem(ORIGINAL_KEY)
    window.sessionStorage.removeItem(PEOPLE_KEY)
  } catch { /* The browser may disable session storage. */ }
}

export function useLocalViewAs(open: boolean, viewer: Viewer, password: string | null, t: Translate) {
  const [people, setPeople] = useState<ViewAsPerson[]>([])
  const [peopleStatus, setPeopleStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState(false)

  useEffect(() => {
    if (!open || !password) return
    setSwitchError(false)
    const cached = readCachedPeople()
    if (cached) {
      setPeople(cached)
      setPeopleStatus('loaded')
      return
    }

    let active = true
    setPeopleStatus('loading')
    void listAdminPeople().then((rows) => {
      const candidates = viewAsCandidates(rows)
      try { window.sessionStorage.setItem(PEOPLE_KEY, JSON.stringify(candidates)) } catch { /* Best effort; keep the current menu usable. */ }
      if (active) {
        setPeople(candidates)
        setPeopleStatus('loaded')
      }
    }).catch(() => {
      if (active) setPeopleStatus('error')
    })
    return () => { active = false }
  }, [open, password])

  const originalAccount = readOriginalAccount()
  const roleLabel = (person: ViewAsPerson) => person.primaryRole
    ?? (person.accessRole ? localizedRoleMeta(person.accessRole, t).label : t('account.viewAs.noRole'))
  const otherPeople = viewer ? people
    .filter((person) => person.id !== viewer.person.id)
    .sort((a, b) => roleLabel(a).localeCompare(roleLabel(b)) || a.full_name.localeCompare(b.full_name)) : []

  const switchAccount = async (email: string, returning = false): Promise<boolean> => {
    if (!password || switching || !viewer) return false
    let savedOriginal = false
    if (!returning && !originalAccount) {
      const originalPerson = people.find((person) => person.id === viewer.person.id)
      if (!originalPerson?.email) {
        setSwitchError(true)
        return false
      }
      try {
        window.sessionStorage.setItem(ORIGINAL_KEY, JSON.stringify({ email: originalPerson.email, full_name: viewer.person.full_name }))
        savedOriginal = true
      } catch {
        setSwitchError(true)
        return false
      }
    }

    setSwitching(true)
    setSwitchError(false)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (savedOriginal) {
          try { window.sessionStorage.removeItem(ORIGINAL_KEY) } catch { /* Best effort. */ }
        }
        setSwitchError(true)
        return false
      }
      if (returning) clearLocalViewAsSession()
      return true
    } catch {
      if (savedOriginal) {
        try { window.sessionStorage.removeItem(ORIGINAL_KEY) } catch { /* Best effort. */ }
      }
      setSwitchError(true)
      return false
    } finally {
      setSwitching(false)
    }
  }

  return { originalAccount, otherPeople, roleLabel, peopleStatus, switching, switchError, switchAccount }
}
