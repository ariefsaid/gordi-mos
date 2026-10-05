export interface SampleLoginBuildSettings {
  command: string
  sampleLoginEnabled: string | undefined
  deploymentEnvironment: string | undefined
  samplePassword: string | undefined
}

export function validateSampleLoginBuild(settings: SampleLoginBuildSettings): void {
  if (settings.command !== 'build' || settings.sampleLoginEnabled !== 'true') return

  if (settings.deploymentEnvironment !== 'staging') {
    throw new Error('VITE_SAMPLE_ONE_CLICK_LOGIN may only be enabled for an explicitly marked staging build')
  }

  const password = settings.samplePassword ?? ''
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('VITE_SAMPLE_ONE_CLICK_LOGIN needs a staging sample password that meets the auth policy')
  }
}
