import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient }  from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  // ── 1. Authenticate the caller ──────────────────────────────────────────── //
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────── //
  let email: string
  try {
    const body = await request.json() as { email?: string }
    if (typeof body.email !== 'string' || !body.email.includes('@')) {
      throw new Error('invalid email')
    }
    email = body.email
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // ── 3. Resolve caller's account and verify owner role ───────────────────── //
  const { data: membership, error: memberErr } = await supabase
    .from('account_members')
    .select('account_id, role')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (memberErr || !membership) {
    return NextResponse.json(
      { error: 'You must be an account owner to invite members.' },
      { status: 403 },
    )
  }

  const accountId = membership.account_id as string

  // ── 4. Insert invitation row (uses RLS — caller must be owner) ──────────── //
  const { data: invitation, error: invErr } = await supabase
    .from('invitations')
    .insert({ account_id: accountId, invited_by: user.id, email, role: 'member' })
    .select('token')
    .single()

  if (invErr || !invitation) {
    return NextResponse.json(
      { error: invErr?.message ?? 'Failed to create invitation' },
      { status: 500 },
    )
  }

  const inviteToken = invitation.token as string

  // ── 5. Send invite email via Supabase Admin API ─────────────────────────── //
  // SUPABASE_SERVICE_ROLE_KEY is server-only — never exposed to the client.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const redirectTo =
    `${process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin}/auth/callback` +
    `?invite_token=${inviteToken}`

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { invite_token: inviteToken },
  })

  if (inviteErr) {
    // Soft-fail if user already exists — they'll still get access via the token.
    // Only return an error for unexpected failures.
    if (!inviteErr.message.toLowerCase().includes('already registered')) {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
