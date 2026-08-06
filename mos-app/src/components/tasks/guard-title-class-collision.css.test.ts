// The task row's title span carries BOTH `.task-name` and `.collection-grammar-title`, and the two
// classes set DIFFERENT font sizes (body-lg 15px vs body 14px) at IDENTICAL specificity. Nothing
// in CSS breaks that tie except which stylesheet the module graph imports last — so the same two
// files, byte-for-byte identical across two branches, rendered 15px on one and 14px on the other.
//
// DESIGN.md: "Two identically-named classes always collide eventually; there is no such thing as a
// 'locally scoped' global CSS class." This is the same hazard one step along — not a duplicated
// name, but two names landing on one element with no tie-break.
//
// The fix is a combined-selector rule, which raises specificity and settles it regardless of order.
// This guard asserts that rule still exists, so deleting it as "redundant" cannot quietly hand the
// decision back to import order.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('the task title collision is settled by specificity, not by import order', () => {
  it('both classes really do set a font-size, so the tie is real', () => {
    expect(read('src/components/tasks/TasksWorkspace.css')).toMatch(
      /\.task-name\s*\{[\s\S]*?font-size:\s*var\(--font-size-body-lg\)/,
    )
    expect(read('src/components/collection-grammar.css')).toMatch(
      /\.collection-grammar-title\s*\{[\s\S]*?font-size:\s*var\(--font-size-body\)/,
    )
  })

  it('a combined selector pins the winner to body-lg', () => {
    expect(
      read('src/components/tasks/TasksWorkspace.css'),
      'without this rule the task title size depends on stylesheet import order',
    ).toMatch(/\.collection-grammar-title\.task-name\s*\{[^}]*font-size:\s*var\(--font-size-body-lg\)/)
  })
})
