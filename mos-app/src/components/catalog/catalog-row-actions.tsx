import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMenuPopover } from '@/lib/use-menu-popover'
import { useT } from '@/i18n/use-t'

export type CatalogRowActionsProps = {
  name: string
  archived: boolean
  canManage: boolean
  onRename: () => void
  onArchive: () => void
  onUnarchive: () => void
  disabled?: boolean
}

/** Shared catalog row actions: inline on wide rows, one menu on narrow rows. */
export function CatalogRowActions({
  name, archived, canManage, onRename, onArchive, onUnarchive, disabled = false,
}: CatalogRowActionsProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])
  useMenuPopover(open, close, menuRef, triggerRef)

  if (!canManage) return null

  const run = (action: () => void) => {
    setOpen(false)
    action()
  }
  const renameLabel = t('catalog.renameAria', { name })
  const archiveLabel = t('catalog.archiveAria', { name })
  const unarchiveLabel = t('catalog.unarchiveAria', { name })

  return (
    <>
      <div className="catalog-collection__actions catalog-collection__actions--desktop">
        {archived ? (
          <Button variant="ghost" disabled={disabled} aria-label={unarchiveLabel} onClick={onUnarchive}>
            {t('catalog.unarchive')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" disabled={disabled} aria-label={renameLabel} onClick={onRename}>{t('catalog.rename')}</Button>
            <Button variant="ghost" disabled={disabled} aria-label={archiveLabel} onClick={onArchive}>{t('catalog.archive')}</Button>
          </>
        )}
      </div>
      <div className="catalog-collection__actions catalog-collection__actions--mobile">
        <Button
          ref={triggerRef}
          variant="ghost"
          disabled={disabled}
          className="catalog-collection__menu-trigger"
          aria-label={t('catalog.moreActionsFor', { name })}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
          </svg>
        </Button>
        {open && (
          <span ref={menuRef} role="menu" className="catalog-collection__menu" aria-label={t('catalog.moreActionsFor', { name })}>
            {!archived && <>
              <Button role="menuitem" variant="ghost" disabled={disabled} aria-label={renameLabel} onClick={() => run(onRename)}>{t('catalog.rename')}</Button>
              <Button role="menuitem" variant="ghost" disabled={disabled} aria-label={archiveLabel} onClick={() => run(onArchive)}>{t('catalog.archive')}</Button>
            </>}
            {archived && <Button role="menuitem" variant="ghost" disabled={disabled} aria-label={unarchiveLabel} onClick={() => run(onUnarchive)}>{t('catalog.unarchive')}</Button>}
          </span>
        )}
      </div>
    </>
  )
}
