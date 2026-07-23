import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const buttonCss = readFileSync(resolve(process.cwd(), 'src/components/ui/Button.css'), 'utf8')
const windowSelectorCss = readFileSync(resolve(process.cwd(), 'src/components/dashboard/window-selector.css'), 'utf8')
const cutToggleCss = readFileSync(resolve(process.cwd(), 'src/components/dashboard/cut-toggle.css'), 'utf8')
const textInputCss = readFileSync(resolve(process.cwd(), 'src/components/ui/TextInput.css'), 'utf8')
const selectCss = readFileSync(resolve(process.cwd(), 'src/components/ui/Select.css'), 'utf8')
const dateFieldCss = readFileSync(resolve(process.cwd(), 'src/components/ui/DateField.css'), 'utf8')
const taskSurfaceCss = readFileSync(resolve(process.cwd(), 'src/components/tasks/TaskSurface.css'), 'utf8')
// SYS-2 (census DO-3): the phone-floor guard was a hard-coded selector list, so every SYS-2
// instance lived in a file this scan never opened. These are the files that carried the sub-44px
// touch targets the gen-1 census found — the scan now covers them so a regression re-fails here.
const iconButtonCss = readFileSync(resolve(process.cwd(), 'src/components/ui/IconButton.css'), 'utf8')
const commandMenuCss = readFileSync(resolve(process.cwd(), 'src/components/command/command-menu.css'), 'utf8')
const signalComposerCss = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-composer.css'), 'utf8')
const mentionPickerCss = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-mention-picker.css'), 'utf8')

function mediaBody(css: string, query: string): string {
  const idx = css.indexOf(query)
  expect(idx, `expected to find ${query}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated media query: ${query}`)
}

describe('B-i: phone tap-target floor is encoded in shared CSS', () => {
  it('raises shared buttons, chips, touch-target markers, and icon-only utility controls to 44px on phone', () => {
    const body = mediaBody(buttonCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.btn[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.chip[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\[data-touch-target='true'\][\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.tap-target-phone--icon[\s\S]*min-width:\s*44px/)
    expect(body).toMatch(/\.tap-target-phone--icon[\s\S]*min-height:\s*44px/)
  })

  it('raises the dashboard window selector track, tabs, and custom date controls to 44px on phone', () => {
    const body = mediaBody(windowSelectorCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.window-selector-seg[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.window-selector-range[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.window-selector-field[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.window-selector-tab[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/input\[type='date'\][\s\S]*min-height:\s*44px/)
  })

  it('raises the dashboard cut-toggle track and tabs to 44px on phone', () => {
    const body = mediaBody(cutToggleCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.cut-toggle[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.cut-toggle-tab[\s\S]*min-height:\s*44px/)
  })

  // DO-15(a) (census-sweep R2 task-create F3): the floor lives at the PRIMITIVE seam so every
  // consumer (task-create form, record fields, future surfaces) inherits it — min-height beats
  // the per-surface height overrides (e.g. the create form's 36px rhythm) only on phone.
  it('DO-15(a): raises the shared field primitives (TextInput/Select/DateField) to 44px on phone', () => {
    expect(mediaBody(textInputCss, '@media (max-width: 767.98px)'))
      .toMatch(/\.mk-textinput__box[\s\S]*min-height:\s*44px/)
    const selectBody = mediaBody(selectCss, '@media (max-width: 767.98px)')
    expect(selectBody).toMatch(/\.mk-select__box[\s\S]*min-height:\s*44px/)
    expect(selectBody).toMatch(/\.mk-select__field[\s\S]*min-height:\s*44px/)
    expect(mediaBody(dateFieldCss, '@media (max-width: 767.98px)'))
      .toMatch(/\.mk-date__box[\s\S]*min-height:\s*44px/)
  })

  it("DO-15(a): raises the task-create form's non-primitive fields (textarea, loading field) to 44px on phone", () => {
    const body = mediaBody(taskSurfaceCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.tc-textarea[\s\S]*min-height:\s*44px/)
    expect(body).toMatch(/\.tc-loading-field[\s\S]*min-height:\s*44px/)
  })

  // ── SYS-2 (census DO-3): the surfaces the hard-coded list never scanned ──────────────────────
  it('SYS-2: raises the icon-only button primitive (.mk-iconbtn — Signal-composer close et al.) to 44px on phone', () => {
    const body = mediaBody(iconButtonCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.mk-iconbtn[\s\S]*min-width:\s*44px/)
    expect(body).toMatch(/\.mk-iconbtn[\s\S]*min-height:\s*44px/)
  })

  it('SYS-2: raises the ⌘K command rows (.cm-item) to 44px on phone', () => {
    const body = mediaBody(commandMenuCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.cm-item[\s\S]*min-height:\s*44px/)
  })

  it('SYS-2: raises the Signal-composer datetime control to 44px on phone', () => {
    const body = mediaBody(signalComposerCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.signal-composer-datetime input[\s\S]*min-height:\s*44px/)
  })

  it('SYS-2: raises the Signal mention rows (.mention-row) to 44px on phone', () => {
    const body = mediaBody(mentionPickerCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.mention-row[\s\S]*min-height:\s*44px/)
  })
})

// SYS-2 (census DO-3) — the inline/Tailwind touch surfaces the CSS-source scan structurally
// cannot see: the phone More-drawer rows + the full-width UserChip + Sign-out carry the shared
// `tap-target-phone` marker (whose 44px rule lives, and is asserted, in Button.css above). This
// block closes the "lives in inline-styles the scan never sees" half of the census criticism by
// asserting the MARKER is actually applied at each site.
describe('B-i: phone tap-target markers are applied at the inline/Tailwind touch sites', () => {
  const drawerTsx = readFileSync(resolve(process.cwd(), 'src/shell/mobile-drawer.tsx'), 'utf8')
  const userChipTsx = readFileSync(resolve(process.cwd(), 'src/shell/user-chip.tsx'), 'utf8')

  it('the More-drawer destination rows carry the tap-target-phone marker', () => {
    // The nav-link className string in the drawer includes the marker.
    expect(drawerTsx).toMatch(/tap-target-phone flex items-center gap-\[10px\]/)
  })

  it('the full-width UserChip (rail foot + phone drawer) carries the tap-target-phone marker', () => {
    expect(userChipTsx).toMatch(/tap-target-phone flex w-full items-center/)
  })

  it('the UserChip Sign-out row carries the tap-target-phone marker', () => {
    expect(userChipTsx).toMatch(/tap-target-phone w-full text-left/)
  })
})
