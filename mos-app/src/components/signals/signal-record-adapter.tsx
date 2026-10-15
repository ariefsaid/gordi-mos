// A Signal has no title: its identity is the first line of what was shared. The record heading
// shows that line whole (a first line past SIGNAL_TITLE_MAX is cut with an ellipsis and the full
// text then leads the message region), and the rest of the body appears once, below it.

export function firstLine(body: string): string {
  return body.trim().split(/\r?\n/)[0] ?? ''
}

/** Longest first line the record heading and the Ask Deputy seed show whole. */
const SIGNAL_TITLE_MAX = 160

/** The heading for a Signal: its first line, cut at SIGNAL_TITLE_MAX with an ellipsis. */
export function signalTitle(body: string): string {
  const line = firstLine(body)
  return line.length > SIGNAL_TITLE_MAX ? `${line.slice(0, SIGNAL_TITLE_MAX).trimEnd()}…` : line
}

/** Everything after the first line, which the heading already shows. */
export function remainingBody(body: string): string {
  return body.trim().split(/\r?\n/).slice(1).join('\n').trim()
}
