import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// TasksPage pulls in auth/data; stub it so the layout's render decision is the
// only thing under test.
vi.mock('./TasksPage', () => ({
  default: () => <div data-testid="tasks-list">list</div>,
}))

import TasksLayout from './TasksLayout'

function ChildStub() {
  return <div data-testid="task-child">child</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tasks" element={<TasksLayout />}>
          <Route path="new" element={<ChildStub />} />
          <Route path=":taskId" element={<ChildStub />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// PR-A contract (ADR-0007): behavior-preserving — the rendered output stays
// identical to the old sibling routes. At /tasks the list shows; at a child
// route ONLY the child shows (no table beside it — that is the PR-B split-view).
describe('TasksLayout — nested-route render decision (ADR-0007, PR-A)', () => {
  it('renders the list (no child) at /tasks', () => {
    renderAt('/tasks')
    expect(screen.getByTestId('tasks-list')).toBeInTheDocument()
    expect(screen.queryByTestId('task-child')).toBeNull()
  })

  it('renders only the detail child at /tasks/:taskId (list not shown)', () => {
    renderAt('/tasks/task-abc')
    expect(screen.getByTestId('task-child')).toBeInTheDocument()
    expect(screen.queryByTestId('tasks-list')).toBeNull()
  })

  it('renders only the create child at /tasks/new (list not shown)', () => {
    renderAt('/tasks/new')
    expect(screen.getByTestId('task-child')).toBeInTheDocument()
    expect(screen.queryByTestId('tasks-list')).toBeNull()
  })
})
