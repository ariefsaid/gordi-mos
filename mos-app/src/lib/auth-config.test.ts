// AC-008 (#798): the auth config carries the password rule — 8+ characters, no character classes.
// Read straight off supabase/config.toml so a config edit, not a code edit, is what moves this.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const toml = readFileSync(resolve(__dirname, '../../../supabase/config.toml'), 'utf8')
const authSection = toml.slice(toml.indexOf('\n[auth]\n'), toml.indexOf('\n[auth.rate_limit]\n'))

describe('supabase/config.toml [auth] password rule', () => {
  it('minimum_password_length is 8', () => {
    expect(authSection).toMatch(/^minimum_password_length = 8$/m)
  })
  it('password_requirements names no character class', () => {
    expect(authSection).toMatch(/^password_requirements = ""$/m)
  })
})
