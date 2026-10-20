import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ModalShell } from '@/components/ui/modal-shell'
import { Picker } from '@/components/ui/picker'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { listAvailableCafeStreamItems, setCafeStreamItem, type AvailableCafeStreamItem } from '@/lib/db/cafe-stream-items'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

type CafeStreamItemsActionsProps = {
  stream: ProductionStream
  selectedItem?: { id: string; name: string }
  disabled: boolean
  onChanged: () => Promise<void>
}

export function CafeStreamItemsActions({ stream, selectedItem, disabled, onChanged }: CafeStreamItemsActionsProps) {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [hiding, setHiding] = useState(false)
  return <div className="cafe-stream-items-actions">
    <Button variant="outline" disabled={disabled} onClick={() => setAdding(true)}>{t('cafe.items.stream.add')}</Button>
    {selectedItem && <Button variant="ghost" disabled={disabled} onClick={() => setHiding(true)}>{t('cafe.items.stream.hide')}</Button>}
    {disabled && <span>{t('cafe.items.stream.saveFirst')}</span>}
    {hiding && selectedItem && <ConfirmDialog
      open
      title={t('cafe.items.stream.hideTitle', { item: selectedItem.name })}
      body={t('cafe.items.stream.hideBody')}
      confirmLabel={t('cafe.items.stream.hideConfirm')}
      onCancel={() => setHiding(false)}
      onConfirm={async () => {
        await setCafeStreamItem(stream, selectedItem.id, true)
        setHiding(false)
        await onChanged()
      }}
    />}
    {adding && <AddStreamItemDialog stream={stream} onClose={() => setAdding(false)} onChanged={onChanged} />}
  </div>
}

function AddStreamItemDialog({ stream, onClose, onChanged }: Pick<CafeStreamItemsActionsProps, 'stream' | 'onChanged'> & { onClose: () => void }) {
  const t = useT()
  const [items, setItems] = useState<AvailableCafeStreamItem[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const inFlight = useRef(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setState('loading')
    void listAvailableCafeStreamItems(stream).then(next => {
      if (active) { setItems(next); setState('ready') }
    }).catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [stream, retry])
  async function add() {
    if (!selected || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setSaveError(false)
    try {
      await setCafeStreamItem(stream, selected, false)
      await onChanged()
      onClose()
    } catch {
      setSaveError(true)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }
  return <ModalShell open onClose={onClose} ariaLabel={t('cafe.items.stream.add')} closeOnEscape={!saving}>
    <div className="confirm-dialog">
      <h2 className="confirm-dialog__title">{t('cafe.items.stream.add')}</h2>
      <p className="confirm-dialog__body">{t('cafe.items.stream.addBody')}</p>
      {state === 'loading' && <LoadingShell count={1} label={t('cafe.items.loading')} />}
      {state === 'error' && <ErrorState message={t('cafe.items.loadError')} onRetry={() => setRetry(current => current + 1)} />}
      {state === 'ready' && (items.length === 0 ? <p>{t('cafe.items.stream.empty')}</p> : <Picker
        label={t('cafe.items.stream.choose')}
        value={selected}
        options={items.map(item => ({ value: item.id, label: item.hidden ? t('cafe.items.stream.restore', { item: item.name }) : item.name }))}
        onChange={setSelected}
        disabled={saving}
        fullWidth
      />)}
      {saveError && <p role="alert">{t('cafe.items.saveError')}</p>}
      <div className="confirm-dialog__actions">
        <Button variant="outline" disabled={saving} onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" disabled={!selected || state !== 'ready' || saving} onClick={() => void add()}>{saving ? t('common.working') : t('cafe.items.stream.add')}</Button>
      </div>
    </div>
  </ModalShell>
}
