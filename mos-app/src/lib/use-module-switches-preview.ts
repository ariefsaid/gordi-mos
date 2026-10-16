// The Modules preview's in-memory model, shared by the two surfaces that show it: the Modules page (Org
// switches) and a person's Modules section. Session memory only: never persisted, never applied to the
// shell. It is discarded as soon as neither surface is on screen. Contract: R/handover/module-switches.md.
import { useEffect, useSyncExternalStore } from 'react'
import { emptyPreviewModel, type ModuleId, type PersonModuleOverride, type PreviewModel } from '@/lib/module-switches-preview'

let current: PreviewModel | null = null
let mounted = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const set = (next: PreviewModel | null) => { current = next; emit() }

/** Test seam: forget any preview left over from another test. */
export function resetModulePreview() { mounted = 0; set(null) }

export function useModulePreview() {
  const model = useSyncExternalStore(subscribe, () => current, () => null)
  useEffect(() => {
    mounted += 1
    return () => {
      mounted -= 1
      // Deferred, so moving between the two surfaces (unmount then mount in one commit) keeps the preview.
      setTimeout(() => { if (mounted === 0 && current !== null) set(null) }, 0)
    }
  }, [])
  return {
    model,
    open: () => set(emptyPreviewModel()),
    leave: () => set(null),
    setOrg: (id: ModuleId, enabled: boolean) => {
      const base = current ?? emptyPreviewModel()
      set({ ...base, org: { ...base.org, [id]: enabled } })
    },
    setOverride: (personId: string, id: ModuleId, value: PersonModuleOverride) => {
      const base = current ?? emptyPreviewModel()
      set({ ...base, people: { ...base.people, [personId]: { ...(base.people[personId] ?? {}), [id]: value } } })
    },
  }
}
