// Where the login service sends the browser after a consent decision: back to the agent app.
// The target is the agent's own registered address, so the page shows where it goes and follows
// only web addresses and the named agent app schemes; it never reads or displays the code or
// token in the query string. A new agent app scheme is added here, on purpose.

const WEB_SCHEMES = new Set(['http:', 'https:'])
const AGENT_APP_SCHEMES = new Set(['cursor:', 'vscode:'])

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null // relative and malformed addresses have no scheme to trust
  }
}

export function isSafeAgentRedirect(url: string): boolean {
  const parsed = parse(url)
  return parsed !== null && (WEB_SCHEMES.has(parsed.protocol) || AGENT_APP_SCHEMES.has(parsed.protocol))
}

/** The host for a web target (`agent.example.test:8443`), `scheme://host` for an app target; never the path or query. */
export function agentRedirectLabel(url: string): string {
  const parsed = parse(url)
  if (!parsed) return ''
  if (WEB_SCHEMES.has(parsed.protocol)) return parsed.host
  return `${parsed.protocol}//${parsed.host}`
}

export function redirectToAgent(url: string): void {
  window.location.assign(url)
}
