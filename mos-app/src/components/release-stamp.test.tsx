import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readDeploymentStamp } from '@/lib/db/deployment-stamp'
import { ReleaseStamp } from './release-stamp'

vi.mock('@/lib/db/deployment-stamp', () => ({ readDeploymentStamp: vi.fn() }))

const readStamp = vi.mocked(readDeploymentStamp)
const webSha = 'abcdef0123456789abcdef0123456789abcdef01'
const builtAt = '2026-10-19T12:00:00.000Z'

beforeEach(() => {
  vi.clearAllMocks()
  readStamp.mockResolvedValue(null)
})

describe('release stamp', () => {
  it('shows the app version and short web SHA with full build details in its tooltip', async () => {
    const { container } = render(<ReleaseStamp />)

    expect(await screen.findByText('v0.11.0 · web abcdef0')).toBeInTheDocument()
    expect(screen.getByTitle(`Version 0.11.0 · web ${webSha} · built ${builtAt}`)).toBeInTheDocument()
    expect(container.querySelector('a')).toBeNull()
  })

  it('adds the backend SHA after the deployment stamp is read', async () => {
    const backendSha = '1234567890abcdef1234567890abcdef12345678'
    const deployedAt = '2026-10-19T12:30:00.000Z'
    readStamp.mockResolvedValue({ backendSha, deployedAt })
    const { container } = render(<ReleaseStamp />)

    expect(await screen.findByText('v0.11.0 · web abcdef0 · db 1234567')).toBeInTheDocument()
    expect(screen.getByTitle(`Version 0.11.0 · web ${webSha} · built ${builtAt} · db ${backendSha} · deployed ${deployedAt}`)).toBeInTheDocument()
    expect(container.querySelector('a')).toBeNull()
  })

  it('omits the backend SHA when the read fails', async () => {
    readStamp.mockRejectedValue(new Error('unavailable'))
    const { container } = render(<ReleaseStamp variant="rail" />)

    expect(await screen.findByText('v0.11.0 · web abcdef0')).toBeInTheDocument()
    expect(container.textContent).not.toContain('db')
    expect(container.querySelector('a')).toBeNull()
  })

  it('shows only the web identity without attempting a database read on sign-in', () => {
    render(<ReleaseStamp includeDatabase={false} />)

    expect(screen.getByText('v0.11.0 · web abcdef0')).toBeInTheDocument()
    expect(readStamp).not.toHaveBeenCalled()
  })
})
