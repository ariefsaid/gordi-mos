// STRESS=1 content for check.mjs / crops.mjs: enlarge Café item reads in the BROWSER ONLY, to the catalogue the owner
// really has (Gordi HQ · Kitchen: ~180 items, RAW and WIP mixed, names up to ~60 chars, units like "Batch @50porsi").
// The sample accounts' streams are thin (15 short WIP items, 2-3 letter units), which hid every width and alignment
// defect. Call after readOnly(page): this answers reads (GETs and the read-only RPCs) with the real response plus
// synthetic rows; every other request falls through to readOnly. Nothing is written anywhere.
const HEX = (n, len) => n.toString(16).padStart(len, '0')
const itemId = (i) => `5e5e5e5e-0000-4000-8000-${HEX(i, 12)}`
const unitId = (i, u) => `7a7a7a7a-0000-4000-8000-${HEX(i * 10 + u, 12)}`
const BASES = ['Anchor Red Cheese Cheddar Slice Quick Melt', 'Heinz Tomato Ketchup Squeeze Bottle', 'Wagyu Beef Short Rib Trimmed Frozen',
  'Fresh Atlantic Salmon Fillet Skin On Boneless', 'Premium Basmati Rice Long Grain Aged', 'Kewpie Japanese Mayonnaise Original',
  'Oatly Barista Edition Oat Milk Unsweetened', 'Chicken Breast Fillet Skinless Halal Frozen', 'Bumbu Dasar Putih Gordi Central Kitchen',
  'Sauce Teriyaki House Blend Reduced Sodium', 'Brioche Burger Bun Sliced Sesame Topped', 'Potato Shoestring Fries Coated Straight Cut',
  'Whipping Cream Dairy Heavy 35 Percent Fat', 'Sambal Matah Bali Style Fresh Chopped', 'Lasagna Sheet Egg Pasta Fresh Cut Square',
  'Mozzarella Shredded Pizza Blend Low Moisture', 'Kecap Manis Bango Sweet Soy Sauce Refill', 'Espresso Beans Single Origin Toraja Medium',
  'Cold Brew Concentrate Arabica Unsweetened', 'Tempura Batter Mix Light Crispy Instant', 'Demi Glace Veal Stock Reduced Classic',
  'Dark Chocolate Couverture Callets 70 Percent', 'Vanilla Syrup Monin Classic Bar Bottle', 'Nasi Goreng Seasoning Paste Kampung Style']
const SIZES = ['1.2 kg', '500 g', '2 L', '25 kg', '12 x 1 L', '750 ml', '5 kg', '300 g', '10 kg', '1 kg', '20 pcs', '250 g']
const WIP_BASES = ['Acar Timun Wortel Gordi Batch Production', 'Aioli Dressing Garlic Roasted House Recipe', 'Beef Patty 150g Smash Seasoned Prep',
  'Benedict Style Hollandaise Sauce NEW Version', 'Bumbu Sate Madura Marinade Ready To Grill', 'Caramelised Onion Jam Slow Cooked Prep',
  'Fried Shallot Bawang Goreng Crisp Garnish', 'Pickled Red Onion Quick Brine Sliced Fine', 'Pulled Beef Rendang Braised Shredded', 'Salsa Verde Herb Blend Chunky Fresh Prep']
const UNITS = ['Batch @50porsi', 'Pack @12pcs', 'GR', 'KG', 'Dus @24pcs', 'Karung @25kg', 'ML', 'Btl 1L', 'Tray @30pcs']
const CATS = ['Kitchen', 'Dry goods', 'Dairy & cold', 'Sauces & dressings', 'Bakery', 'Protein']

export function stressItems(count = 172) {
  const out = []
  for (let i = 1; i <= count; i++) {
    const raw = i % 3 !== 0 // roughly two RAW to one WIP
    const base = raw ? BASES[i % BASES.length] : WIP_BASES[i % WIP_BASES.length]
    const name = `${base} ${raw ? SIZES[i % SIZES.length] : `v${i}`} ${String.fromCharCode(65 + (i % 26))}${i}`.slice(0, 62).trim()
    const unit = UNITS[(i * 7) % UNITS.length]
    const alt = UNITS[(i * 7 + 3) % UNITS.length]
    out.push({ i, id: itemId(i), kind: raw ? 'RAW' : 'WIP', name, erp: `${raw ? 'RAW' : 'WIP'} - ${name}`.slice(0, 70), category: CATS[i % CATS.length],
      units: [{ id: unitId(i, 1), name: unit, def: true }, ...(i % 4 === 0 && alt !== unit ? [{ id: unitId(i, 2), name: alt, def: false }] : [])],
      stock: i % 5 === 0 ? 0 : Math.round(((i * 37) % 900) * 100) / 100 + (i % 2 ? 0.5 : 0), plan: i % 5 < 2 ? 1 + ((i * 13) % 40) : null })
  }
  return out
}

export function stressRecipes(count = 64) {
  const day = (n) => new Date(Date.UTC(2026, 9, 14 - (n % 28), 3, 0, 0)).toISOString()
  return Array.from({ length: count }, (_, k) => {
    const i = k + 1, w = WIP_BASES[i % WIP_BASES.length]
    // ESB status mix (i % 8): 0-3 active, 4 inactive, 5 active but removed from the menu (the "active in ESB, not in use" case), 6 removed with no active flag, 7 no flag -> Unknown.
    const s = i % 8
    const own = s <= 3 ? { active: true } : s === 4 ? { active: false } : s === 5 ? { active: true, menu_deleted: true } : s === 6 ? { menu_deleted: true } : {}
    // Type mix ((i >> 1) % 6): 0-2 ESB "Menu"; 3 a non-"Menu" ESB value (shown raw in the detail); 4 no ESB type but the BOM feeds a MOS item (stressRecipeItems) -> WIP / BOM;
    // 5 no ESB type and no linked item -> Unknown. The odd one has no BOM at all.
    const t = (i >> 1) % 6
    const bom_type = t <= 2 ? 'Menu' : t === 3 ? (i % 4 === 2 ? 'Preparation' : 'Prep Item') : undefined
    const long = i % 13 === 0 ? ' Extra Long Name With Every Garnish Sauce Side And Topping Listed In Full For The Wrapping Check' : ''
    return { esb_code: `STRESS-${HEX(i, 4)}`, menu_id: 9000 + i, bom_id: t === 5 && i % 5 === 1 ? null : 8000 + i, version: 1 + (i % 3), first_seen: day(i), source_observed_at: day(i),
      recipe: { menu_name: `${w} ${i % 2 ? 'Portion' : 'Batch'} ${i}${long}`.slice(0, long ? 140 : 64), branch_codes: i % 3 ? ['GHQ', 'RAD'] : ['GHQ'], ...own, ...(bom_type ? { bom_type } : {}),
        lines: Array.from({ length: 3 + (i % 6) }, (_, j) => ({ line_id: i * 10 + j, detail_id: 5000 + j, name: `${BASES[(i + j) % BASES.length]} ${SIZES[(i + j) % SIZES.length]}`.slice(0, 60), qty: 1 + ((i + j) % 9) * 25, unit: UNITS[(i + j) % UNITS.length] })) } }
  })
}

/** ops.wip_items rows (esb_bom_id) built from the STRESS recipes that carry no ESB type but whose BOM feeds a MOS item: type index 4 -> WIP / BOM. */
export function stressRecipeItems(count = 64) {
  return Array.from({ length: count }, (_, k) => k + 1).filter((i) => (i >> 1) % 6 === 4).map((i) => ({ esb_bom_id: String(8000 + i) }))
}

// ── Café Records volume ────────────────────────────────────────────────────────────────────────────────────────
// The local database holds no production, Count, receipt or request history, and the real Records reads page by
// keyset cursor, so STRESS answers those reads (browser only) with a synthetic period of about nine weeks across
// five streams: every status, the entered-multiple and unknown-unit cases, long names, decimals, receipts and
// requests with 60 lines (past the 50-line cap, to exercise the nested-line pager), and 12 recorders. The handler
// emulates the server contract: range, stream and status filters, descending tuple order, the `or` cursor and `limit`.
const BRANCHES = { gq: '2d63ab19-142c-5ecb-9f88-6b512eebe581', rr: '3c5514a1-49fc-5c1d-94f8-5f459fd28220', rad: 'e4724eda-0dfc-5021-8f2d-6cc29ec0b63c' }
const REC_STREAMS = [[BRANCHES.gq, 'kitchen'], [BRANCHES.gq, 'bar'], [BRANCHES.rr, 'kitchen'], [BRANCHES.rr, 'bar'], [BRANCHES.rad, 'bar']]
const REC_PEOPLE = ['Cahya Cafe', 'Krishna Kitchen', 'Dewi Director', 'Bayu Barista', 'Anindya Kusumawardhani Pratiwi Santoso', 'Ni Luh Putu Ayu Wulandari', 'Muhammad Rizky Ramadhan Hidayat',
  'Siti Nurhaliza', 'Agus', 'Yohanes Bayu Prasetyo Nugroho', 'Rina Marlina', 'Tomi']
const recPersonId = (n) => `9e9e9e9e-0000-4000-8000-${HEX(n, 12)}`
const recId = (kind, n) => `${kind}-0000-4000-8000-${HEX(n, 12)}`
const pad2 = (n) => String(n).padStart(2, '0')
const addDay = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const iso = (day, h, m, sec) => `${day}T${pad2(h)}:${pad2(m)}:${pad2(sec)}+00:00`

export function stressRecordData(today, items) {
  const logs = [], counts = [], receipts = [], requests = []
  let seq = 1
  const days = Array.from({ length: 63 }, (_, k) => addDay(today, -k))
  const unitOf = (it, alt) => (alt && it.units[1] ? it.units[1] : it.units[0])
  REC_STREAMS.forEach(([branch, activity], si) => {
    days.forEach((day, di) => {
      items.forEach((it) => {
        if ((it.i * 7 + di * 3 + si) % 11 >= 2) return
        const n = 1 + ((it.i + di) % 3)
        for (let r = 0; r < n; r++) {
          const k = seq++
          const pick = (k * 7) % 20
          const action = pick < 11 ? 'produce' : pick < 16 ? 'transfer' : 'waste'
          const status = di === 0 ? (pick % 3 ? 'Submitted' : 'Approved') : pick % 7 === 0 ? 'Rejected' : pick % 5 === 0 ? 'Submitted' : 'Approved'
          const alt = it.i % 4 === 0 && k % 3 === 0
          const unit = unitOf(it, alt)
          const factor = k % 10 === 0 ? 50 : null
          const qty = Math.round(((k * 13) % 900)) / 10 + 0.5 * (k % 2)
          const dest = action === 'transfer' ? (si % 2 === 0 ? REC_STREAMS[(si + 1) % 5][0] : REC_STREAMS[(si + 2) % 5][0]) : null
          logs.push({
            id: recId('1051c0de', k), batch_id: status === 'Approved' && action !== 'waste' ? recId('ba7c4000', k) : null, log_date: day, branch_id: branch, activity, action,
            action_label: action === 'produce' ? 'Production' : action === 'transfer' ? 'Transfer' : 'Waste', destination_branch_id: dest, wip_item_id: it.id,
            item_unit_id: k % 17 === 0 ? null : unit.id, qty_porsi: factor ? qty * factor : qty, entry_quantity: factor ? qty : null, entry_unit_factor: factor,
            entry_unit_name: factor ? 'Batch @50porsi' : null, notes: k % 6 === 0 ? 'Batch hold until the walk-in is cleared and relabelled, per the lead on shift.' : null, status,
            submitted_by: recPersonId(k % 12), created_at: iso(day, 3 + (k % 9), (k * 7) % 60, (k * 11) % 60), updated_at: iso(day, 12, 0, 0),
            reviewed_by: status === 'Submitted' ? null : recPersonId(2), reviewed_at: status === 'Submitted' ? null : iso(day, 14, 0, 0), review_note: status === 'Rejected' ? 'Quantity does not match the plan.' : null,
            posted_to_esb: status === 'Approved' && action === 'produce' && k % 4 === 0, posted_at: status === 'Approved' && action === 'produce' && k % 4 === 0 ? iso(day, 15, 0, 0) : null,
            esb_doc_num: status === 'Approved' && action === 'produce' && k % 4 === 0 ? `ESB-${HEX(k, 6).toUpperCase()}` : null, superseded_by: null, wip_items: { name: it.erp },
          })
        }
        if ((it.i + di) % 6 === 0) {
          const unit = it.units[0]
          for (let r = 0; r < 1 + (it.i % 2); r++) {
            const k = seq++
            const status = k % 9 === 0 ? 'Rejected' : k % 4 === 0 ? 'Submitted' : 'Confirmed'
            counts.push({
              id: recId('c0c0c0c0', k), branch_id: branch, activity, count_date: day, wip_item_id: it.id, item_name: it.name, item_category: it.category, item_kind: it.kind,
              item_unit_id: k % 19 === 0 ? null : unit.id, unit_name: unit.name, counted_quantity: k % 11 === 0 ? 0 : Math.round(((k * 17) % 600)) / 10 + 0.25 * (k % 2), status,
              posting_status: status === 'Confirmed' ? 'not_needed' : 'not_posted', submitted_at: iso(day, 18 + (r % 3), (k * 3) % 60, (k * 5) % 60), reviewed_at: status === 'Submitted' ? null : iso(day, 22, 0, 0), row_version: 1,
            })
          }
        }
      })
      if ((di + si) % 3 === 0 || di === 0 || (di === 1 && si < 2)) {
        const raws = items.filter((it) => it.kind === 'RAW')
        const total = di === 1 && si < 2 ? 60 : 2 + ((di * 5 + si * 3) % 13)
        const k = seq++
        const status = ['Counted', 'Submitted', 'Approved', 'Approved', 'Rejected'][(di + si) % 5]
        const lines = Array.from({ length: total }, (_, j) => {
          const it = raws[(di * 5 + j * 3 + si) % raws.length]
          const lk = seq++
          return { id: recId('11e11e11', lk), receipt_id: recId('7ece1b7a', k), item_unit_id: it.units[0].id, item_name: it.name, item_category: it.category, unit_name: it.units[0].name,
            received_quantity: Math.round(((lk * 19) % 400)) / 10 + 0.5, conditions: lk % 13 === 0 ? ['damaged_wrong'] : [], condition_reason: lk % 13 === 0 ? 'Two bags torn on arrival; supplier told.' : null,
            condition_updated_at: lk % 13 === 0 ? iso(day, 6, 0, 0) : null, po_created_after_delivery: false }
        })
        receipts.push({
          id: recId('7ece1b7a', k), branch_id: branch, activity, arrival_date: day, delivery_note_number: k % 3 === 0 ? `DN-${1000 + k}` : null, status, posting_status: 'not_posted', posting_hold_reason: null,
          received_by: recPersonId((k + 4) % 12), received_at: iso(day, 2 + (k % 4), (k * 7) % 60, 0), submitted_at: status === 'Counted' ? null : iso(day, 7, 0, 0),
          reviewed_by: status === 'Approved' || status === 'Rejected' ? recPersonId(2) : null, reviewed_at: status === 'Approved' || status === 'Rejected' ? iso(day, 9, 0, 0) : null,
          review_note: status === 'Rejected' ? 'Count again before sending.' : null, row_version: 1, lines,
          posting: status === 'Approved' ? { state: ['posted', 'queued', 'held', 'failed', 'posted'][k % 5], matched: true, unmatched: 0, open_issues: 0 } : null,
        })
      }
      if ((di + si) % 2 === 0) {
        const total = (di === 2 && si === 0) || (di === 3 && si === 1) ? 60 : 1 + ((di + si) % 7)
        const k = seq++
        const status = ['Submitted', 'Approved', 'Rejected', 'Approved'][(di + si) % 4]
        const lines = Array.from({ length: total }, (_, j) => {
          const lk = seq++
          const it = items[(di * 3 + j * 5 + si) % items.length]
          return { id: recId('4e90e570', lk), item_name: j % 4 === 0 ? it.name : `Supplies ${j + 1} ${['Karung', 'Dus', 'Pack'][j % 3]} request`, item_category: null, unit_name: ['Karung @25kg', 'Dus @24pcs', 'KG', 'Pack @12pcs'][j % 4], quantity: 1 + ((lk * 3) % 40) }
        })
        requests.push({
          id: recId('4e90e570', k), branch_id: branch, activity, required_by: addDay(day, 3), note: k % 3 === 0 ? 'For the weekend event, please deliver before Friday noon.' : null, status,
          requested_by: recPersonId((k + 7) % 12), requested_at: iso(day, 1 + (k % 8), (k * 13) % 60, 0), reviewed_by: status === 'Submitted' ? null : recPersonId(2),
          reviewed_at: status === 'Submitted' ? null : iso(day, 10, 0, 0), review_note: status === 'Rejected' ? 'Already ordered.' : null, row_version: 1, lines,
        })
      }
    })
  })
  const people = REC_PEOPLE.map((name, n) => ({ id: recPersonId(n), full_name: name }))
  return { logs, counts, receipts, requests, people }
}

const REC_KEYS = { kitchen_logs: ['log_date', 'created_at', 'id'], cafe_count_lines: ['count_date', 'submitted_at', 'id'], cafe_receipts: ['arrival_date', 'received_at', 'id'], cafe_purchase_requests: ['requested_at', 'id'] }
const REC_DATE = { kitchen_logs: 'log_date', cafe_count_lines: 'count_date', cafe_receipts: 'arrival_date' }

function recordsPage(table, rows, sp) {
  const keys = REC_KEYS[table]
  const filtered = rows.filter((row) => {
    if (table === 'cafe_purchase_requests') {
      const t = Date.parse(row.requested_at)
      const gte = (sp.getAll('requested_at').find((v) => v.startsWith('gte.')) || '').slice(4), lt = (sp.getAll('requested_at').find((v) => v.startsWith('lt.')) || '').slice(3)
      if (gte && t < Date.parse(gte)) return false
      if (lt && t >= Date.parse(lt)) return false
    } else {
      const col = REC_DATE[table]
      const gte = (sp.getAll(col).find((v) => v.startsWith('gte.')) || '').slice(4), lte = (sp.getAll(col).find((v) => v.startsWith('lte.')) || '').slice(4)
      if (gte && row[col] < gte) return false
      if (lte && row[col] > lte) return false
    }
    const b = (sp.get('branch_id') || '').replace(/^eq\./, ''), a = (sp.get('activity') || '').replace(/^eq\./, '')
    if (b && row.branch_id !== b) return false
    if (a && row.activity !== a) return false
    const st = (sp.get('status') || '').match(/^in\.\((.*)\)$/)
    if (st && !st[1].split(',').includes(row.status)) return false
    return true
  })
  const cmp = (x, y) => { for (const k of keys) { if (x[k] > y[k]) return -1; if (x[k] < y[k]) return 1 } return 0 }
  filtered.sort(cmp)
  const or = sp.get('or')
  let start = 0
  if (or) {
    const last = or.slice(or.lastIndexOf('and(') + 4).replace(/\)+$/, '')
    const tuple = last.split(',').map((part) => part.replace(/^[a-z_]+\.(eq|lt)\./, ''))
    const cursor = Object.fromEntries(keys.map((k, i) => [k, tuple[i]]))
    start = filtered.findIndex((row) => cmp(row, cursor) > 0)
    if (start < 0) start = filtered.length
  }
  const limit = Number(sp.get('limit') || 1000)
  return filtered.slice(start, start + limit)
}

async function stressRecords(page, items, log) {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  const data = stressRecordData(today, items)
  const unitNames = new Map(items.flatMap((it) => it.units.map((un) => [un.id, un.name])))
  const fulfil = (route, json, res) => {
    const headers = res ? Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !['content-length', 'content-range'].includes(k))) : { 'content-type': 'application/json' }
    return route.fulfill({ status: 200, headers, json })
  }
  await page.route(/\/rest\/v1\/(kitchen_logs|cafe_count_lines|cafe_receipts|cafe_purchase_requests|cafe_receipt_lines|item_units|people)\?/, async (route) => {
    const r = route.request(), u = r.url()
    if (r.method() !== 'GET') return route.fallback()
    const sp = new URL(u).searchParams
    const table = u.match(/\/rest\/v1\/([a-z_]+)\?/)[1]
    const select = sp.get('select') || ''
    try {
      const real = async (extra = {}) => {
        const url = new URL(u); for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v); url.searchParams.delete('or')
        const res = await route.fetch({ url: url.toString() })
        let rows = []; try { rows = await res.json() } catch { rows = [] }
        return { res, rows: Array.isArray(rows) ? rows : [] }
      }
      if (table === 'kitchen_logs' && select.includes('posted_to_esb')) { const { res, rows } = await real({ limit: '1000' }); return fulfil(route, recordsPage(table, [...rows, ...data.logs], sp), res) }
      if (table === 'cafe_count_lines' && select.includes('count_date') && !select.includes('variance')) { const { res, rows } = await real({ limit: '1000' }); return fulfil(route, recordsPage(table, [...rows, ...data.counts], sp), res) }
      if (table === 'cafe_receipts' && sp.getAll('arrival_date').length) { const { res, rows } = await real({ limit: '1000' }); return fulfil(route, recordsPage(table, [...rows, ...data.receipts], sp), res) }
      if (table === 'cafe_purchase_requests' && sp.getAll('requested_at').length) { const { res, rows } = await real({ limit: '1000' }); return fulfil(route, recordsPage(table, [...rows, ...data.requests], sp), res) }
      if (table === 'cafe_receipt_lines' && sp.get('receipt_id')) {
        const id = sp.get('receipt_id').replace(/^eq\./, ''), after = (sp.get('id') || '').replace(/^gt\./, '')
        const rec = data.receipts.find((x) => x.id === id)
        if (rec) return fulfil(route, rec.lines.filter((l) => !after || l.id > after).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, Number(sp.get('limit') || 50)).map((l) => ({ ...l, receipt_id: id })))
      }
      if (table === 'cafe_purchase_requests' && select.includes('lines:') && sp.get('id')) {
        const id = sp.get('id').replace(/^eq\./, '')
        const rec = data.requests.find((x) => x.id === id)
        if (rec) {
          const after = (sp.get('lines.id') || '').replace(/^gt\./, '')
          const lines = rec.lines.filter((l) => !after || l.id > after).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, Number(sp.get('lines.limit') || 50))
          return fulfil(route, [{ id, lines }])
        }
      }
      if (table === 'item_units' && sp.get('id')) {
        const ids = (sp.getAll('id').map((v) => v.match(/^in\.\((.*)\)$/)).find(Boolean) || [])[1]?.split(',') || []
        const after = (sp.getAll('id').find((v) => v.startsWith('gt.')) || '').slice(3)
        const synthetic = ids.filter((id) => unitNames.has(id)).map((id) => ({ id, unit_name: unitNames.get(id) }))
        const { res, rows } = await real()
        return fulfil(route, [...rows, ...synthetic].filter((x) => !after || x.id > after).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, Number(sp.get('limit') || 1000)), res)
      }
      if (table === 'people' && sp.get('id') && select === 'id,full_name') {
        const ids = (sp.getAll('id').map((v) => v.match(/^in\.\((.*)\)$/)).find(Boolean) || [])[1]?.split(',') || []
        const after = (sp.getAll('id').find((v) => v.startsWith('gt.')) || '').slice(3)
        const synthetic = data.people.filter((p) => ids.includes(p.id))
        const { res, rows } = await real()
        return fulfil(route, [...rows, ...synthetic].filter((x) => !after || x.id > after).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, Number(sp.get('limit') || 1000)), res)
      }
    } catch (e) { log(`stress records: ${table} ${e.message}`) }
    return route.fallback()
  })
  return data
}

export async function stress(page, log = console.log) {
  const items = stressItems()
  const recipes = stressRecipes()
  const recipeItems = stressRecipeItems()
  let destinations = []
  await stressRecords(page, items, log)
  const q = (u, key) => decodeURIComponent((u.match(new RegExp(`[?&]${key}=eq\\.([^&]+)`)) || [])[1] || '')
  const patch = async (route, edit) => {
    const res = await route.fetch(); let data
    try { data = await res.json() } catch { return route.fulfill({ response: res }) }
    if (!Array.isArray(data)) return route.fulfill({ response: res })
    const { 'content-length': _l, 'content-range': _c, ...headers } = res.headers()
    return route.fulfill({ status: res.status(), headers, json: edit(data) })
  }
  await page.route(/\/rest\/v1\/(cafe_item_settings_read|stream_items|cafe_item_settings|cafe_item_references|kitchen_plans|cafe_destinations|recipe_versions|wip_items|rpc\/(kitchen_stock_for_date|cafe_countable_items|cafe_receivable_items))(\?|$)/, async (route) => {
    const r = route.request(), u = r.url(), m = r.method()
    const name = u.match(/\/rest\/v1\/(?:rpc\/)?([a-z_]+)/)[1]
    try {
      if (name === 'cafe_destinations' && m === 'GET') return await patch(route, (d) => { destinations = d; return d })
      if (m === 'GET') {
        if (name === 'recipe_versions') return await patch(route, (d) => [...d, ...recipes])
        if (name === 'wip_items' && /select=esb_bom_id(&|$)/.test(u) && !/[?&]id=eq\./.test(u)) return await patch(route, (d) => [...d, ...recipeItems])
        if (name === 'cafe_item_settings_read') return await patch(route, (d) => [...d, ...items.flatMap((it) => it.units.map((un) => ({
          item_id: it.id, erp_name: it.erp, mos_name: it.name, category: it.category, kind: it.kind, is_active: true, item_unit_id: un.id,
          unit_name: un.name, default_item_unit_id: it.units[0].id, unit_is_default: un.def, unit_is_shown: true, unit_multiples: [] })))])
        if (name === 'stream_items' && /select=wip_item_id(&|$)/.test(u)) return await patch(route, (d) => [...d, ...items.map((it) => ({ wip_item_id: it.id }))])
        if (name === 'cafe_item_settings' && /select=wip_item_id(&|$)/.test(u)) return await patch(route, (d) => [...d, ...items.map((it) => ({ wip_item_id: it.id }))])
        if (name === 'cafe_item_references') return await patch(route, (d) => [...d, ...items.map((it) => ({ item_id: it.id, item_unit_id: it.units[0].id, is_default: true }))])
        if (name === 'kitchen_plans' && /select=[^&]*qty_porsi/.test(u) && !/wip_items/.test(u)) {
          const branch = q(u, 'branch_id') || (u.match(/branch_id\.eq\.([0-9a-f-]{36})/) || [])[1]
          const activity = q(u, 'activity') || (u.match(/activity\.eq\.([a-z]+)/) || [])[1]
          const dest = destinations.find((x) => x.origin_branch_id === branch && x.origin_activity === activity)?.destination_branch_id ?? null
          const date = q(u, 'log_date') || (u.match(/log_date\.eq\.([0-9-]{10})/) || [])[1]
          const ctx = /select=[^&]*log_date/.test(u) // the plan-map read carries its context; the editor read carries ids
          return await patch(route, (d) => [...d, ...items.filter((it) => it.plan != null).flatMap((it) => {
            const row = (action, destination, qty, n) => ({ wip_item_id: it.id, qty_porsi: qty, action, destination_branch_id: destination,
              ...(ctx ? { log_date: date, branch_id: branch, activity } : { id: `9b9b9b9b-0000-4000-8000-${HEX(it.i * 10 + n, 12)}` }) })
            return [row('produce', null, it.plan, 1), ...(dest ? [row('transfer', dest, Math.ceil(it.plan / 2), 2)] : [])]
          })])
        }
      } else if (m === 'POST') {
        if (name === 'kitchen_stock_for_date') return await patch(route, (d) => [...d, ...items.map((it) => ({ wip_item_id: it.id, usable_qty: it.stock, available_qty: it.stock }))])
        if (name === 'cafe_countable_items') return await patch(route, (d) => [...d, ...items.map((it) => ({ item_id: it.id, item_name: it.name, item_category: it.category, item_kind: it.kind, item_unit_id: it.units[0].id, unit_name: it.units[0].name }))])
        if (name === 'cafe_receivable_items') return await patch(route, (d) => [...d, ...items.flatMap((it) => it.units.map((un) => ({ item_id: it.id, item_name: it.name, item_category: it.category, item_kind: it.kind, item_unit_id: un.id, unit_name: un.name, is_default_unit: un.def })))])
      }
    } catch (e) { log(`stress: ${name} ${e.message}`) }
    return route.fallback()
  })
  return items.length
}
