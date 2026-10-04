import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '@/auth/context'
import { CreateDraftProvider, useCreateDraftRef, useCreateDraftState } from './create-drafts'

const viewer: Extract<AuthState, { status: 'authenticated' }> = {
  status: 'authenticated',
  viewer: {
    person: { id: 'person-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Test Viewer', email: 'viewer@example.test', must_change_password: false, archived_at: null, created_at: '', updated_at: '' },
    roles: [], isManager: false, accessRoles: ['member'], affiliated: [],
  },
  signOut: async () => {},
}

function Composer({ save }: { save: () => Promise<void> }) {
  const [title, setTitle] = useCreateDraftState('title', '')
  const submitted = useCreateDraftRef('submitted', '')
  return <>
    <label>Draft title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <button onClick={() => {
      submitted.current = title
      void save().then(() => setTitle(''), () => setTitle(submitted.current))
    }}>Save</button>
  </>
}

// AC-004
describe('session-owned creation buffers', () => {
  it.each([['person', false], ['org', false], ['auth', false], ['sign-out', false], ['person', true]] as const)('retires the old %s session, including unfinished save callbacks (rejected: %s)', async (change, rejected) => {
    let finish!: () => void
    const save = vi.fn(() => new Promise<void>((resolve, reject) => { finish = () => rejected ? reject(new Error('Stale rejection')) : resolve() }))
    const tree = (auth: AuthState) => <AuthContext.Provider value={auth}><CreateDraftProvider><Composer save={save} /></CreateDraftProvider></AuthContext.Provider>
    const view = render(tree(viewer))
    fireEvent.change(screen.getByLabelText('Draft title'), { target: { value: 'First session draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const person = { ...viewer.viewer.person }
    if (change === 'person') person.id = 'person-2'
    if (change === 'org') person.org_id = 'org-2'
    if (change === 'auth') person.user_id = 'auth-2'
    const next: AuthState = change === 'sign-out' ? { status: 'unauthenticated', signedOut: true } : { ...viewer, viewer: { ...viewer.viewer, person } }
    view.rerender(tree(next))
    expect(screen.getByLabelText('Draft title')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Draft title'), { target: { value: 'Second session draft' } })
    await act(async () => finish())
    expect(screen.getByLabelText('Draft title')).toHaveValue('Second session draft')
    view.rerender(tree(viewer))
    expect(screen.getByLabelText('Draft title')).toHaveValue('')
  })

  it('keeps isolated composers usable outside the shell and retains the entered value on rejected save', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Save rejected'))
    render(<Composer save={save} />)
    fireEvent.change(screen.getByLabelText('Draft title'), { target: { value: 'Retry this draft' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByLabelText('Draft title')).toHaveValue('Retry this draft')
  })
})
