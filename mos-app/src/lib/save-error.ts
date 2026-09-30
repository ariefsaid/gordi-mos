import type { MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'
import { isNetworkError } from '@/lib/network-error'

/** An error whose message the app wrote for the user (already localised or curated). */
export class UserFacingError extends Error {}

const PERMISSION_CODES = new Set(['42501', 'PGRST301'])
const CONFLICT_CODES = new Set(['23505', '40001', '40P01', '409'])
const VALIDATION_CODES = new Set(['23502', '23503', '23514', '22P02', '22001', '22003'])

function codeOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return ''
  const { code } = error as { code?: unknown }
  return typeof code === 'string' || typeof code === 'number' ? String(code) : ''
}

function textOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string') return message
  }
  return ''
}

function classify(error: unknown): MessageKey {
  const code = codeOf(error)
  const text = textOf(error)
  if (isNetworkError(error) || isNetworkError({ message: text })) return 'error.save.network'
  if (PERMISSION_CODES.has(code) || /permission denied|row-level security|not authorized|forbidden/i.test(text)) return 'error.save.permission'
  if (CONFLICT_CODES.has(code) || /duplicate key|already exists|conflict/i.test(text)) return 'error.save.conflict'
  if (VALIDATION_CODES.has(code) || /violates (check|not-null|foreign key)|invalid input/i.test(text)) return 'error.save.validation'
  return 'error.save.generic'
}

/**
 * The text a failed write (or read) shows the user: the app's own words for the known cases, a
 * generic line otherwise. The raw error goes to the console only — never into the UI.
 */
export function saveErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof UserFacingError) return error.message
  console.error('[save-error]', error)
  return t(classify(error))
}
