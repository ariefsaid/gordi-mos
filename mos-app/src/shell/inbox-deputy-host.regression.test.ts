// Issue 7 no-legacy-host / no-double-panel guard (docs/plans/2026-07-20-v3-inbox-deputy.md §7,
// NFR-V3-007). Narrow, deterministic source scan: the Inbox triage surface must be chrome-free —
// it must NOT import or render a RecordPanelHost, a legacy drawer root, or a scrim. The shared
// Issue 4 host owns the modal regime, scrim, and close; the Inbox seams only pass content into it.
//
// SCOPE NOTE: the plan's full guard also asserts the single Issue 4 `overlay-host.tsx` slot
// (exactly one `[data-overlay-host]` / one `RecordPanelHost`). Issue 4 is NOT landed on this
// branch, so that half is deferred to when the host lands. The `deputyHostAdopted` check below
// activates automatically once AssistantPanel.tsx exists at the shared-host seam; until then the
// Deputy-cutover assertions are marked pending (test.skip) rather than asserted against absent code.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

function readSrc(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
}

// Legacy/host chrome that must never appear in an Inbox content seam.
const FORBIDDEN_CHROME = /from ['"]@\/shell\/record-panel-host|drawer-modal-root|drawer-scrim|className=["'][^"']*\bscrim\b/

// Inbox content seams owned by Issue 7 — chrome-free, no local host.
//
// `components/inbox/InboxList.tsx` is NOT on this list (unlike v4-redesign, which kept it as a
// leftover fossil — dead code, unreferenced by anything but its own test). #195 deleted it in the
// same PR that ported InboxTriage, which is InboxPage's real content surface now; there is nothing
// left at that path for a source scan to read.
const INBOX_SEAMS = [
  'components/inbox/inbox-triage.tsx',
  'pages/inbox-page.tsx',
] as const

describe('NFR-V3-007: Inbox surfaces own no local overlay host or scrim', () => {
  for (const rel of INBOX_SEAMS) {
    it(`${rel} does not import or render a RecordPanelHost / drawer / scrim`, () => {
      expect(readSrc(rel)).not.toMatch(FORBIDDEN_CHROME)
    })
  }

  it('the Inbox target resolver never uses raw notificationRoute as canonical authority', () => {
    // The producer route is legacy input only; canonical routes come from the typed viewer adapter.
    expect(readSrc('components/inbox/inbox-target.ts')).not.toMatch(/notificationRoute/)
  })

  it('Inbox does not gate a Deputy path behind a hidden command-only or fake feature flag', () => {
    // No `SHOW_INBOX` fake flag; the bell is an honest capability-filtered door, not a secret path.
    const triage = readSrc('components/inbox/inbox-triage.tsx')
    expect(triage).not.toMatch(/SHOW_INBOX/)
  })
})

// Deputy shared-host adoption guard — activates once AssistantPanel is cut over to the shared host.
//
// PORT NOTE (#195): v4-redesign gated this on the FILE'S EXISTENCE (`existsSync`), because on that
// branch AssistantPanel.tsx didn't exist until the same effort that migrated it onto the shared
// host — existence implied adoption. On `dev` the two are decoupled: Stage 2 (#190) landed the
// shared overlay host, but `dev`'s pre-existing AssistantPanel.tsx has not been migrated onto it
// (a separate, untracked-here Deputy port). Gating on existence would fail this suite for a surface
// #195 never touched. Gate on the actual adoption signal instead — the `OverlayCompanionSlot`
// import — so the guard stays dormant until Deputy really does adopt the host, exactly the
// original intent, just keyed off a condition that is still true after the timelines diverged.
const ASSISTANT = 'components/assistant/AssistantPanel.tsx'
const deputyHostAdopted =
  existsSync(resolve(SRC, ASSISTANT)) && /OverlayCompanionSlot/.test(readSrc(ASSISTANT))

describe('NFR-V3-007: Deputy adopts the shared host (pending its own migration)', () => {
  it.runIf(deputyHostAdopted)('AssistantPanel renders no local RecordPanelHost / drawer / scrim', () => {
    const source = readSrc(ASSISTANT)
    expect(source).not.toMatch(FORBIDDEN_CHROME)
    expect(source).toMatch(/OverlayCompanionSlot/)
  })
})
