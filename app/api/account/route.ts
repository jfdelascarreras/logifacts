import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { deleteUserData } from '@/lib/account/delete-user-data'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type CloseAccountBody = {
  password?: string
  confirmEmail?: string
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: CloseAccountBody
  try {
    body = (await request.json()) as CloseAccountBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const confirmEmail = body.confirmEmail?.trim().toLowerCase() ?? ''
  const accountEmail = user.email?.trim().toLowerCase() ?? ''

  if (!confirmEmail || confirmEmail !== accountEmail) {
    return NextResponse.json(
      { error: 'Email confirmation does not match your account email.' },
      { status: 400 }
    )
  }

  const password = body.password ?? ''
  if (!password) {
    return NextResponse.json({ error: 'Password is required to close your account.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json({ error: 'Auth is not configured.' }, { status: 500 })
  }

  const verifyClient = createSupabaseJsClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: signInError } = await verifyClient.auth.signInWithPassword({
    email: user.email!,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    await deleteUserData(admin, user.id)

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteUserError) {
      return NextResponse.json({ error: deleteUserError.message }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to close account.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
