// Source scan for machine-entry edge functions (no user session; they authenticate with a shared
// secret). Returns the rules the handler source breaks; empty means it is safe to allowlist.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BEARER_CALL = /(?<!function\s)\bbearerMatches\(/
const BEARER_CHECKED = /if\s*\(\s*!\s*\(?\s*await\s+bearerMatches\([^\n]*\)\s*\)?\s*return\b/
const BEFORE_AUTH = /\bcreateClient\(|\bfetch\(|\bfetchImpl\(|\.storage\b|\.rpc\(|\bpurgePhotos\(/
const BODY_READ = /\breq\.(json|text|formData|arrayBuffer|blob)\(|\.body\b/

export function machineEntryViolations(src: string): string[] {
  const problems: string[] = []
  const handlerAt = Math.max(0, src.search(/\bfunction\s+handle\(/))
  const handler = src.slice(handlerAt)
  const call = handler.search(BEARER_CALL)
  if (call < 0) return ['bearerMatches is never called']
  if (!BEARER_CHECKED.test(handler)) problems.push('bearerMatches result is not checked with an early return')
  const early = handler.slice(0, call).search(BEFORE_AUTH)
  if (early >= 0) problems.push('service-role client or outbound call before bearerMatches')
  if (BODY_READ.test(src)) problems.push('request body is read')
  return problems
}

// The single list of machine-entry functions (also read by scripts/deploy-staging.sh).
export function machineEntryNames(functionsDir: string): string[] {
  return readFileSync(join(functionsDir, 'machine-entries.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}
