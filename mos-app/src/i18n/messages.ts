/**
 * i18n message catalog (ADR-0021 — typed hand-rolled catalog, no library).
 *
 * `en` is the canonical key set; `id` must match it exactly (enforced by
 * `MessageKey` at compile time and by a parity test at runtime). New
 * user-facing strings introduced by the Home v1 + shell-regroup slice flow
 * through this catalog — never inlined (ADR-0019 D12).
 */
export const messages = {
  en: {
    'dest.home': 'Home',
    'dest.work': 'Work',
    'dest.operate': 'Operate',
    'dest.plan': 'Plan',
    'dest.inbox': 'Inbox',
    'home.title': 'Home',
    'home.subtitle': 'Your week at a glance',
    'home.kpi.revenue': 'Trailing 7-day revenue',
    'home.kpi.margin': 'Gross margin (interim)',
    'home.kpi.tasks': 'My open tasks',
    'home.kpi.ops': "Today's log entries",
    'locale.toggle.label': 'Language',
    'locale.en': 'English',
    'locale.id': 'Bahasa Indonesia',
  },
  id: {
    'dest.home': 'Beranda',
    'dest.work': 'Kerja',
    'dest.operate': 'Operasi',
    'dest.plan': 'Rencana',
    'dest.inbox': 'Kotak Masuk',
    'home.title': 'Beranda',
    'home.subtitle': 'Minggu Anda sekilas',
    'home.kpi.revenue': 'Pendapatan 7 hari terakhir',
    'home.kpi.margin': 'Margin kotor (interim)',
    'home.kpi.tasks': 'Tugas saya yang terbuka',
    'home.kpi.ops': 'Entri log hari ini',
    'locale.toggle.label': 'Bahasa',
    'locale.en': 'English',
    'locale.id': 'Bahasa Indonesia',
  },
} as const

export type MessageKey = keyof typeof messages.en
export type Locale = keyof typeof messages
