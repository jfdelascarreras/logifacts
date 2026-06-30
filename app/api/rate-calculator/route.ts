import { NextResponse } from 'next/server'

// Endpoint moved to /api/v1/rate-calculator. Redirect existing integrations.
export async function POST(req: Request) {
  const url = new URL(req.url)
  url.pathname = '/api/v1/rate-calculator'
  return NextResponse.redirect(url, { status: 308 })
}
