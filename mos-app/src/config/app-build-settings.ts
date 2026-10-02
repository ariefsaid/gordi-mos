import {
  BASE_PATH_ENV,
  appPath,
  resolveBuildSettings,
  routerBasename,
} from './build-settings'

export const APP_BASE_PATH = resolveBuildSettings({ [BASE_PATH_ENV]: import.meta.env.BASE_URL }).basePath
export const APP_ROUTER_BASENAME = routerBasename(APP_BASE_PATH)

export function appUrl(path: string): string {
  return appPath(path, APP_BASE_PATH)
}
