import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { WorkloadCaption } from './workload-caption'

describe('WorkloadCaption locale grammar', () => {
  it('renders the Indonesian workload sentence and accessible label', () => {
    render(
      <I18nProvider initialLocale="id">
        <WorkloadCaption summary={{
          isSelf: true,
          firstName: 'Arief',
          projectCount: 1,
          dailyCount: 2,
          unassignedCount: 1,
        }} />
      </I18nProvider>,
    )

    expect(screen.getByRole('status', { name: 'Ringkasan beban kerja' })).toHaveTextContent(
      'Pekerjaan Anda: 1 proyek dan 2 pekerjaan harian dan 1 belum ditugaskan.',
    )
  })
})
