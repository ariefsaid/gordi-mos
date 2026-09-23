import type { KeyboardEvent } from 'react'
import { focusableWithin } from '@/lib/focusable'

const TRAVERSAL_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']

// Controls that already own these keys natively — a <select>'s option list, a text caret, a
// number/range/radio input — and composites that run their own roving handler (ViewTabs' tablist,
// menus, listboxes). A traversal that fired on these would STEAL the key from the very control the
// panel exists to operate, which is the defect this file was written to fix, not to re-commit.
const OWNS_KEYS = 'select, textarea, input:not([type="checkbox"]), [contenteditable="true"]'
const OWNS_KEYS_COMPOSITE = '[role="tablist"], [role="listbox"], [role="menu"], [role="radiogroup"]'

/**
 * Arrow/Home/End traversal between a phone View & filters panel's own controls (#382), shared by
 * phone hosts using ViewOptionsDisclosure.
 *
 * Attach it to the panel element: the live control set is read from `event.currentTarget` on every
 * key, so controls that appear while the panel is open (the Save-view row) join the traversal
 * without any registration.
 *
 * Focus is NOT moved into the panel on open. A disclosure is not an overlay — DESIGN.md requires
 * focus entry of *real overlays* — and auto-focusing the first filter `<select>` killed the
 * collection's j/k row cursor with no keyboard way back out (PR #394 review, blocking 1).
 */
export function viewOptionsTraversal(event: KeyboardEvent<HTMLElement>): void {
  if (!TRAVERSAL_KEYS.includes(event.key)) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement
  if (target.matches(OWNS_KEYS) || target.closest(OWNS_KEYS_COMPOSITE)) return
  const controls = focusableWithin(event.currentTarget)
  const current = controls.indexOf(target)
  if (current < 0) return
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? controls.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length
  event.preventDefault()
  controls[next]?.focus()
}
