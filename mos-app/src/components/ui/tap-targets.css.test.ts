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
const helpTipCss = readFileSync(resolve(process.cwd(), 'src/components/ui/help-tip.css'), 'utf8')
const helpTipTsx = readFileSync(resolve(process.cwd(), 'src/components/ui/help-tip.tsx'), 'utf8')
// #708: the Signal composer's attention pills (43.2×44 / 42.2×44 measured) and the record panel's
// Close / Ask Deputy buttons (32×32, `.record-panel-btn`) sat under the phone tap floor.
const attentionPickerCss = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-attention-picker.css'), 'utf8')
const recordPanelHostCss = readFileSync(resolve(process.cwd(), 'src/shell/record-panel-host.css'), 'utf8')

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
    expect(body).toMatch(/\.tap-floor[\s\S]*min-width:\s*44px/)
    expect(body).toMatch(/\.tap-floor[\s\S]*min-height:\s*44px/)
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

  it('ticket 667: keeps the help-tip anchor inline while its button owns a ≥44px pseudo hit box', () => {
    expect(helpTipTsx).not.toMatch(/help-tip-anchor tap-floor/)
    expect(helpTipCss).toMatch(/\.help-tip::before\s*\{[^}]*inset:\s*-16px/)
  })

  // #708: 43.2×44 / 42.2×44 measured — height already met the floor, width did not. Anchored with
  // [^}]* (never [\s\S]*) so the match cannot cross into a LATER rule in the same file/media body.
  it('issue 708: raises the Signal composer attention pills to a ≥44px width floor on phone', () => {
    const body = mediaBody(attentionPickerCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.signal-attention-picker-option[^}]*min-width:\s*44px/)
  })

  // #708: `.record-panel-btn` already rests at 44×44 (P1-2), but the `@media (pointer: fine)`
  // tighten-down carried no width guard — ANY environment reporting a fine pointer (a resized
  // desktop window, a non-touch mobile emulation) fired it at phone width too, which is exactly
  // how Close/Ask Deputy measured 32×32 under 767px. The fix narrows the query itself so the
  // 32px rule can only win at ≥768px; that is a stronger claim than "a bigger min-width exists
  // somewhere", so assert the query condition text directly.
  it('issue 708: the record-panel-btn fine-pointer tighten-down only fires at desktop width (≥768px)', () => {
    expect(recordPanelHostCss).toMatch(/@media \(pointer: fine\) and \(min-width: 768px\)\s*\{\s*\.record-panel-btn\s*\{\s*width:\s*32px;\s*height:\s*32px;\s*\}/)
    // Negative check: no OTHER bare `(pointer: fine)` block (unguarded by a min-width) remains
    // for this file — a second unnarrowed block would silently reopen the same hole.
    expect(recordPanelHostCss).not.toMatch(/@media \(pointer: fine\)\s*\{(?!\s*\})/)
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

  // ── #403 (port sweep): the auth cards — no primitives underneath, inline 32px heights ──────
  // THIS IS THE ONLY LANE THAT GATES A PR→dev MERGE (`verify` is dev's sole required check), so
  // it must carry BOTH axes of DESIGN.md's 44×44 phone floor, not just the height. The rendered
  // twin — e2e/guards.geometry.spec.ts, run by .github/workflows/geometry.yml — measures the real
  // box, but it is not a required check, so it cannot be the only thing standing behind the claim.
  // Every pattern below is anchored with [^}]* rather than [\s\S]*: [\s\S]* spans the whole media
  // body, so it proves only that the text appears SOMEWHERE after the selector, not that the
  // declaration belongs to that rule. [^}]* cannot cross the closing brace of the block.
  it('auth-card phone floor (ticket 403): input/button/a ≥44×44 in shared CSS, <a> gets a box)', () => {
    const authCss = readFileSync(resolve(process.cwd(), 'src/auth/auth.css'), 'utf8')
    const body = mediaBody(authCss, '@media (max-width: 767.98px)')
    expect(body).toMatch(/\.auth-card :is\(input, button, a\)[^}]*min-height:\s*44px/)
    // Both axes: the demo persona chips proved a control can be 44 tall and still only 37 wide.
    expect(body).toMatch(/\.auth-card :is\(input, button, a\)[^}]*min-width:\s*44px/)
    // min-height is ignored on inline boxes — the "Back to sign in" <a> needs a real box.
    expect(body).toMatch(/\.auth-card a[^}]*display:\s*inline-flex/)
  })

  it('auth-card marker (ticket 403): the shared AuthCard carries the class every auth page renders through)', () => {
    const shellTsx = readFileSync(resolve(process.cwd(), 'src/auth/auth-shell.tsx'), 'utf8')
    expect(shellTsx).toMatch(/className="auth-card /)
  })
})
