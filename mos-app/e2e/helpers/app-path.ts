import { appPath, resolveBuildSettings, stripBasePath } from '../../src/config/build-settings'

export const E2E_BASE_PATH = resolveBuildSettings(process.env).basePath

export function e2eAppPath(path: string): string {
  return appPath(path, E2E_BASE_PATH)
}

export function stripE2eBasePath(pathname: string): string {
  return stripBasePath(pathname, E2E_BASE_PATH)
}
