import { NextResponse } from 'next/server'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'

function buildCollection(customerId: string, customerName: string): object {
  const requestBody = {
    customer_id: customerId,
    origin_zip: '60601',
    destination_zip: '90210',
    weight_lbs: 12.5,
    residential: false,
    ups_service: 'ground',
    fedex_service: 'ground',
    markup_pct: 0,
  }

  return {
    info: {
      _postman_id: crypto.randomUUID(),
      name: `LogiFacts API — ${customerName}`,
      description:
        'Rate Calculator API for getting live UPS and FedEx shipping estimates with contract discounts applied.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      {
        name: 'Rate Calculator',
        request: {
          method: 'POST',
          header: [
            {
              key: 'Authorization',
              value: 'Bearer {{LOGIFACTS_API_KEY}}',
              type: 'text',
            },
            {
              key: 'Content-Type',
              value: 'application/json',
              type: 'text',
            },
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify(requestBody, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: {
            raw: 'https://logifacts.com/api/rate-calculator',
            protocol: 'https',
            host: ['logifacts', 'com'],
            path: ['api', 'rate-calculator'],
          },
          description:
            'Returns UPS and FedEx rate breakdowns for a shipment. Both carriers are calculated in a single request.',
        },
        response: [],
      },
    ],
    variable: [
      {
        key: 'LOGIFACTS_API_KEY',
        value: 'lf_your_api_key_here',
        type: 'default',
        description: 'Your LogiFacts API key. Get the full key from the Credentials page.',
      },
    ],
  }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const ctx = await getCustomerContext(user.id)
  if (!ctx) return NextResponse.json({ error: 'No portal access configured.' }, { status: 403 })

  const collection = buildCollection(ctx.customer_id, ctx.name)
  const json = JSON.stringify(collection, null, 2)

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="logifacts-api.postman_collection.json"`,
    },
  })
}
