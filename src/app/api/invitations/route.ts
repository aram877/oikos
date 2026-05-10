import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient }  from '@supabase/supabase-js'
import { INVITABLE_ROLES, getDefaultAccessLevels, type Role } from '@/lib/abilities'

const InviteBody = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address.'),
  role:  z.enum(INVITABLE_ROLES as readonly [Role, ...Role[]]),
})

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
    console.error('[invitations.GET] db error', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  return NextResponse.json({ invitations: data ?? [] })
}

const TokenSchema = z.string().uuid()

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const tokenRaw = searchParams.get('token')
  const tokenParsed = TokenSchema.safeParse(tokenRaw)
  if (!tokenParsed.success) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Verify the caller is an admin of the account that owns the invitation —
  // RLS would silently drop the delete for non-admins, returning a misleading
  // success.
  const { data: invitation, error: lookupErr } = await supabase
    .from('invitations')
    .select('account_id')
    .eq('token', tokenParsed.data)
    .is('accepted_at', null)
    .single()

  if (lookupErr || !invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  const { data: membership } = await supabase
    .from('account_members')
    .select('role')
    .eq('account_id', invitation.account_id)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('token', tokenParsed.data)

  if (error) {
    console.error('[invitations.DELETE] db error', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
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
  const parsed = InviteBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    )
  }
  const { email, role } = parsed.data

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
    console.error('[invitations.POST] insert error', invErr)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
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
      console.error('[invitations.POST] inviteUserByEmail error', inviteErr)
      return NextResponse.json({ error: 'Failed to send invitation email' }, { status: 500 })
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
      console.error('[invitations.POST] signInWithOtp error', otpErr)
      return NextResponse.json({ error: 'Failed to send invitation email' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
