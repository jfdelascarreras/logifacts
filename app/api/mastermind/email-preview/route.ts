import { NextResponse } from 'next/server'

import { buildMastermindConfirmationEmail } from '@/lib/mastermind/confirmation-email'

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const fullName = searchParams.get('fullName')?.trim() || 'Jane Smith'
  const email = searchParams.get('email')?.trim() || 'jane@company.com'
  const format = searchParams.get('format')?.trim() || 'html'

  const content = buildMastermindConfirmationEmail({ fullName, email })

  if (format === 'text') {
    return new NextResponse(content.text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  if (format === 'ics') {
    return new NextResponse(content.calendarInvite.content, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${content.calendarInvite.filename}"`,
      },
    })
  }

  return new NextResponse(content.html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
