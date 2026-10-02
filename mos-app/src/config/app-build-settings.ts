/// <reference types="vite/client" />

import {
  BASE_PATH_ENV,
  RELEASE_PROFILE_ENV,
  appPath,
  resolveBuildSettings,
  routerBasename,
} from './build-settings'

const APP_BUILD_SETTINGS = resolveBuildSettings({
  [BASE_PATH_ENV]: import.meta.env.BASE_URL,
  [RELEASE_PROFILE_ENV]: import.meta.env.VITE_RELEASE_PROFILE,
})

export const APP_BASE_PATH = APP_BUILD_SETTINGS.basePath
export const APP_RELEASE_PROFILE = APP_BUILD_SETTINGS.profile
export const APP_ROUTER_BASENAME = routerBasename(APP_BASE_PATH)

export function appUrl(path: string): string {
  return appPath(path, APP_BASE_PATH)
}
