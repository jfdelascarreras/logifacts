import type { PanelSession } from '@/app/components/join-panel/data/panel-sessions'

export function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
}

export function formatSessionDateLabel(isoDate: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(isoDate))
}

export function sessionMatchesQuery(session: PanelSession, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) {
    return true
  }

  const searchableContent = [
    session.title,
    session.details,
    session.seatsLabel,
    formatSessionDateLabel(session.startsAt, 'America/New_York'),
  ]
    .join(' ')
    .toLowerCase()

  return searchableContent.includes(normalizedQuery)
}
