export const SW_BUILD_ID_PLACEHOLDER = '__MOS_BUILD_ID__'

export function stampServiceWorker(source: string, releaseSha: string): string {
  const id = releaseSha.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'unknown'
  return source.replaceAll(SW_BUILD_ID_PLACEHOLDER, id)
}
