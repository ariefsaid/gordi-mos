/* ════════════════════════════════════════════════════════════════════════════
   CONVERGENCE FLOWS — fixtures
   Re-exports the canonical e7-data.js fixtures (no parallel universe) and adds
   ONLY the thin convergence-specific additions the three flows need:
     · F2's "Café opening — today" occurrence (job-function PIC, audit item 5 / Q2)
     · saved-view + job-sentence registries (Rules 1 & 4)
   Domain law is closed (ADR-0025 / decisions.md OD-REDESIGN-1..55); do not invent.
   ════════════════════════════════════════════════════════════════════════════ */
export * from './e7-data.js';
import { records } from './e7-data.js';

/* ── F2 occurrence: "Café opening — today" ──────────────────────────────────
   Audit item 4: occurrences surface as TASKS. This is ONE Task carrying a
   single-operator checklist inside it (OD-REDESIGN-12 boundary) — not 12 task
   rows. The roll-up is DERIVED (done/total), never a stored status. The word
   "Process Run" appears nowhere in the UI. The provenance line demonstrates the
   job-function → holder binding (audit item 5 / Q2, OD-REDESIGN-41). */
export const cafeOpeningToday = {
  id: 'occ_cafe_open_today',
  type: 'task',
  title: 'Café opening — today',
  teamId: 't_hq_ops',
  picId: 'p_ayu',
  supervisorId: 'p_budi',
  /* Q2: the PIC slot binds to a job function that resolved to its current
     holder (Ayu) at spawn. Turnover changes the holder, never the Process. */
  picFunction: { label: 'Barista on shift', roleId: 'role_barista', teamId: 't_hq_ops', resolvedTo: 'p_ayu' },
  provenance: 'PIC: Ayu — via Barista on shift (Café HQ)',
  status: 'Open',            /* 'Open' → 'In Progress' on Start → 'Done' when complete */
  classification: 'Generated',
  area: 'Café HQ',
  occurrenceFor: 'proc_cafe_open',
  due: 'Today, before service',
  checklist: [
    { id: 'c1', label: 'Unlock & lights', done: false },
    { id: 'c2', label: 'Chiller temp 2–4°C', done: false },
    { id: 'c3', label: 'Espresso dial-in (18g ±0.5)', done: false },
    { id: 'c4', label: 'Stock count — milk & beans', done: false },
    { id: 'c5', label: 'Set POS to service mode', done: false },
    { id: 'c6', label: 'Pre-heat espresso machine', done: false },
    { id: 'c7', label: 'Wipe down bar & counters', done: false },
    { id: 'c8', label: 'Stock cups, lids, napkins', done: false },
    { id: 'c9', label: 'Floor + restroom check', done: false },
  ],
  comments: [],
};

/* ── Work saved views (flat switcher; Rule 3 caps Work children at 4) ────────
   Owner frame (2026-07-14): Work children are Signals · Tasks · Projects &
   Processes · Objectives. My / Team / Overdue / Follow-ups are saved-view
   chips inside Tasks (?view=), never rail roots. */
export const workViews = {
  tasks: [
    { id: 'all', label: 'All' },
    { id: 'mine', label: 'My work' },
    { id: 'team', label: 'Team work' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'followups', label: 'Follow-ups' },
  ],
};

/* ── Rule 1 job sentences (one job per rail destination) ──────────────────── */
export const jobSentences = {
  home: 'What needs my attention right now?',
  work: 'Find and do the work I own or my Team owns.',
  tasks: 'Find and do the work I own or my Team owns.',
  signals: 'Search and revisit the Signals your Teams have shared.',
  projects: 'Govern the Processes and Projects that generate the work.',
  objectives: 'Track the Objectives the org committed to.',
  events: 'See what’s happening around our outlets and when.',
  money: 'Trust the financial figures and act on money exceptions.',
  inbox: 'Triage what asked for me and return to its source.',
  cafe: "Run today's café floor work — openings, checks, stock, shifts.",
  ecommerce: "Fulfil today's online orders against the right stock.",
  roastery: 'Record today’s roasts, yield, and transfers truthfully.',
};

/* Convenience: the live, mutable record index (records + the F2 occurrence). */
export function liveDb() {
  return Object.assign({}, records, { occ_cafe_open_today: cafeOpeningToday });
}
