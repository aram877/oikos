import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient }  from '@supabase/supabase-js'
import { INVITABLE_ROLES, getDefaultAccessLevels, type Role } from '@/lib/abilities'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership, error: memberErr } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (memberErr || !membership) {
    return NextResponse.json({ invitations: [] })
  }

  const { data, error } = await supabase
    .from('invitations')
    .select('token, email, role, created_at')
    .eq('account_id', membership.account_id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invitations: data ?? [] })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('token', token)
    .is('accepted_at', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

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
  let role: Role
  try {
    const body = await request.json() as { email?: string; role?: string }
    if (typeof body.email !== 'string' || !body.email.includes('@')) {
      throw new Error('invalid email')
    }
    if (!body.role || !(INVITABLE_ROLES as ReadonlyArray<string>).includes(body.role)) {
      throw new Error(`role must be one of: ${INVITABLE_ROLES.join(', ')}`)
    }
    email = body.email
    role  = body.role as Role
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid request body' },
      { status: 400 },
    )
  }

  // ── 3. Resolve caller's account and verify admin role ────────────────────── //
  const { data: membership, error: memberErr } = await supabase
    .from('account_members')
    .select('account_id, role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (memberErr || !membership) {
    return NextResponse.json(
      { error: 'You must be an account admin to invite members.' },
      { status: 403 },
    )
  }

  const accountId   = membership.account_id as string
  const accessLevels = getDefaultAccessLevels(role)

  // ── 4. Insert invitation row ─────────────────────────────────────────────── //
  const { data: invitation, error: invErr } = await supabase
    .from('invitations')
    .insert({
      account_id: accountId,
      invited_by: user.id,
      email,
      role,
      ...accessLevels,
    })
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
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin

  // ── 5a. Try to send an invite email for a brand-new user ────────────────── //
  const newUserRedirectTo =
    `${origin}/auth/callback?invite_token=${inviteToken}`

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: newUserRedirectTo,
    data: { invite_token: inviteToken },
  })

  if (inviteErr) {
    const isAlreadyRegistered =
      inviteErr.code === 'email_exists' ||
      inviteErr.message.toLowerCase().includes('already registered') ||
      inviteErr.message.toLowerCase().includes('already exists')

    if (!isAlreadyRegistered) {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 })
    }

    // ── 5b. User is already registered — send a magic link to the accept page ─ //
    const acceptPath       = `/invite/accept?token=${inviteToken}`
    const magicRedirectTo  = `${origin}/auth/callback?next=${encodeURIComponent(acceptPath)}`

    const { error: otpErr } = await admin.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: magicRedirectTo,
      },
    })

    if (otpErr) {
      return NextResponse.json({ error: otpErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
