import { useState, useEffect, useCallback, useId } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { Button } from '@/components/ui/button'
import { TextInput } from '@/components/ui/text-input'
import { Tag } from '@/components/ui/tag'
import { ErrorState, EmptyState, SkeletonRows } from '@/components/ui/state-kit'
import type { TagColor } from '@/components/ui/tag'

// A managed catalog row: id + name + soft-archive flag, plus an optional display
// meta (e.g. the work-line type label "Project"/"Process") and its tag color.
export interface CatalogItem {
  id: string
  name: string
  archived_at: string | null
  meta?: string
  metaColor?: TagColor
}

// Optional create-time type field (work-lines have it; objectives don't — FR-013/014).
export interface CatalogTypeField {
  label: string
  options: { value: string; label: string }[]
}

export interface CatalogManagerProps {
  title: string
  subtitle: string
  /** Singular lower-case noun for copy, e.g. "objective". */
  noun: string
  /** Plural form for list/empty/error copy (naive +s is wrong for "project / process"). */
  nounPlural?: string
  load: () => Promise<CatalogItem[]>
  create: (name: string, type?: string) => Promise<unknown>
  rename: (id: string, name: string) => Promise<void>
  setArchived: (id: string, archived: boolean) => Promise<void>
  typeField?: CatalogTypeField
}

type LoadState = 'loading' | 'loaded' | 'error'

export function CatalogManager({
  title, subtitle, noun, nounPlural, load, create, rename, setArchived, typeField,
}: CatalogManagerProps) {
  const plural = nounPlural ?? `${noun}s`
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [items, setItems] = useState<CatalogItem[]>([])

  // Add form
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState(typeField?.options[0]?.value ?? '')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  // Off-screen live region for action outcomes / failures.
  const [live, setLive] = useState('')
  const announce = useCallback((msg: string) => setLive(msg), [])

  const nameInputId = useId()
  const typeInputId = useId()

  const refresh = useCallback(async () => {
    setLoadState('loading')
    try {
      setItems(await load())
      setLoadState('loaded')
    } catch {
      setLoadState('error')
    }
  }, [load])

  useEffect(() => { void refresh() }, [refresh])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) { setAddError('Name is required'); return }
    setAdding(true)
    setAddError('')
    try {
      await create(name, typeField ? newType : undefined)
      setNewName('')
      announce(`Added ${name}`)
      await refresh()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(item: CatalogItem) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditError('')
  }

  async function handleRename(e: React.FormEvent, id: string) {
    e.preventDefault()
    const name = editName.trim()
    if (!name) { setEditError('Name is required'); return }
    setSavingId(id)
    setEditError('')
    try {
      await rename(id, name)
      setEditingId(null)
      announce(`Renamed to ${name}`)
      await refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSavingId(null)
    }
  }

  async function handleArchive(item: CatalogItem, archived: boolean) {
    setSavingId(item.id)
    try {
      await setArchived(item.id, archived)
      announce(archived ? `Archived ${item.name}` : `Restored ${item.name}`)
      await refresh()
    } catch {
      announce(`Couldn't ${archived ? 'archive' : 'restore'} ${item.name}`)
    } finally {
      setSavingId(null)
    }
  }

  const active = items.filter((i) => i.archived_at == null)
  const archived = items.filter((i) => i.archived_at != null)

  return (
    <PageFrame>
      <PageHead title={title} subtitle={subtitle} />

      <div className="sr-only" aria-live="polite" role="status">{live}</div>

      {/* Add form */}
      <form onSubmit={handleAdd} aria-label={`Add ${noun}`} className="mb-6 flex flex-wrap items-end gap-3">
        <div className="grow" style={{ minWidth: 220 }}>
          <TextInput
            id={nameInputId}
            label="Name"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); if (addError) setAddError('') }}
            error={!!addError}
            fullWidth
            disabled={adding}
            placeholder={`New ${noun}…`}
            aria-describedby={addError ? `${nameInputId}-err` : undefined}
          />
        </div>
        {typeField && (
          <div>
            <label htmlFor={typeInputId} className="mb-1 block text-sm text-muted-foreground">
              {typeField.label}
            </label>
            <select
              id={typeInputId}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              disabled={adding}
              className="h-8 border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              style={{
                borderColor: 'var(--input)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                borderRadius: 'var(--radius-sm)', // control radius token — match the kit input/button beside it
              }}
            >
              {typeField.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" variant="primary" disabled={adding} aria-busy={adding}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
        {addError && (
          <p id={`${nameInputId}-err`} role="alert" className="w-full text-xs"
            style={{ color: 'var(--field-error-text)' }}>
            {addError}
          </p>
        )}
      </form>

      {loadState === 'loading' && <SkeletonRows count={4} />}
      {loadState === 'error' && (
        <ErrorState message={`Couldn't load ${plural}.`} onRetry={() => void refresh()} />
      )}

      {loadState === 'loaded' && (
        items.length === 0 ? (
          <EmptyState title={`No ${plural} yet`} copy={`Add your first ${noun} above.`} />
        ) : (
          <>
            <ul className="flex flex-col gap-1" aria-label={plural}>
              {active.map((item) => (
                <li key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2"
                  style={{ borderColor: 'var(--border)' }}>
                  {editingId === item.id ? (
                    <form onSubmit={(e) => handleRename(e, item.id)} className="flex grow items-center gap-2">
                      <TextInput
                        label=""
                        aria-label={`Rename ${item.name}`}
                        value={editName}
                        onChange={(e) => { setEditName(e.target.value); if (editError) setEditError('') }}
                        error={!!editError}
                        fullWidth
                        autoFocus
                        disabled={savingId === item.id}
                      />
                      <Button type="submit" variant="primary" disabled={savingId === item.id}>Save</Button>
                      <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      {editError && <span role="alert" className="text-xs" style={{ color: 'var(--field-error-text)' }}>{editError}</span>}
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 grow break-words text-sm" style={{ color: 'var(--foreground)' }}>{item.name}</span>
                      {item.meta && <Tag color={item.metaColor}>{item.meta}</Tag>}
                      <Button variant="ghost" onClick={() => startEdit(item)} aria-label={`Rename ${item.name}`}>Rename</Button>
                      <Button variant="ghost" onClick={() => void handleArchive(item, true)}
                        disabled={savingId === item.id} aria-label={`Archive ${item.name}`}>Archive</Button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {archived.length > 0 && (
              <>
                <h2 className="mb-1 mt-6 text-sm font-medium text-muted-foreground">Archived</h2>
                <ul className="flex flex-col gap-1" aria-label={`archived ${plural}`}>
                  {archived.map((item) => (
                    <li key={item.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 opacity-60"
                      style={{ borderColor: 'var(--border)' }}>
                      <span className="min-w-0 grow break-words text-sm line-through" style={{ color: 'var(--muted-foreground)' }}>{item.name}</span>
                      {item.meta && <Tag color={item.metaColor}>{item.meta}</Tag>}
                      <Button variant="ghost" onClick={() => void handleArchive(item, false)}
                        disabled={savingId === item.id} aria-label={`Unarchive ${item.name}`}>Unarchive</Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )
      )}
    </PageFrame>
  )
}
