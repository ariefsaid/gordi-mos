import { describe, expect, it } from 'vitest'
import { validateSampleLoginBuild } from './sample-login-build-guard'

const strongPassword = 'StrongSample123'

describe('sample login build guard', () => {
  it('allows the sample login only in an explicitly marked staging build', () => {
    expect(() => validateSampleLoginBuild({
      command: 'build', sampleLoginEnabled: 'true', deploymentEnvironment: 'staging', samplePassword: strongPassword,
    })).not.toThrow()
  })

  it.each(['production', 'preview', undefined])('rejects the sample login for %s builds', deploymentEnvironment => {
    expect(() => validateSampleLoginBuild({
      command: 'build', sampleLoginEnabled: 'true', deploymentEnvironment, samplePassword: strongPassword,
    })).toThrow(/staging/i)
  })

  it('keeps normal builds and Vite dev mode unchanged', () => {
    expect(() => validateSampleLoginBuild({
      command: 'build', sampleLoginEnabled: 'false', deploymentEnvironment: undefined, samplePassword: undefined,
    })).not.toThrow()
    expect(() => validateSampleLoginBuild({
      command: 'serve', sampleLoginEnabled: 'true', deploymentEnvironment: undefined, samplePassword: undefined,
    })).not.toThrow()
  })

  it('continues enforcing the existing staging password policy', () => {
    expect(() => validateSampleLoginBuild({
      command: 'build', sampleLoginEnabled: 'true', deploymentEnvironment: 'staging', samplePassword: 'weak',
    })).toThrow(/auth policy/i)
  })
})
