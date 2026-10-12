export type LocalViewAsBuildSettings = {
  command: string
  password: string | undefined
}

export function localViewAsPassword(dev: boolean, password: string | undefined): string | null {
  return dev && password ? password : null
}

export function validateLocalViewAsBuild(settings: LocalViewAsBuildSettings): void {
  if (settings.command === 'build' && settings.password) {
    throw new Error('VITE_LOCAL_VIEW_AS_PASSWORD is only available during local development')
  }
}
