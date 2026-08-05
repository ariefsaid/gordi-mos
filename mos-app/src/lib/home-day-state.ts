// home-day-state.ts — the Home header's day state. Pure, no I/O, no clock.
//
// Ported from the signed mockup `docs/design-mockups/home-priority-2026-07-28/index.html`
// (`stateLine`). The mockup's own note is the binding constraint and is restated here because it
// is the reason this file exists at all:
//
//   "Earlier drafts hard-coded 'Cahya's grinder is fixed', which only a language model could
//    generate and only for one day's data. This picks a band from the counts, then rotates within
//    that band, so every message is TRUE BY CONSTRUCTION and none of them names anything the app
//    cannot count."
//
// So: two counts choose a BAND (a deterministic rule), and a rotating index chooses one of that
// band's interchangeable phrasings. There is no model in this path and there must never be one.
// New phrasings may be added INSIDE a band; a phrasing must never move across bands, because the
// band is what makes it true.
import type { MessageKey } from '@/i18n/messages'

export type DayStateBand = 'clear' | 'fresh' | 'countdown' | 'stretch' | 'most' | 'half' | 'early'

/**
 * The rule. Order is load-bearing:
 *  - `left === 0` first, so a day with nothing on it reads "clear", never "fresh".
 *  - `done === 0` next, so an untouched day reads "fresh" even when only 2 things are on it.
 *  - `left <= 3` next — once the end is in sight a countdown beats an adjective, and the number
 *    is real.
 *  - then the proportional bands.
 */
export function dayStateBand(done: number, left: number): DayStateBand {
  if (left === 0) return 'clear'
  if (done === 0) return 'fresh'
  if (left <= 3) return 'countdown'
  const pct = done / (done + left)
  if (pct >= 0.75) return 'stretch'
  if (done > left) return 'most'
  if (pct >= 0.4) return 'half'
  return 'early'
}

/** The interchangeable phrasings per band (3–4 each). `countdown` has none — it IS the number. */
export const DAY_STATE_PHRASINGS = {
  fresh: ['home.day.fresh.1', 'home.day.fresh.2', 'home.day.fresh.3', 'home.day.fresh.4'],
  early: ['home.day.early.1', 'home.day.early.2', 'home.day.early.3', 'home.day.early.4'],
  half: ['home.day.half.1', 'home.day.half.2', 'home.day.half.3', 'home.day.half.4'],
  most: ['home.day.most.1', 'home.day.most.2', 'home.day.most.3'],
  stretch: ['home.day.stretch.1', 'home.day.stretch.2', 'home.day.stretch.3'],
  clear: ['home.day.clear.1', 'home.day.clear.2', 'home.day.clear.3', 'home.day.clear.4'],
} as const satisfies Record<Exclude<DayStateBand, 'countdown'>, readonly MessageKey[]>

export interface DayStateLine {
  band: DayStateBand
  key: MessageKey
  /** Set on the `countdown` band only — the literal number of things still to go. */
  count?: number
}

/** Band + one of its phrasings, chosen by `rotation` (any integer; wraps, never runs off). */
export function dayStateLine(done: number, left: number, rotation: number): DayStateLine {
  const band = dayStateBand(done, left)
  if (band === 'countdown') return { band, key: 'home.day.countdown', count: left }
  const options: readonly MessageKey[] = DAY_STATE_PHRASINGS[band]
  const i = ((Math.trunc(rotation) % options.length) + options.length) % options.length
  return { band, key: options[i] }
}

/** The handled share of the day, 0–100. An empty day is complete, not a division by zero.
 *
 *  CLAMPED, and not defensively: `left` is a SUM of independently-read region counts, so an
 *  inconsistent set of reads can put more behind the day than in front of it. The consumer emits
 *  this straight into `aria-valuenow` beside a fixed `aria-valuemax="100"` and into the fill's
 *  width — an unclamped 200 is an invalid progressbar and a fill twice the width of its track. */
export function dayProgressPct(done: number, left: number): number {
  const total = done + left
  if (total <= 0) return 100
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)))
}

/**
 * The rotating index. Derived from the WIB calendar date (`YYYY-MM-DD`) so the wording is STABLE
 * for a whole day — a random pick would re-roll on every React re-render and make the header
 * flicker — and different tomorrow. Never negative; an unparseable date rotates to 0.
 */
export function dayRotation(todayISO: string): number {
  const day = Number.parseInt(todayISO.slice(8, 10), 10)
  return Number.isFinite(day) && day > 0 ? day : 0
}
