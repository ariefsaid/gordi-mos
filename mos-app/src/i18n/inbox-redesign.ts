import type { Locale } from './messages'

/** Labels used by the redesigned Inbox queue; kept lane-local for shell integration. */
const inboxRedesignMessages = {
  en: {
    loadedScope: '${count} shown${more}',
    moreAvailable: ' · more available',
    openRecord: 'Open record',
    markRead: 'Mark read',
    queueViews: 'Inbox views',
    keyboardHelp: '↑ ↓ move · R mark read',
    sortOrder: 'Unread first, then newest',
    viewTasks: 'View my tasks',
  },
  id: {
    loadedScope: '${count} ditampilkan${more}',
    moreAvailable: ' · lainnya tersedia',
    openRecord: 'Buka catatan',
    markRead: 'Tandai dibaca',
    queueViews: 'Tampilan Kotak Masuk',
    keyboardHelp: '↑ ↓ pindah · R tandai dibaca',
    sortOrder: 'Belum dibaca dulu, lalu terbaru',
    viewTasks: 'Lihat tugas saya',
  },
} as const

export type InboxRedesignKey = keyof typeof inboxRedesignMessages.en

export function inboxRedesignText(locale: Locale, key: InboxRedesignKey, vars: Record<string, string | number> = {}) {
  return inboxRedesignMessages[locale][key].replace(/\$\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}
