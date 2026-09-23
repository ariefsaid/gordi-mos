// Worktree-scoped dev-server addressing (#419).
//
// WHY THIS EXISTS: playwright.config.ts used to pin http://localhost:5173/mos/ with
// reuseExistingServer enabled locally. With several git worktrees on one machine (the
// factory's normal state), a run in worktree B silently adopted worktree A's dev server
// and measured A's application while reporting the result as B's — no error, no warning
// (Playwright logs reuse only under DEBUG=pw:webserver).
//
// NOW: the port AND the identity derive from THIS tree's absolute mos-app path, so two
// worktrees cannot derive the same port, and adoption must be EARNED: the vite plugin
// `mos-dev-identity` (vite.config.ts) serves this worktree's fingerprint at
// MOS_DEV_IDENTITY_PATH, and e2e/global-setup.ts refuses to run against any server that
// cannot present it.
//
// Pure by design: callers (playwright.config.ts, vite.config.ts, e2e/global-setup.ts)
// pass their own directory and their own env read, so this module has no ambient
// process/fs access and typechecks identically under every tsconfig project that
// imports it.
import { resolve } from 'node:path'

/** Server-root path where the dev server publishes its worktree fingerprint. */
export const MOS_DEV_IDENTITY_PATH = '/_mos_dev_identity'

/** Optional explicit port override — the escape hatch for a rare hash collision. */
export const MOS_DEV_PORT_ENV = 'MOS_DEV_PORT'

// 20000–29999: below the ephemeral ranges of both Linux (32768+) and macOS (49152+), so
// the OS will not hand our derived port to an outbound connection either; 10 000 wide
// keeps birthday-collision odds for even a busy machine's worktrees well under 1%.
const PORT_BAND_BASE = 20000
const PORT_BAND_SPAN = 10000

/** FNV-1a 32-bit: deterministic across processes and machines — unlike a random free port. */
function fnv1a32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Stable fingerprint of the mos-app dir a dev server serves (path-derived, never the path itself). */
export function worktreeFingerprint(appDir: string): string {
  return `mos-dev-${fnv1a32(resolve(appDir)).toString(16).padStart(8, '0')}`
}

/** The port this worktree's dev server must live on; an explicit override is validated loudly. */
export function devServerPort(appDir: string, envPort: string | undefined): number {
  if (envPort !== undefined && envPort !== '') {
    const port = Number(envPort)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error(
        `[dev-server] ${MOS_DEV_PORT_ENV}="${envPort}" is not a usable port — need an integer in 1024-65535.`,
      )
    }
    return port
  }
  return PORT_BAND_BASE + (fnv1a32(resolve(appDir)) % PORT_BAND_SPAN)
}

/** App base URL the browser suite must measure (vite serves the app under /mos/). */
export function devServerBaseUrl(appDir: string, envPort: string | undefined): string {
  return `http://localhost:${devServerPort(appDir, envPort)}/mos/`
}

/** URL of the fingerprint endpoint on this worktree's dev server. */
export function devServerIdentityUrl(appDir: string, envPort: string | undefined): string {
  return `http://localhost:${devServerPort(appDir, envPort)}${MOS_DEV_IDENTITY_PATH}`
}

/**
 * The ownership gate (#419): a browser run may only measure a server that proves it is
 * THIS worktree's. Called from e2e/global-setup.ts for every run, reused or fresh.
 *   actual === expected → owned; the run proceeds.
 *   actual === null    → the listener has no identity endpoint: a foreign process on our
 *                        derived port, or a stale dev server started before this fix.
 *   otherwise          → a different worktree's server (hash collision or shared path).
 */
export function assertDevServerOwnership(expected: string, actual: string | null, port: number): void {
  if (actual === expected) return
  if (actual === null) {
    throw new Error(
      `[dev-server] REFUSING to run: the server on localhost:${port} does not identify as this worktree ` +
        `(no ${MOS_DEV_IDENTITY_PATH} endpoint). It is a foreign listener on this worktree's derived port ` +
        `or a stale dev server from before #419. Kill it (lsof -nP -iTCP:${port} -sTCP:LISTEN) and re-run.`,
    )
  }
  throw new Error(
    `[dev-server] REFUSING to run: the server on localhost:${port} identifies as ${actual}, but this ` +
      `worktree is ${expected} — another worktree holds the port (hash collision). Re-run from that tree, ` +
      `or set ${MOS_DEV_PORT_ENV} to a free port for this one.`,
  )
}