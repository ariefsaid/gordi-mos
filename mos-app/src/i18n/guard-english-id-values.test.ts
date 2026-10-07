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
 * Info, Login, Batch, Endpoint, Target-as-noun is NOT here — see the fixed set), and
 * symbols/templates with no words of their own.
 */
const ID_EQUALS_EN_ALLOWLIST: ReadonlySet<string> = new Set([
  'common.docTitle', // ${page} — Gordi MOS
  'locale.en', // English — the language's own name in its own language
  'locale.id', // Bahasa Indonesia
  'pendingBills.form.multiTotal', // Total — the same word in Indonesian
  'dev.views.render', // Render (dev-only surface)
  'inbox.severity.info', // Info
  'signals.archive.attentionFyi', // FYI — the borrowed initialism stays in id (FR-024 "FYI kept", AC-031/AC-066)
  'inbox.target.type.followUp', // AR Follow-up — product term
  'followUps.counterparty', // Counterparty — domain term, no adopted id label yet
  'dest.ecommerce', // Ecommerce
  'dest.inbox', // Inbox — pinned tab label per OD-WAY-93 (10)
  'dest.roastery', // Roastery
  'inbox.quickTitle', // Inbox
  'nav.ecommerce', // Ecommerce
  'nav.roastery', // Roastery
  'rail.b2bOps', // B2B Ops
  'kitchen.actionType.transferTo.short', // → ${branch} — symbol template
  'kitchen.activity.bar', // Bar
  // #1366 Café Count preserves its feature, lifecycle and inventory terms in Indonesian copy.
  'nav.cafe.count', // Count — feature name
  'cafe.count.lineSubmitted', // Submitted — lifecycle state
  'cafe.count.review.title', // Count — section name
  'cafe.count.review.count', // Count — inventory fact
  'cafe.count.review.expected', // Expected balance — inventory fact
  'cafe.count.review.variance', // Variance — inventory fact
  'cafe.count.review.submittedAt', // Submitted — lifecycle state
  'cafe.count.review.streamTag', // Stream — Café vocabulary
  'cafe.count.review.confirmedNotNeeded', // Confirmed / Not needed — lifecycle states
  'cafe.receipts.quantityUnit', // ${quantity} × ${unit} — symbol template
  'kitchen.log.col.status', // Status
  'kitchen.log.offline.aria', // Offline
  'kitchen.pushes.col.batch', // Batch
  'kitchen.pushes.col.endpoint', // Endpoint
  'kitchen.pushes.col.status', // Status
  'kitchen.pushes.env.gkid', // GKID — environment name
  'kitchen.pushes.env.goo', // GOO — environment name
  'kitchen.unit.porsi', // porsi — already Indonesian
  // The footer states the unit in the SAME word ("porsi") the rows themselves use, in both
  // locales — one domain term, not an English translation of it.
  'kitchen.log.footer.unit.one',
  'kitchen.log.footer.unit.other',
  'followUps.record.title', // Follow-up — product term
  'tasks.checklistTitle', // Checklist
  'tasks.feed.checklist', // Checklist
  'tasks.filter.sortPic', // PIC A–Z
  'tasks.filter.sortStatus', // Status
  'tasks.filter.status', // Status
  // Objectives and Projects & Processes name their roles Responsible / Accountable in both
  // locales; the Indonesian gloss for Responsible collided with PIC's ("Penanggung Jawab").
  'catalog.column.accountable', // Accountable
  'catalog.record.accountable', // Accountable
  'catalog.record.responsible', // Responsible
  'objective.keyResults.responsible', // Responsible — same word as the record field
  'tasks.pic', // PIC
  'tasks.status.label', // Status
  'tasks.supervisor', // Supervisor
  'signals.composer.occurredHint', // WIB
  'signals.attention.caret', // disclosure symbol
  'signals.mention.group.bu', // BU
  'signals.record.revisionDiff', // “${from}” → “${to}” — symbol template
  'admin.people.col.login', // Login
  'admin.role.admin', // Admin
  'admin.role.supervisor', // Supervisor
  'admin.create.email', // Email
  'auth.recovery.emailLabel', // Email — same word in both locales, matches admin.create.email
  // #410 review-page chrome: 'Item' is the same word in both locales.
  'kitchen.review.col.item', // Item
  'kitchen.log.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.plan.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.stock.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.plan.pesanan.col.item', // Item — same word in both locales (OD-WAY-85)
  'kitchen.log.footer.item.one', // ${count} item — same word in both locales (OD-WAY-85)
  'kitchen.pushes.tally.push.one', // push — shared borrowed vocabulary
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
    expect(messages.id['kitchen.pushes.col.target']).toBe('Dikirim ke')
  })

  it('allowlist entries are live — no stale key rides the exemption list', () => {
    const en = messages.en as Record<string, string>
    const stale = [...ID_EQUALS_EN_ALLOWLIST].filter((key) => !(key in en))
    expect(stale, `allowlisted keys missing from the catalog: ${stale.join(', ')}`).toEqual([])
  })

  // Ticket 755 (AC-024, FR-024 / audit F-12, V-24): the shell/Home keys the audit found still English
  // in `id` carry Indonesian values — and Pushes names its JOB (sending approved logs), which
  // 'Antrean' (queue) never did. The generic rule above cannot catch these on its own: 'Objective'
  // ≠ en 'Objectives', so the title hole rode past it; these pins close that seam.
  it('ticket 755: the audit-named shell keys carry Indonesian values that name the job', () => {
    // Objectives title — shell nav child, Home door, Work page head. Not the borrowed English.
    expect(messages.id['nav.objectives']).toBe('Tujuan')
    expect(messages.id['home.objectives.title']).toBe('Tujuan')
    expect(messages.id['nav.work.objectives']).toBe('Tujuan')
    // Café Log label — the production record.
    expect(messages.id['nav.cafe.log']).toBe('Catatan')
    // RETAIL OPS group overline.
    expect(messages.id['rail.retailOps']).toBe('Operasi Ritel')
    // Pushes — named for its job, never 'Antrean'.
    expect(messages.id['nav.cafe.pushes']).toBe('Kirim Log')
    expect(messages.id['nav.cafe.pushes']).not.toBe('Antrean')
  })
})

// DD-NAME-1: the Café stream approver is "Penyetuju" in Indonesian — the borrowed English
// "Approver" in id copy is a translation hole, and "Supervisor" stays the Task's accountable
// person and the access role, never the stream approver.
describe('DD-NAME-1: the Café stream Approver reads Penyetuju in id', () => {
  const id = messages.id as Record<string, string>
  it('the stream-Approver copies name the Penyetuju, never the borrowed English', () => {
    for (const key of [
      'kitchen.log.footer.reviewNext',
      'kitchen.plan.pesanan.readOnlyNote',
      'kitchen.review.leadsOnly',
      'kitchen.review.leadsOnlyMsg',
      'admin.teams.helper',
    ]) {
      expect(id[key]).toMatch(/Penyetuju/)
      expect(id[key]).not.toMatch(/Approver/)
    }
  })
  it('no id value carries the borrowed English Approver', () => {
    const borrowed = Object.keys(id).filter((key) => /\bApprover\b/i.test(id[key]))
    expect(borrowed, `borrowed English Approver in id values: ${borrowed.join(', ')}`).toEqual([])
  })
})

// The Indonesian word for Objective is "Tujuan" everywhere and "Tujuan" means only Objective:
// the old word is gone, and no non-Objective key (Café Pushes' destination column) borrows it.
describe('id catalog: "Tujuan" is the Objective term only', () => {
  const id = messages.id as Record<string, string>
  it('the retired Objective word appears in no id value', () => {
    const offenders = Object.keys(id).filter((key) => /sasaran/i.test(id[key]))
    expect(offenders, `retired Objective word in: ${offenders.join(', ')}`).toEqual([])
  })
  it('Objective labels in id read Tujuan, never the borrowed English word', () => {
    expect(id['tasks.objective']).toBe('Tujuan')
    expect(id['catalog.column.objective']).toBe('Tujuan')
    expect(id['catalog.record.objective']).toBe('Tujuan')
    const borrowed = Object.keys(id).filter((key) => /\bobjectives?\b/i.test(id[key]))
    expect(borrowed, `borrowed English Objective in id values: ${borrowed.join(', ')}`).toEqual([])
  })
  it('a bare "Tujuan" value belongs to an Objective key; Pushes destination uses another word', () => {
    const bare = Object.keys(id).filter((key) => id[key] === 'Tujuan')
    expect(bare.filter((key) => !/objective/i.test(key)), 'bare Tujuan on a non-Objective key').toEqual([])
    expect(id['kitchen.pushes.col.target']).toBe('Dikirim ke')
  })
  it('Task and Objective/Project role labels do not mix', () => {
    const en = messages.en as Record<string, string>
    for (const key of ['tasks.pic', 'tasks.supervisor']) {
      expect(en[key]).toMatch(/^(PIC|Supervisor)$/)
    }
    expect(en['catalog.column.accountable']).toBe('Accountable')
    expect(en['catalog.record.accountable']).toBe('Accountable')
    expect(en['catalog.record.responsible']).toBe('Responsible')
    expect(id['catalog.column.accountable']).toBe('Accountable')
    expect(id['catalog.record.responsible']).toBe('Responsible')
    // The Tasks help text names PIC and Supervisor only — never the Objective-side pair.
    expect(en['job.tasksHelp']).not.toMatch(/Responsible|Accountable/)
    expect(id['job.tasksHelp']).not.toMatch(/Responsible|Accountable/)
  })
})
