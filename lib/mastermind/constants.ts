export const MASTERMIND_EVENT_SLUG = 'upcoming-mastermind'

export const MASTERMIND_SESSION_TIMEZONE = 'America/New_York'

/** First session — Thursday, June 25, 2026, 12:00 p.m. EST */
export const MASTERMIND_SESSION_START_ISO = '2026-06-25T17:00:00.000Z'

export const MASTERMIND_SESSION_WHEN = 'Thursday, June 25th at 12:00 p.m. EST'

export const MASTERMIND_SESSION_DURATION = '45-minute'

export const MASTERMIND_TEAMS_JOIN_URL =
  process.env.NEXT_PUBLIC_MASTERMIND_TEAMS_URL?.trim() ||
  'https://teams.microsoft.com/l/meetup-join/19%3ameeting_NWZjNmY5MDItMTY5My00MWZjLWIwMTQtYWQ0ZTMyYjgxZmU0%40thread.v2/0?context=%7b%22Tid%22%3a%22610f31c8-81bf-4da1-8832-e215c57209b2%22%2c%22Oid%22%3a%228e9d8c7f-63c9-4d33-ba68-5c6afcb744ee%22%7d'
