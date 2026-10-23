import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/auth/use-auth'
import { effectiveModuleAccess, type PersonModuleOverride } from '@/lib/module-access'
import { getViewerModuleAvailability, type ModuleId, type ViewerModuleAvailability } from '@/lib/db/module-settings'

type ModuleAvailabilityStatus = 'idle' | 'loading' | 'ready' | 'error'
type ModuleAvailabilitySnapshot = {
  status: ModuleAvailabilityStatus
  enabled: Partial<Record<ModuleId, boolean>>
  overrides: Partial<Record<ModuleId, PersonModuleOverride>>
  revision: string | null
}
type LoadOptions = { force?: boolean }
export type ModuleAccessCheck = (moduleId: ModuleId, roleAdmitted?: boolean) => boolean

const MODULE_IDS: readonly ModuleId[] = ['work', 'money', 'cafe', 'staff', 'roastery', 'ecommerce', 'assistant']
const REFRESH_AFTER_MS = 60_000
const EMPTY_SNAPSHOT: ModuleAvailabilitySnapshot = { status: 'idle', enabled: {}, overrides: {}, revision: null }
let snapshot = EMPTY_SNAPSHOT
let signedInSession: string | null = null
let attempted = false
let lastLoadedAt = 0
let generation = 0
let pending: Promise<void> | null = null
let queuedRefresh: Promise<void> | null = null
let focusSubscribers = 0
let focusHandler: (() => void) | null = null
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const emit = () => listeners.forEach((listener) => listener())
const publish = (next: ModuleAvailabilitySnapshot) => { snapshot = next; emit() }
const getSnapshot = () => snapshot
const isModuleId = (value: string): value is ModuleId => MODULE_IDS.includes(value as ModuleId)
const isOverride = (value: unknown): value is PersonModuleOverride =>
  value === 'inherit' || value === 'allow' || value === 'block'

function isCompleteAvailability(rows: readonly ViewerModuleAvailability[]): boolean {
  if (rows.length !== MODULE_IDS.length) return false
  const revision = rows[0]?.revision
  return typeof revision === 'string' && revision.length > 0 && rows.every((row) =>
    isModuleId(row.module_id) && typeof row.enabled === 'boolean' && isOverride(row.person_override) &&
    row.revision === revision,
  ) && new Set(rows.map((row) => row.module_id)).size === MODULE_IDS.length &&
    MODULE_IDS.every((moduleId) => rows.some((row) => row.module_id === moduleId))
}

function setSession(session: string): void {
  if (signedInSession === session) return
  signedInSession = session
  attempted = false
  lastLoadedAt = 0
  generation += 1
  pending = null
  queuedRefresh = null
  publish(EMPTY_SNAPSHOT)
}

export function resetModuleAvailability(): void {
  signedInSession = null
  attempted = false
  lastLoadedAt = 0
  generation += 1
  pending = null
  queuedRefresh = null
  publish(EMPTY_SNAPSHOT)
}

export function hasKnownModuleAvailability(moduleId: ModuleId): boolean {
  return Object.hasOwn(snapshot.enabled, moduleId) && Object.hasOwn(snapshot.overrides, moduleId)
}

export function loadModuleAvailability({ force = false }: LoadOptions = {}): Promise<void> {
  if (!signedInSession) return Promise.resolve()
  if (pending) {
    if (!force) return pending
    if (queuedRefresh) return queuedRefresh
    const currentRequest = pending
    const refreshGeneration = generation
    const refresh = currentRequest.then(() => {
      if (refreshGeneration !== generation) return
      queuedRefresh = null
      return loadModuleAvailability({ force: true })
    })
    queuedRefresh = refresh
    return refresh
  }
  if (attempted && !force) return Promise.resolve()

  attempted = true
  const requestGeneration = generation
  publish({ ...snapshot, status: 'loading' })
  const request = getViewerModuleAvailability()
    .then((rows) => {
      if (requestGeneration !== generation) return
      if (!isCompleteAvailability(rows)) throw new Error('Module availability response is incomplete or invalid')
      const enabled: Partial<Record<ModuleId, boolean>> = {}
      const overrides: Partial<Record<ModuleId, PersonModuleOverride>> = {}
      for (const row of rows) {
        enabled[row.module_id] = row.enabled
        overrides[row.module_id] = row.person_override
      }
      publish({ status: 'ready', enabled, overrides, revision: rows[0].revision })
      lastLoadedAt = Date.now()
    })
    .catch(() => {
      if (requestGeneration !== generation) return
      publish({ ...snapshot, status: 'error' })
    })
    .finally(() => {
      if (requestGeneration === generation && pending === request) pending = null
    })
  pending = request
  return request
}

function availabilityIsOn(
  status: ModuleAvailabilityStatus,
  enabled: Partial<Record<ModuleId, boolean>>,
  overrides: Partial<Record<ModuleId, PersonModuleOverride>>,
  moduleId: ModuleId,
  roleAdmitted: boolean,
): boolean {
  if (!isModuleId(moduleId)) return false
  if (status !== 'ready' && status !== 'error') return false
  const orgEnabled = enabled[moduleId]
  const override = overrides[moduleId]
  if (typeof orgEnabled !== 'boolean' || !isOverride(override)) return false
  return effectiveModuleAccess({ released: true, orgEnabled, override, roleAdmitted }).available
}

function retainFocusRefresh(): () => void {
  focusSubscribers += 1
  if (focusSubscribers === 1 && typeof window !== 'undefined') {
    focusHandler = () => {
      if (signedInSession && Date.now() - lastLoadedAt > REFRESH_AFTER_MS) {
        void loadModuleAvailability({ force: true })
      }
    }
    window.addEventListener('focus', focusHandler)
  }
  return () => {
    focusSubscribers -= 1
    if (focusSubscribers === 0 && focusHandler) {
      window.removeEventListener('focus', focusHandler)
      focusHandler = null
    }
  }
}

export function useModuleAvailabilitySession(): string | null {
  const auth = useAuth()
  const session = auth.status === 'authenticated' ? `${auth.viewer.person.org_id}:${auth.viewer.person.id}` : null

  useEffect(() => {
    if (session) setSession(session)
    else resetModuleAvailability()
  }, [session])

  return session
}

export function useModuleAvailability() {
  const session = useModuleAvailabilitySession()
  const current = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT)
  const visible = session === signedInSession ? current : EMPTY_SNAPSHOT

  useEffect(() => {
    if (session) void loadModuleAvailability()
  }, [session])

  useEffect(() => retainFocusRefresh(), [])

  return {
    status: visible.status,
    isOn: (moduleId: ModuleId, roleAdmitted = true) =>
      availabilityIsOn(visible.status, visible.enabled, visible.overrides, moduleId, roleAdmitted),
    retry: () => { void loadModuleAvailability({ force: true }) },
  }
}
