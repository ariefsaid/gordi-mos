import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { EventsCalendarPresentation } from './events-calendar-presentation'

const event = { id: 'event-1', org_id: 'org-1', title: 'Site visit', venue: 'Warehouse', is_outbound: true, starts_at: '2026-12-31T16:00:00.000Z', ends_at: '2027-01-02T03:00:00.000Z', note: null, business_unit_id: null, coordinator_person_id: null, created_by: 'person-1', archived_at: null, created_at: '', updated_at: '' }

describe('EventsCalendarPresentation', () => {
  it('shows a spanning event once on each overlapping WIB day with truthful metadata', () => {
    render(<I18nProvider><EventsCalendarPresentation month="2027-01" events={[event]} /></I18nProvider>)
    expect(screen.getByRole('region', { name: 'Events calendar' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Events agenda' })).toBeInTheDocument()
    expect(screen.getAllByText('Site visit')).toHaveLength(5)
    expect(screen.getAllByText('Outbound')).toHaveLength(5)
    expect(screen.getAllByRole('time')).not.toHaveLength(0)
  })

  it('renders no calendar records for an empty month', () => {
    render(<I18nProvider><EventsCalendarPresentation month="2027-01" events={[]} /></I18nProvider>)
    expect(screen.queryByRole('article')).toBeNull()
  })
})
