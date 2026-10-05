/** Copy a canonical app route as an absolute URL, rejecting when clipboard access is unavailable. */
export async function copyCanonicalLink(href: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText || typeof window === 'undefined') {
    throw new Error('Clipboard access is unavailable')
  }
  await navigator.clipboard.writeText(new URL(href, window.location.origin).href)
}
