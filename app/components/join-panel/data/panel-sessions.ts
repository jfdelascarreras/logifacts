export type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly'

export type PanelSeries = {
  id: string
  name: string
  description: string
  timezone: string
  cadence: RecurrenceCadence
  activeFrom: string
  activeUntil?: string
}

export type PanelSession = {
  id: string
  seriesId: string
  startsAt: string
  endsAt: string
  title: string
  details: string
  seatsLabel: string
  joinStatus: 'waitlist-open' | 'waitlist-soon'
}

export const panelSeries: PanelSeries[] = [
  {
    id: 'shipping-clarity-series',
    name: 'Shipping Clarity Sessions',
    description: 'Recurring focus groups on data quality, visibility, and communication.',
    timezone: 'America/New_York',
    cadence: 'weekly',
    activeFrom: '2026-04-01',
  },
]

export const upcomingPanelSessions: PanelSession[] = [
  {
    id: 'session-2026-05-01',
    seriesId: 'shipping-clarity-series',
    startsAt: '2026-05-01T12:00:00.000Z',
    endsAt: '2026-05-01T13:00:00.000Z',
    title: 'Panel Session: Clarity in Carrier Billing',
    details: 'How teams standardize charge interpretation to reduce disputes.',
    seatsLabel: 'Limited seats available',
    joinStatus: 'waitlist-open',
  },
  {
    id: 'session-2026-05-08',
    seriesId: 'shipping-clarity-series',
    startsAt: '2026-05-08T12:00:00.000Z',
    endsAt: '2026-05-08T13:00:00.000Z',
    title: 'Panel Session: Surcharge Visibility',
    details: 'Common blind spots in surcharge analysis and reporting.',
    seatsLabel: 'Waitlist starts this week',
    joinStatus: 'waitlist-soon',
  },
  {
    id: 'session-2026-05-15',
    seriesId: 'shipping-clarity-series',
    startsAt: '2026-05-15T12:00:00.000Z',
    endsAt: '2026-05-15T13:00:00.000Z',
    title: 'Panel Session: Building Shared Logistics Language',
    details: 'Practices for alignment across operations, finance, and analysts.',
    seatsLabel: 'Limited seats available',
    joinStatus: 'waitlist-open',
  },
]
