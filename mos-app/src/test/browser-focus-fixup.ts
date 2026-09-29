// jsdom leaves focus on a control that becomes disabled; real browsers move it to <body>.
// Install in a test that asserts focus after a save that disables its inputs. The drop is applied
// synchronously (jsdom cannot blur an already-disabled control) wherever a control can be disabled: the attribute calls and the `disabled` property.
const PROTOS = [HTMLInputElement, HTMLButtonElement, HTMLTextAreaElement, HTMLSelectElement].map((c) => c.prototype)

export function installDisabledBlur(): () => void {
  const dropFocus = (el: Element) => { if (el === document.activeElement && el instanceof HTMLElement) el.blur() }
  const originalSet = Element.prototype.setAttribute
  const originalToggle = Element.prototype.toggleAttribute
  Element.prototype.setAttribute = function setAttribute(this: Element, name: string, value: string) {
    if (name === 'disabled') dropFocus(this)
    originalSet.call(this, name, value)
  }
  Element.prototype.toggleAttribute = function toggleAttribute(this: Element, name: string, force?: boolean) {
    if (name === 'disabled' && force !== false && !this.hasAttribute('disabled')) dropFocus(this)
    return originalToggle.call(this, name, force)
  }
  const descriptors = PROTOS.map((proto) => Object.getOwnPropertyDescriptor(proto, 'disabled'))
  PROTOS.forEach((proto, i) => {
    const d = descriptors[i]
    if (!d?.set) return
    Object.defineProperty(proto, 'disabled', {
      ...d,
      set(this: HTMLElement, value: boolean) { if (value) dropFocus(this); d.set!.call(this, value) },
    })
  })
  return () => {
    Element.prototype.setAttribute = originalSet
    Element.prototype.toggleAttribute = originalToggle
    PROTOS.forEach((proto, i) => { const d = descriptors[i]; if (d) Object.defineProperty(proto, 'disabled', d) })
  }
}
