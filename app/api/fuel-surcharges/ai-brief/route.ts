import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type WeekRow = {
  week: string
  eia: number | null
  upsGround: number | null
  upsAir: number | null
  fedexGround: number | null
  fedexExpress: number | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 503 }
    )
  }

  const body = await req.json() as {
    weeklyData: WeekRow[]
    weeklySpend: number
    contractDiscountPct: number
  }

  const last6 = (body.weeklyData ?? [])
    .slice(-6)
    .map((d) =>
      `Week ${d.week}: EIA Diesel $${d.eia ?? 'n/a'}/gal | UPS Ground ${d.upsGround ?? 'n/a'}% | FedEx Ground ${d.fedexGround ?? 'n/a'}% | UPS Air ${d.upsAir ?? 'n/a'}%`
    )
    .join('\n')

  const spend = body.weeklySpend ?? 19000
  const disc = body.contractDiscountPct ?? 30
  const latestUps = body.weeklyData?.at(-1)?.upsGround
  const contracted = latestUps != null ? +(latestUps * (1 - disc / 100)).toFixed(2) : null

  const userContent = [
    `Write a weekly fuel surcharge intelligence brief for a logistics manager spending $${spend.toLocaleString()}/week in carrier charges.`,
    '',
    `Recent 6 weeks of data:`,
    last6,
    '',
    contracted != null
      ? `Their contracted UPS Ground rate is ${contracted}% (vs list ${latestUps}%, ${disc}% discount).`
      : '',
    '',
    'Brief (under 180 words, flowing paragraphs, no bullets):',
  ].join('\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system:
          'You are a logistics intelligence analyst for LogiFacts. Write crisp, data-driven weekly fuel surcharge briefings for shipping managers. Be specific with numbers. Cover: what happened this week, what to expect in 5–6 weeks based on EIA lag, and the dollar impact at the client\'s weekly spend level. Under 180 words. Flowing paragraphs, no bullets.',
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Anthropic API error: ${res.status} — ${err}` }, { status: 502 })
    }

    const data = await res.json() as { content?: Array<{ text: string }> }
    const text = data.content?.[0]?.text ?? ''
    return NextResponse.json({ text })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'AI brief failed' },
      { status: 502 }
    )
  }
}
