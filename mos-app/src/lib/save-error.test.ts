import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from '@/i18n/messages'
import { translateFor } from '@/i18n/use-t'
import { UserFacingError, saveErrorMessage } from './save-error'

const en = translateFor('en')
const id = translateFor('id')

afterEach(() => vi.restoreAllMocks())

describe('saveErrorMessage', () => {
  it.each([
    ['a permission error by code', Object.assign(new Error('boom'), { code: '42501' }), 'error.save.permission'],
    ['a permission error by text', new Error('new row violates row-level security policy for table "x"'), 'error.save.permission'],
    ['a transport failure', new TypeError('Failed to fetch'), 'error.save.network'],
    ['a transport failure carried as a string', 'fetch failed', 'error.save.network'],
    ['a unique violation', Object.assign(new Error('duplicate key value violates unique constraint "k"'), { code: '23505' }), 'error.save.conflict'],
    ['a check violation', Object.assign(new Error('violates check constraint "c"'), { code: '23514' }), 'error.save.validation'],
    ['an unknown Postgres failure', new Error('updateTaskFields failed — PGRST999: relation "ops.x" does not exist'), 'error.save.generic'],
  ] as const)('maps %s to the app message, never the raw text', (_name, error, key) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const shown = saveErrorMessage(error, en)
    expect(shown).toBe(messages.en[key])
    expect(saveErrorMessage(error, id)).toBe(messages.id[key])
    expect(shown).not.toMatch(/PGRST|42501|23505|fetch|relation|constraint|row-level/i)
  })

  it('logs the raw error for debugging while showing the friendly text', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = new Error('relation "ops.x" does not exist')
    saveErrorMessage(raw, en)
    expect(spy).toHaveBeenCalledWith('[save-error]', raw)
  })

  it('shows a message the app itself authored, unchanged', () => {
    expect(saveErrorMessage(new UserFacingError('cannot revoke admin from the last active admin'), en))
      .toBe('cannot revoke admin from the last active admin')
  })
})
