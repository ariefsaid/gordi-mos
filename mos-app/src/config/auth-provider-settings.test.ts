import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const supabaseConfig = readFileSync(resolve(__dirname, '../../../supabase/config.toml'), 'utf-8')

function section(name: string): string {
  const heading = `[${name}]`
  const start = supabaseConfig.indexOf(heading)
  if (start === -1) throw new Error(`Missing Supabase config section ${heading}`)
  const contentStart = supabaseConfig.indexOf('\n', start) + 1
  const nextSection = supabaseConfig.indexOf('\n[', contentStart)
  return supabaseConfig.slice(contentStart, nextSection === -1 ? undefined : nextSection)
}

describe('Supabase auth provider configuration', () => {
  it('keeps both auth and email signup enabled alongside Google sign-in', () => {
    expect(section('auth')).toMatch(/^enable_signup = true$/m)
    expect(section('auth.email')).toMatch(/^enable_signup = true$/m)
  })

  it('enables Google using environment-substituted credentials', () => {
    const google = section('auth.external.google')
    expect(google).toMatch(/^enabled = true$/m)
    expect(google).toMatch(/^client_id = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID\)"$/m)
    expect(google).toMatch(/^secret = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET\)"$/m)
  })
})
