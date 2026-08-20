/**
 * The ONE focusable-element query (Rule 11 component reuse, applied to a DOM helper).
 *
 * Three surfaces need "which controls inside this container can take focus": the record panel
 * host's open-focus + modal trap, ModalShell's trap, and the View & filters disclosure's
 * Arrow/Home/End traversal. They used to hand-roll three selectors that disagreed about
 * `[aria-disabled]`, `tabindex="-1"` and `type="hidden"` — so the same DOM was focusable in one
 * overlay and not in another. One selector + one filter, imported by all three.
 *
 * The selector is deliberately permissive and the FILTER does the deciding, because
 * `:not([disabled])`-style selectors cannot see an ancestor `hidden` or a computed `display:none`.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',')

function isFocusable(element: HTMLElement): boolean {
  // Disabled in either the native or the ARIA sense: neither can take focus meaningfully.
  if ('disabled' in element && (element as HTMLButtonElement).disabled) return false
  if (element.getAttribute('aria-disabled') === 'true') return false
  // Explicitly removed from the tab order (roving-tabindex composites park their inactive items
  // here, and a trap that landed on one would strand the user on an untabbable control).
  if (element.getAttribute('tabindex') === '-1') return false
  if (element.getAttribute('type') === 'hidden') return false
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false
  if (element.closest('[hidden], [aria-hidden="true"]')) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

/** Every control inside `container` that can actually take focus, in DOM order. */
export function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)
}
