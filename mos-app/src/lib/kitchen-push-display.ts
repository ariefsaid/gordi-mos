// How an ESB push is shown: its status word, target environment and WIB time. Shared by the Sent to ESB page
// and Review's Failed ESB sends queue, so the two always say the same thing about the same push.
import type { StatusKey } from '@/components/ui/status-badge'
import type { MessageKey } from '@/i18n/messages'
import type { EsbPushStatus, EsbTargetEnv } from '@/lib/db/kitchen-pushes'

// #402: labels come from the catalog — never the database's word. dead_letter is the
// RED tag on the AMBER row (OD-WAY-74 #4); its text uses the ratified AA-darkened red
// (--status-lost-text — same fix as StatusPill 'Blocked'), not the kit's tag-text-red.
export const PUSH_STATUS = { posted: 'posted', pending: 'pending', in_flight: 'inFlight', failed: 'failed', dead_letter: 'deadLetter' } as const satisfies Record<EsbPushStatus, StatusKey>

// target_env tag configuration: gkid = calm blue (live target — not an alarm, OQ-6 owner choice).
// goo / dry_run = neutral gray. Company codes render uppercased — how people write them.
type EnvTagConfig = { color: 'blue' | 'gray'; key: MessageKey }

export const ENV_TAG: Record<EsbTargetEnv, EnvTagConfig> = {
  gkid:    { color: 'blue', key: 'kitchen.pushes.env.gkid' },
  goo:     { color: 'gray', key: 'kitchen.pushes.env.goo' },
  dry_run: { color: 'gray', key: 'kitchen.pushes.env.dryRun' },
}

// ── Time formatting (WIB-aware display, tabular digits) ──

export function formatPushTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return '—'
  }
}

export function formatPushDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    }) + ' ' + formatPushTime(iso)
  } catch {
    return '—'
  }
}
