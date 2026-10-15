import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
vi.mock('@/lib/db/events', () => ({ EVENTS_WINDOW_MAX_ROWS: 1001 }))
import { EVENTS_WINDOW_MAX_ROWS } from '@/lib/db/events'
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

  it('shows no per-day remainder at the visible event boundary', () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      ...event,
      id: `day-${index}`,
      title: `Day event ${index + 1}`,
      starts_at: '2027-01-05T01:00:00.000Z',
      ends_at: '2027-01-05T02:00:00.000Z',
    }))
    render(<I18nProvider><EventsCalendarPresentation month="2027-01" events={rows} /></I18nProvider>)
    expect(within(screen.getByRole('region', { name: 'Events calendar' })).queryByText('+1 more')).toBeNull()
  })

  it('lets keyboard users expand every event for a day in the calendar', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 4 }, (_, index) => ({
      ...event,
      id: `day-${index}`,
      title: `Day event ${index + 1}`,
      starts_at: '2027-01-05T01:00:00.000Z',
      ends_at: '2027-01-05T02:00:00.000Z',
    }))
    render(<I18nProvider><EventsCalendarPresentation month="2027-01" events={rows} /></I18nProvider>)
    const calendar = screen.getByRole('region', { name: 'Events calendar' })
    const more = within(calendar).getByRole('button', { name: /show 1 more event on .*5 Jan/i })

    expect(more).toHaveAttribute('aria-expanded', 'false')
    more.focus()
    await user.keyboard('{Enter}')
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(calendar).getByText('Day event 4')).toBeInTheDocument()

    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(within(calendar).queryByText('Day event 4')).toBeNull()
  })

  it.each([
    {
      locale: 'en' as const,
      calendar: 'Events calendar',
      agenda: 'Events agenda',
      moreText: '+1 more',
      moreName: /Show 1 more event on .*5 Jan/i,
      loadedCopy: /1000 events loaded/,
    },
    {
      locale: 'id' as const,
      calendar: 'Kalender acara',
      agenda: 'Agenda acara',
      moreText: '+1 lainnya',
      moreName: /Tampilkan 1 acara lagi pada .*5 Jan/i,
      loadedCopy: /1000 acara yang dimuat/,
    },
  ])('shows localized overflow wording without dropping the loaded agenda ($locale)', ({
    locale, calendar: calendarName, agenda, moreText, moreName, loadedCopy,
  }) => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      ...event,
      id: `day-${index}`,
      title: `Day event ${index + 1}`,
      starts_at: '2027-01-05T01:00:00.000Z',
      ends_at: '2027-01-05T02:00:00.000Z',
    }))
    render(
      <I18nProvider initialLocale={locale}>
        <EventsCalendarPresentation month="2027-01" events={rows} hasMoreEvents loadedEventLimit={1000} />
      </I18nProvider>,
    )
    const calendar = screen.getByRole('region', { name: calendarName })
    expect(within(calendar).getByText(moreText)).toBeInTheDocument()
    expect(within(calendar).getByRole('button', { name: moreName })).toHaveAttribute('aria-expanded', 'false')
    const windowNotice = screen.getByText(loadedCopy)
    expect(windowNotice).not.toHaveAttribute('role', 'status')
    expect(windowNotice).not.toHaveAttribute('aria-live')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getAllByText('Day event 4')).toHaveLength(1)
    expect(screen.getByRole('region', { name: agenda })).toBeInTheDocument()
  })

  it('uses the exported Events window size for its default limit notice', () => {
    render(<I18nProvider><EventsCalendarPresentation month="2027-01" events={[]} hasMoreEvents /></I18nProvider>)
    expect(screen.getByText(`More events may exist beyond the ${EVENTS_WINDOW_MAX_ROWS} events loaded.`)).toBeInTheDocument()
  })

  it('renders no calendar records for an empty month', () => {
    render(<I18nProvider><EventsCalendarPresentation month="2027-01" events={[]} /></I18nProvider>)
    expect(screen.queryByRole('article')).toBeNull()
  })
})
