import type { ActionItem, SavingsEstimate } from '@/lib/premium-analysis/agents-types'

const INSTRUCTIONS: Record<string, { effort: ActionItem['effort']; text: string }> = {
  address_correction: {
    effort: 'low',
    text: 'Enable address validation at checkout to eliminate $10–15 per correction.',
  },
  fuel_over_eia: {
    effort: 'low',
    text: 'File billing error claims for fuel lines over the published EIA rate for the invoice week.',
  },
  contract_discount_shortfall: {
    effort: 'low',
    text: 'Request UPS/FedEx billing adjustment for rows where incentive discount is below contract.',
  },
  accessorial_rate_high: {
    effort: 'medium',
    text: 'Identify top 2–3 accessorial types driving rate above 10% and target each with a mitigation plan.',
  },
  avoidable_expedited: {
    effort: 'medium',
    text: 'Route zone ≤3 shipments on Ground instead of expedited service where transit is equivalent.',
  },
  additional_handling: {
    effort: 'high',
    text: 'Measure top SKU carton dimensions and reduce additional handling triggers before resizing all packaging.',
  },
  large_package: {
    effort: 'medium',
    text: 'Verify shipment dimensions; file a claim if carrier measurements are inaccurate.',
  },
  weight_gap_high: {
    effort: 'high',
    text: 'Measure top 5 SKU boxes against DIM divisor — positive gap indicates billable DIM weight issue.',
  },
  declared_value: {
    effort: 'low',
    text: 'Review declared value coverage — consumer goods often covered by standard $100 liability.',
  },
  monthly_spend_spike: {
    effort: 'medium',
    text: 'Investigate spike month volume mix, rate changes, and one-time surcharges.',
  },
}

const EFFORT_SCORE: Record<ActionItem['effort'], number> = {
  low: 3,
  medium: 2,
  high: 1,
}

export function prioritizeActions(savings: SavingsEstimate): ActionItem[] {
  const items = savings.opportunities.map((opp) => {
    const meta = INSTRUCTIONS[opp.type] ?? {
      effort: 'medium' as const,
      text: `Review flagged ${opp.type.replace(/_/g, ' ')} opportunities with operations team.`,
    }
    const score = opp.annualizedHigh * EFFORT_SCORE[meta.effort]
    return { opp, meta, score }
  })

  items.sort((a, b) => b.score - a.score)

  return items.map(({ opp, meta }, index) => ({
    rank: index + 1,
    category: opp.type.replace(/_/g, ' '),
    annualSavingsLow: +opp.annualizedLow.toFixed(2),
    annualSavingsHigh: +opp.annualizedHigh.toFixed(2),
    effort: meta.effort,
    instructions: meta.text,
    executable: index < 3,
  }))
}
