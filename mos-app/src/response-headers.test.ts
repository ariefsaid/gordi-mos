// AC-036 — the app's response headers allow location for its own origin only; the camera stays as it was.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HEADERS = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')

function permissionsPolicy(): Map<string, string> {
  const line = HEADERS.split('\n').find((row) => row.trim().startsWith('Permissions-Policy:'))
  expect(line).toBeDefined()
  const value = (line as string).slice(line!.indexOf(':') + 1)
  return new Map(value.split(',').map((part) => {
    const [name, allow] = part.trim().split('=')
    return [name, allow] as [string, string]
  }))
}

describe('response headers', () => {
  it('AC-036 allows location for the app\'s own origin only', () => {
    expect(permissionsPolicy().get('geolocation')).toBe('(self)')
  })

  it('AC-036 leaves the camera as it was and keeps other features closed', () => {
    const policy = permissionsPolicy()
    expect(policy.get('camera')).toBe('(self)')
    expect(policy.get('microphone')).toBe('()')
    expect(policy.get('payment')).toBe('()')
  })
})
