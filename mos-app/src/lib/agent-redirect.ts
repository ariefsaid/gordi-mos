// Where the login service sends the browser after a consent decision: back to the agent app.
// The target is the agent's own registered address, so the page shows where it goes and refuses
// script-like schemes; it never reads or displays the code or token in the query string.

const REFUSED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'])

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null // relative and malformed addresses have no scheme to trust
  }
}

export function isSafeAgentRedirect(url: string): boolean {
  const parsed = parse(url)
  return parsed !== null && !REFUSED_SCHEMES.has(parsed.protocol)
}

/** The host for a web target (`agent.example.test:8443`), `scheme://host` for an app target; never the path or query. */
export function agentRedirectLabel(url: string): string {
  const parsed = parse(url)
  if (!parsed) return ''
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.host
  return `${parsed.protocol}//${parsed.host}`
}

export function redirectToAgent(url: string): void {
  window.location.assign(url)
}
