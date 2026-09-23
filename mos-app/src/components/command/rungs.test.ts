import { describe, expect, it } from 'vitest'
import { WORK_PARENT_ID, withResolvedRungs, type CommandItem } from './rungs'

function row(id: string, over: Partial<CommandItem> = {}): CommandItem {
  return { id, label: id, Icon: () => null, kind: 'navigate', ...over }
}

// Issue 479, pinned at the resolver: the rung is a RELATIONSHIP, drawn only while an unbroken run
// of children reaches back to the rendered Work row. The palette cannot render the broken shape
// (the typed view emits children adjacent to the Work row), so this contract is exercised here
// rather than through render — and the loose `underWork ||` form, which latches after the Work
// row instead of resetting on every non-child, must come back red.
describe('withResolvedRungs (issue 479)', () => {
  it('a child whose run back to Work is broken by an unrelated row wears no rung', () => {
    const resolved = withResolvedRungs([
      row(WORK_PARENT_ID),
      row('n-inbox'),
      row('n-tasks', { child: true }),
    ])
    expect(resolved[2].child).toBe(false)
  })
})
