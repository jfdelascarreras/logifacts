import { NextResponse } from 'next/server'

import { getCustomerContext } from '@/lib/portal/getCustomerContext'
import { createClient } from '@/lib/supabase/server'

const BASE_URL = 'https://logifacts.com'

function authHeader() {
  return [
    { key: 'Authorization', value: 'Bearer {{LOGIFACTS_API_KEY}}', type: 'text' },
    { key: 'Content-Type', value: 'application/json', type: 'text' },
  ]
}

function buildCollection(customerId: string, customerName: string): object {
  const syncBody = {
    customer_id: customerId,
    origin_zip: '60601',
    destination_zip: '90210',
    weight_lbs: 12.5,
    dimensions_in: { length: 12, width: 10, height: 8 },
    residential: false,
    ups_service: 'ground',
    fedex_service: 'ground',
    markup_pct: 0,
  }

  const asyncBody = {
    ...syncBody,
    callback_url: 'https://your-server.example.com/webhooks/logifacts',
  }

  return {
    info: {
      _postman_id: crypto.randomUUID(),
      name: `LogiFacts API — ${customerName}`,
      description:
        'Rate Calculator API for live UPS and FedEx estimates with contract discounts applied.\n\n' +
        'Set the LOGIFACTS_API_KEY collection variable to your full API key before running requests.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      {
        name: '1 — Rate Calculator (sync)',
        request: {
          method: 'POST',
          header: authHeader(),
          body: {
            mode: 'raw',
            raw: JSON.stringify(syncBody, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: {
            raw: `${BASE_URL}/api/v1/rate-calculator`,
            protocol: 'https',
            host: ['logifacts', 'com'],
            path: ['api', 'v1', 'rate-calculator'],
          },
          description:
            'Returns UPS and FedEx rate breakdowns immediately in the response body.\n\n' +
            '**Required fields:** customer_id, origin_zip, destination_zip, weight_lbs, dimensions_in\n' +
            '**Optional:** ups_service, fedex_service, markup_pct, residential, non_standard, address_correction',
        },
        response: [],
      },
      {
        name: '2 — Rate Calculator (async)',
        request: {
          method: 'POST',
          header: authHeader(),
          body: {
            mode: 'raw',
            raw: JSON.stringify(asyncBody, null, 2),
            options: { raw: { language: 'json' } },
          },
          url: {
            raw: `${BASE_URL}/api/v1/rate-calculator`,
            protocol: 'https',
            host: ['logifacts', 'com'],
            path: ['api', 'v1', 'rate-calculator'],
          },
          description:
            'Add callback_url to trigger async mode. Returns a request_id immediately; ' +
            'results are POSTed to callback_url once calculated.\n\n' +
            'Verify the webhook by checking the X-Logifacts-Signature header:\n' +
            'HMAC-SHA256(key=SHA256(apiKey), data=body) must match the sha256= prefix value.',
        },
        response: [],
      },
      {
        name: '3 — Poll request status',
        request: {
          method: 'GET',
          header: authHeader(),
          url: {
            raw: `${BASE_URL}/api/v1/rate-requests/{{REQUEST_ID}}`,
            protocol: 'https',
            host: ['logifacts', 'com'],
            path: ['api', 'v1', 'rate-requests', '{{REQUEST_ID}}'],
          },
          description:
            'Poll the status of an async rate request. Set REQUEST_ID to the id returned by the async request.\n\n' +
            'Status values: pending | completed | failed | delivery_failed',
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
      {
        key: 'REQUEST_ID',
        value: '',
        type: 'default',
        description: 'UUID returned by an async rate-calculator request. Used by the poll request.',
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
