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
const FORBIDDEN_CHROME = /RecordPanelHost|drawer-modal-root|drawer-scrim/

// Inbox content seams owned by Issue 7 — chrome-free, no local host.
const INBOX_SEAMS = [
  'components/inbox/inbox-triage.tsx',
  'components/inbox/InboxList.tsx',
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

// Deputy shared-host adoption guard — activates when Issue 4 lands and AssistantPanel is cut over.
const ASSISTANT = 'components/assistant/AssistantPanel.tsx'
const deputyPresent = existsSync(resolve(SRC, ASSISTANT))

describe('NFR-V3-007: Deputy adopts the shared host (pending Issue 4 landing)', () => {
  it.runIf(deputyPresent)('AssistantPanel renders no local RecordPanelHost / drawer / scrim', () => {
    expect(readSrc(ASSISTANT)).not.toMatch(FORBIDDEN_CHROME)
  })
})
