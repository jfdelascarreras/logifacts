import { createClient } from 'npm:@supabase/supabase-js@2'

type OnboardPayload = {
  email?: string
  full_name?: string
  company_name?: string
  source?: string
  external_id?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zapier-secret',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed. Use POST.' }, 405)
  }

  const expectedSecret = Deno.env.get('ZAPIER_SECRET') ?? ''
  if (!expectedSecret) {
    return jsonResponse({ ok: false, error: 'Function secret is not configured.' }, 500)
  }

  const receivedSecret = req.headers.get('x-zapier-secret') ?? ''
  if (receivedSecret !== expectedSecret) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401)
  }

  let payload: OnboardPayload
  try {
    payload = (await req.json()) as OnboardPayload
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400)
  }

  const email = (payload.email ?? '').trim().toLowerCase()
  const fullName = (payload.full_name ?? '').trim()
  const companyName = (payload.company_name ?? '').trim()
  const source = (payload.source ?? 'landbot').trim()
  const externalId = (payload.external_id ?? '').trim()

  if (!email) {
    return jsonResponse({ ok: false, error: 'Missing required field: email.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function environment.' },
      500
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  try {
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (listError) {
      throw listError
    }

    const existingUser = listData.users.find((user) => user.email?.toLowerCase() === email)

    if (!existingUser) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          company_name: companyName,
          source,
          external_id: externalId,
        },
      })

      if (createError || !created.user) {
        throw createError ?? new Error('Unable to create user.')
      }

      return jsonResponse(
        {
          ok: true,
          status: 'created',
          user_id: created.user.id,
          email: created.user.email,
        },
        200
      )
    }

    const mergedMetadata = {
      ...(existingUser.user_metadata ?? {}),
      ...(fullName ? { full_name: fullName } : {}),
      ...(companyName ? { company_name: companyName } : {}),
      ...(source ? { source } : {}),
      ...(externalId ? { external_id: externalId } : {}),
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
      email,
      user_metadata: mergedMetadata,
    })

    if (updateError || !updated.user) {
      throw updateError ?? new Error('Unable to update user.')
    }

    return jsonResponse(
      {
        ok: true,
        status: 'updated',
        user_id: updated.user.id,
        email: updated.user.email,
      },
      200
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ ok: false, error: message }, 500)
  }
})
