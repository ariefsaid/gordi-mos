// ChoiceDialog — the focused picker a person-page card opens with "Change": Teams, Position, Access
// level, Revenue scope. Ticking writes nothing; the footer says what will change and Save applies it.
//
// The data layer writes one row at a time (add/end a membership, grant/revoke a role, ...), so Save
// runs those writes in sequence. Each row reports beside itself (Saving… → Saved, or Failed · Retry);
// when every row saved the dialog closes, otherwise it stays open on the failures until they are
// retried or the admin closes it. A failed request can still have committed, so a failed row whose
// re-read value already equals the asked one reads Saved.
//
// Guards stay where they were: a row that may not change is disabled with its reason as its
// description; `confirms` names the changes that must be confirmed first (Admin, Ops Lead).
// Centered on desktop, full screen on a phone.
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '@/i18n/use-t'
import { matchesTokens } from '@/lib/token-search'
import { ModalShell } from '@/components/ui/modal-shell'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SearchField } from '@/components/ui/search-field'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { useIsOffline } from '@/shell/use-is-offline'
import { CheckboxRow } from './checkbox-row'
import { RowStatus } from './row-status'
import type { RowCommitStatus } from './use-row-commits'
import './admin-settings.css'

export interface Choice {
  id: string
  label: string
  description?: string
  /** Why this row may not change (self-assign, last admin); shown as its description. */
  lockedReason?: string
  /** Heading for a run of rows (Revenue scope channels). */
  group?: string
  emphasis?: boolean
  indent?: boolean
  /** Shown beside the row (the Home badge). */
  badge?: ReactNode
}

export interface ChoiceChange { id: string; wanted: boolean }
export interface ConfirmSpec { title: string; body: string; confirmLabel: string }

export interface ChoiceDialogProps {
  title: string
  /** One short line under the title: what this choice decides. */
  description?: string
  choices: readonly Choice[]
  /** What the person has now, from the latest read. */
  saved: ReadonlySet<string>
  /** Show the search box (long lists). */
  searchable?: boolean
  searchLabel?: string
  /** Put what the person has first, under "Current". Off for grouped lists. */
  pinSelected?: boolean
  /** What to say when there is nothing to choose from. */
  emptyText?: string
  saveLabel: string
  /** Writes one change. `succeeded` holds the changes already written in this Save. */
  write: (change: ChoiceChange, succeeded: ReadonlySet<string>) => Promise<void>
  /** Order the writes (Teams: endings before additions). Default: as listed. */
  order?: (changes: ChoiceChange[]) => ChoiceChange[]
  confirms?: (changes: ChoiceChange[]) => ConfirmSpec[]
  /** A line in the footer about the draft (e.g. "They will have no Home team"). */
  draftNote?: (draft: ReadonlySet<string>) => string | undefined
  /** Re-read the person after the writes. */
  refresh: () => Promise<void>
  onClose: (saved: boolean) => void
}

type RowState = { status: RowCommitStatus; error?: string }

export function ChoiceDialog({
  title, description, choices, saved, searchable = false, searchLabel, pinSelected = true, emptyText, saveLabel,
  write, order = (c) => c, confirms, draftNote, refresh, onClose,
}: ChoiceDialogProps) {
  const t = useT()
  const titleId = useId()
  const descId = useId()
  const offline = useIsOffline()
  const [draft, setDraft] = useState<Set<string>>(() => new Set(saved))
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<'edit' | 'confirm' | 'saving' | 'failed'>('edit')
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [confirmIndex, setConfirmIndex] = useState(0)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  // The order is fixed when the dialog opens, so a row never jumps away from the pointer that ticked it.
  const [initial] = useState(() => new Set(saved))
  const succeeded = useRef(new Set<string>())

  const changes = useMemo<ChoiceChange[]>(() => choices
    .filter((c) => draft.has(c.id) !== saved.has(c.id))
    .map((c) => ({ id: c.id, wanted: draft.has(c.id) })), [choices, draft, saved])
  const adding = changes.filter((c) => c.wanted).length
  const removing = changes.length - adding
  const pendingConfirms = useMemo(() => (confirms ? confirms(changes) : []), [confirms, changes])
  const busy = phase === 'saving'

  const visible = choices.filter((c) => matchesTokens(query, [c.label, c.description]))
  const current = pinSelected && !query ? visible.filter((c) => initial.has(c.id)) : []
  const rest = pinSelected && !query ? visible.filter((c) => !initial.has(c.id)) : visible

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function runOne(change: ChoiceChange) {
    setRows((prev) => ({ ...prev, [change.id]: { status: 'saving' } }))
    try {
      await write(change, succeeded.current)
      succeeded.current.add(change.id)
      setRows((prev) => ({ ...prev, [change.id]: { status: 'saved' } }))
      return true
    } catch (err) {
      setRows((prev) => ({ ...prev, [change.id]: { status: 'failed', error: err instanceof Error ? err.message : undefined } }))
      return false
    }
  }

  async function runAll() {
    setPhase('saving')
    setRefreshFailed(false)
    succeeded.current = new Set()
    let failed = 0
    for (const change of order(changes)) {
      if (!(await runOne(change))) failed += 1
    }
    try {
      await refresh()
      if (failed === 0) onClose(true)
      else setPhase('failed')
    } catch {
      setRefreshFailed(true)
      setPhase('failed')
    }
  }

  async function retryRefresh() {
    setPhase('saving')
    try {
      await refresh()
      setRefreshFailed(false)
      if (succeeded.current.size === changes.length) onClose(true)
      else setPhase('failed')
    } catch {
      setRefreshFailed(true)
      setPhase('failed')
    }
  }

  async function retry(change: ChoiceChange) {
    await runOne(change)
    try {
      await refresh()
      setRefreshFailed(false)
    } catch {
      setRefreshFailed(true)
      setPhase('failed')
    }
  }

  function save() {
    if (pendingConfirms.length > 0) {
      setConfirmIndex(0)
      setPhase('confirm')
    } else {
      void runAll()
    }
  }

  // What a row shows: the attempted value while saving or failed, else the draft. A failure the
  // database already holds reads Saved.
  function rowStatus(id: string): RowCommitStatus | undefined {
    const row = rows[id]
    if (row?.status === 'failed' && saved.has(id) === draft.has(id)) return 'saved'
    return row?.status
  }
  const failures = changes.filter((c) => rowStatus(c.id) === 'failed')

  const renderRow = (choice: Choice, index: number) => (
    <CheckboxRow
      key={choice.id}
      label={choice.label}
      description={choice.lockedReason ?? choice.description}
      checked={draft.has(choice.id)}
      disabled={choice.lockedReason !== undefined || phase === 'failed' || offline}
      busy={busy}
      divider={index > 0}
      indent={choice.indent}
      emphasis={choice.emphasis}
      title={choice.lockedReason}
      onToggle={() => toggle(choice.id)}
      trailing={
        <>
          {choice.badge}
          <RowStatus
            status={rowStatus(choice.id)}
            error={rows[choice.id]?.error}
            item={choice.label}
            onRetry={() => void retry({ id: choice.id, wanted: draft.has(choice.id) })}
          />
        </>
      }
    />
  )

  // Runs of rows under their group heading, in list order.
  const renderList = (list: readonly Choice[]) => {
    const runs: { group?: string; items: Choice[] }[] = []
    for (const choice of list) {
      const last = runs[runs.length - 1]
      if (last && last.group === choice.group) last.items.push(choice)
      else runs.push({ group: choice.group, items: [choice] })
    }
    return runs.map((run, i) => (
      <div key={run.group ?? `run-${i}`} className="choice-dialog__run">
        {run.group && <h3 className="choice-dialog__group">{run.group}</h3>}
        <div className="admin-choice-list">{run.items.map(renderRow)}</div>
      </div>
    ))
  }

  const summary = changes.length === 0
    ? t('admin.picker.noChanges')
    : [adding > 0 && t('admin.picker.adding', { count: adding }), removing > 0 && t('admin.picker.removing', { count: removing })].filter(Boolean).join(' · ')
  const note = draftNote?.(draft)
  const confirm = phase === 'confirm' ? pendingConfirms[confirmIndex] : undefined

  return (
    <ModalShell
      open
      onClose={() => { if (!busy) onClose(false) }}
      ariaLabelledBy={titleId}
      ariaDescribedBy={description ? descId : undefined}
      closeOnEscape={!busy && phase !== 'confirm'}
      phoneMode="fullscreen"
      className="choice-dialog-surface"
    >
      <div className="choice-dialog">
        <header className="choice-dialog__head">
          <h2 id={titleId} className="choice-dialog__title">{title}</h2>
          {description && <p id={descId} className="choice-dialog__description">{description}</p>}
          {searchable && (
            <SearchField
              className="choice-dialog__search"
              label={searchLabel ?? t('admin.picker.search')}
              placeholder={t('admin.person.filterPlaceholder')}
              value={query}
              onChange={setQuery}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </header>

        <div className="choice-dialog__body">
          {offline && <Notice tone="attention">{t('common.offline.reconnect')}</Notice>}
          {visible.length === 0 ? (
            <p className="choice-dialog__empty">{choices.length === 0 ? (emptyText ?? t('admin.picker.none')) : t('admin.person.filterEmpty', { q: query.trim() })}</p>
          ) : (
            <>
              {current.length > 0 && (
                <section aria-label={t('admin.picker.current')}>
                  <h3 className="choice-dialog__group">{t('admin.picker.currentCount', { count: current.length })}</h3>
                  <div className="admin-choice-list">{current.map(renderRow)}</div>
                </section>
              )}
              {current.length > 0 && rest.length > 0 && <h3 className="choice-dialog__group">{t('admin.picker.others')}</h3>}
              {renderList(rest)}
            </>
          )}
        </div>

        <footer className="choice-dialog__foot">
          {phase === 'failed' ? (
            <p className="choice-dialog__summary choice-dialog__summary--failed" role="alert">
              {refreshFailed
                ? t('admin.people.loadError')
                : t(failures.length === 1 ? 'admin.picker.failedOne' : 'admin.picker.failedMany', { count: failures.length })}
            </p>
          ) : (
            <div className="choice-dialog__summary" role="status">
              <span>{summary}</span>
              {note && <span className="choice-dialog__note">{note}</span>}
            </div>
          )}
          <div className="choice-dialog__actions">
            {phase === 'failed' ? (
              refreshFailed ? (
                <>
                  <Button variant="outline" onClick={() => onClose(false)}>{t('common.cancel')}</Button>
                  <Button variant="primary" onClick={() => void retryRefresh()}>{t('admin.row.retry')}</Button>
                </>
              ) : (
                <Button variant="primary" onClick={() => onClose(true)}>{t('admin.picker.close')}</Button>
              )
            ) : (
              <>
                <Button variant="outline" disabled={busy} onClick={() => onClose(false)}>{t('common.cancel')}</Button>
                <Button variant="primary" disabled={busy || changes.length === 0 || offline} aria-busy={busy || undefined} onClick={save}>
                  {busy ? t('admin.row.saving') : saveLabel}
                </Button>
              </>
            )}
          </div>
        </footer>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          tone="primary"
          onConfirm={async () => {
            if (confirmIndex + 1 < pendingConfirms.length) setConfirmIndex(confirmIndex + 1)
            else void runAll()
          }}
          onCancel={() => setPhase('edit')}
        />
      )}
    </ModalShell>
  )
}
