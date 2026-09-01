// #410 — the check the parity test cannot make.
//
// The parity type + test prove every key EXISTS in both locales; they can never notice that an
// Indonesian VALUE is still the English word. That is exactly how `kitchen.stock.col.dish`
// (now `kitchen.stock.col.item`, value 'Item' per OD-WAY-85),
// `kitchen.pushes.col.error` and `kitchen.pushes.col.target` shipped as 'Dish'/'Error'/'Target'
// in the id catalog while v4 had them translated ('Hidangan'/'Kesalahan'/'Tujuan') — a shared
// key is skipped by a "keys dev lacks" sweep, and a catalog value is skipped by a "hardcoded
// literal" sweep.
//
// The rule: an id value equal to its en value is a translation HOLE unless the key is on the
// curated allowlist below. Adding a key here is a claim that the English word IS the Indonesian
// word for this surface (brand names, borrowed terms, codes) — make it deliberately.
import { describe, it, expect } from 'vitest'
import { messages } from './messages'

/**
 * Keys whose Indonesian value legitimately equals the English one — brand/product names (GOO,
 * GKID, Gordi MOS), borrowed or shared vocabulary (Status, Detail, PIC, Email, WIB, porsi,
 * Info, Log, Login, Batch, Endpoint, Target-as-noun is NOT here — see the fixed set), and
 * symbols/templates with no words of their own.
 */
const ID_EQUALS_EN_ALLOWLIST: ReadonlySet<string> = new Set([
  'common.docTitle', // ${page} — Gordi MOS
  'locale.en', // English — the language's own name in its own language
  'locale.id', // Bahasa Indonesia
  'dev.views.render', // Render (dev-only surface)
  'inbox.severity.info', // Info
  'inbox.target.type.followUp', // AR Follow-up — product term
  'followUps.counterparty', // Counterparty — domain term, no adopted id label yet
  'money.footnote.interim', // Interim
  'breadcrumb.detail', // Detail
  'dest.ecommerce', // Ecommerce
  'dest.roastery', // Roastery
  'inbox.quickTitle', // Inbox
  'nav.cafe.log', // Log
  'nav.ecommerce', // Ecommerce
  'nav.roastery', // Roastery
  'rail.b2bOps', // B2B Ops
  'rail.retailOps', // Retail Ops
  'kitchen.actionType.transferTo.short', // → ${branch} — symbol template
  'kitchen.activity.bar', // Bar
  'kitchen.log.col.status', // Status
  'kitchen.log.offline.aria', // Offline
  'kitchen.pushes.col.batch', // Batch
  'kitchen.pushes.col.endpoint', // Endpoint
  'kitchen.pushes.col.status', // Status
  'kitchen.pushes.env.gkid', // GKID — environment name
  'kitchen.pushes.env.goo', // GOO — environment name
  'kitchen.unit.porsi', // porsi — already Indonesian
  'followUps.record.title', // Follow-up — product term
  'tasks.checklistTitle', // Checklist
  'tasks.feed.checklist', // Checklist
  'tasks.filter.sortPic', // PIC A–Z
  'tasks.filter.sortStatus', // Status
  'tasks.filter.status', // Status
  'tasks.meta.totalCount', // ${count} total
  'tasks.objective', // Objective — id UI keeps the borrowed term today
  'tasks.pic', // PIC
  'tasks.status.label', // Status
  'tasks.supervisor', // Supervisor
  'signals.composer.occurredHint', // WIB
  'signals.mention.group.bu', // BU
  'signals.record.revisionDiff', // “${from}” → “${to}” — symbol template
  'admin.people.col.login', // Login
  'admin.people.card.email', // Email
  'admin.people.card.status', // Status
  'admin.role.admin', // Admin
  'admin.role.supervisor', // Supervisor
  'admin.create.email', // Email
  // #410 review-page chrome: 'Item' is the same word in both locales.
  'kitchen.review.col.item', // Item
  'kitchen.log.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.plan.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.stock.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.plan.pesanan.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.log.footer.item.one', // ${count} item — same word in both locales (OD-WAY-85)
  'inbox.filter.withCount', // ${label} · ${count} — separator is punctuation, locale-neutral
])

describe('id catalog values are Indonesian (#410 inverse of the parity test)', () => {
  it('every id value equal to its en value is on the curated allowlist', () => {
    const en = messages.en as Record<string, string>
    const id = messages.id as Record<string, string>
    const offenders = Object.keys(en).filter(
      (key) => id[key] === en[key] && !ID_EQUALS_EN_ALLOWLIST.has(key),
    )
    expect(offenders, `id === en outside the allowlist: ${offenders.join(', ')}`).toEqual([])
  })

  it('the remaining #410 keys stay translated (the seed defects this guard exists for)', () => {
    expect(messages.id['kitchen.pushes.col.error']).toBe('Kesalahan')
    expect(messages.id['kitchen.pushes.col.target']).toBe('Tujuan')
  })

  it('allowlist entries are live — no stale key rides the exemption list', () => {
    const en = messages.en as Record<string, string>
    const stale = [...ID_EQUALS_EN_ALLOWLIST].filter((key) => !(key in en))
    expect(stale, `allowlisted keys missing from the catalog: ${stale.join(', ')}`).toEqual([])
  })
})
