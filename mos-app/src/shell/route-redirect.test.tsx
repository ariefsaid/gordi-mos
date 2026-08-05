import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { RouteRedirect } from './route-redirect'

// The one redirect element in the route table (FR-015/FR-016). Everything the redirect map
// promises — one hop, history replaced, query preserved, params substituted — is this component's
// behaviour, so it is proven here once, behaviourally, and the table-level tests then only have to
// prove that every retired path uses it.

function Probe() {
  const loc = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <span data-testid="here">{loc.pathname + loc.search}</span>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  )
}

function renderAt(entries: string[], from: string, to: string) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path={from} element={<RouteRedirect to={to} />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RouteRedirect', () => {
  it('FR-015: forwards to the canonical path', () => {
    renderAt(['/tasks'], '/tasks', '/work/tasks')
    expect(screen.getByTestId('here')).toHaveTextContent('/work/tasks')
  })

  it('FR-016: carries ?view= and ?record= across the hop', () => {
    renderAt(['/kitchen/log?view=week&record=abc'], '/kitchen/log', '/cafe/log')
    expect(screen.getByTestId('here')).toHaveTextContent('/cafe/log?view=week&record=abc')
  })

  it('FR-015: substitutes :params, so a record deep link keeps its record', () => {
    renderAt(['/tasks/t-42?record=t-42'], '/tasks/:taskId', '/work/tasks/:taskId')
    expect(screen.getByTestId('here')).toHaveTextContent('/work/tasks/t-42?record=t-42')
  })

  it('a target that names its own view keeps it and drops the incoming query', () => {
    // /work/follow-ups is retired INTO a specific view of Tasks. Honouring the caller's ?view=
    // would land them on a different view than the redirect exists to send them to.
    renderAt(['/work/follow-ups?view=all'], '/work/follow-ups', '/work/tasks?view=followups')
    expect(screen.getByTestId('here')).toHaveTextContent('/work/tasks?view=followups')
  })

  it('FR-015: replaces the history entry, so Back does not re-enter the retired path', async () => {
    const user = userEvent.setup()
    // Arrive at the retired path FROM somewhere real, so there is a previous entry to go back to.
    renderAt(['/inbox', '/tasks'], '/tasks', '/work/tasks')
    expect(screen.getByTestId('here')).toHaveTextContent('/work/tasks')

    await user.click(screen.getByRole('button', { name: 'back' }))

    // Back lands on where the viewer actually came from. If the redirect PUSHED instead of
    // replacing, Back would land on /tasks — which immediately redirects forward again, trapping
    // the viewer on a path they are trying to leave.
    expect(screen.getByTestId('here')).toHaveTextContent('/inbox')
  })
})
