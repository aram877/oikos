# Authentication Flow

Supabase Auth handles everything. The app uses email/password and magic links (for invitations). No OAuth/social login.

---

## Session Handling

- Supabase JS client manages session storage (localStorage by default)
- Sessions are JWTs; Supabase SDK auto-refreshes tokens
- In Next.js: middleware validates session server-side on every request
- In **Angular**: use a route guard + `supabase.auth.onAuthStateChange()` listener

---

## 1. Registration

```
/auth/register
  ↓ user submits email + password
supabase.auth.signUp({ email, password, options: { emailRedirectTo: SITE_URL + '/auth/callback' } })
  ↓ Supabase sends confirmation email
  ↓ DB trigger fires: handle_new_user()
     → if no invite_token in user metadata: creates personal account + default categories
     → if invite_token exists: skips account creation (user will join invited household)
  ↓ User clicks email link → /auth/callback?code=...
  ↓ supabase.auth.exchangeCodeForSession(code)
  ↓ if invite_token in user_metadata → rpc('accept_invitation', { p_token })
  ↓ navigate to /transactions
```

**Angular `RegisterComponent`:**
```ts
async register(email: string, password: string) {
  const { error } = await this.supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${environment.siteUrl}/auth/callback`,
    },
  })
  // show "check your email" message on success
}
```

---

## 2. Login

```
/auth/login
  ↓ user submits email + password
supabase.auth.signInWithPassword({ email, password })
  ↓ on success: navigate to /transactions
  ↓ on error: show error message
```

**Angular `LoginComponent`:**
```ts
async login(email: string, password: string) {
  const { error } = await this.supabase.auth.signInWithPassword({ email, password })
  if (!error) this.router.navigate(['/transactions'])
}
```

---

## 3. Auth Callback (email link handler)

This route handles every Supabase redirect: registration confirmation, magic links, and invite accept for existing users.

**Route:** `/auth/callback`
**Query params:** `code`, optionally `next`, optionally `invite_token`

```
User arrives at /auth/callback?code=...
  ↓ supabase.auth.exchangeCodeForSession(code)
  ↓ read invite_token from query params (or from user_metadata after session exchange)
  ↓ if invite_token:
       supabase.rpc('accept_invitation', { p_token: invite_token })
  ↓ navigate to `next` query param, or /transactions by default
  ↓ on error: navigate to /auth/login?error=auth_callback_failed
```

**Angular `AuthCallbackComponent`:**
```ts
@Component({ template: '<p>Loading…</p>' })
export class AuthCallbackComponent implements OnInit {
  constructor(private route: ActivatedRoute, private router: Router, private supabase: SupabaseService) {}

  async ngOnInit() {
    const code        = this.route.snapshot.queryParamMap.get('code') ?? ''
    const next        = this.route.snapshot.queryParamMap.get('next') ?? '/transactions'
    const inviteToken = this.route.snapshot.queryParamMap.get('invite_token')

    try {
      const { data } = await this.supabase.client.auth.exchangeCodeForSession(code)

      // Check metadata for invite_token (set during signUp from invite email)
      const metaToken = data.user?.user_metadata?.['invite_token'] as string | undefined
      const token     = inviteToken ?? metaToken

      if (token) {
        await this.supabase.client.rpc('accept_invitation', { p_token: token })
        // Must hard-navigate to clear any cached account ID
        window.location.href = '/transactions'
        return
      }

      this.router.navigateByUrl(next)
    } catch {
      this.router.navigate(['/auth/login'], { queryParams: { error: 'auth_callback_failed' } })
    }
  }
}
```

---

## 4. Invitation Flow — New User

```
Admin sends invite from /household
  ↓ POST /api/invitations (or Edge Function) with { email, role }
  ↓ inserts invitations row with token UUID
  ↓ Supabase Admin: inviteUserByEmail(email, { redirectTo: SITE_URL + '/auth/callback?invite_token=TOKEN' })
  ↓ Supabase sends invite email with magic link

Invitee clicks email link
  → /auth/callback?invite_token=TOKEN  (+ code from Supabase)
  ↓ exchangeCodeForSession(code)      ← creates account for new user
  ↓ DB trigger: handle_new_user() sees invite_token in metadata → skips personal account creation
  ↓ rpc('accept_invitation', { p_token: TOKEN })
      → removes user from any current account
      → adds user to invited household with specified role + access levels
      → deletes in-app notification
      → marks invitation as accepted
  ↓ hard navigate to /transactions
```

---

## 5. Invitation Flow — Existing User

```
Admin sends invite to email that already has an account
  ↓ POST /api/invitations (or Edge Function)
  ↓ Supabase Admin: generateLink({ type: 'magiclink', email,
      options: { redirectTo: SITE_URL + '/auth/callback?next=/invite/accept?token=TOKEN' } })

Invitee clicks email link
  → /auth/callback?code=...&next=/invite/accept?token=TOKEN
  ↓ exchangeCodeForSession(code)  ← signs in existing user
  ↓ navigate to /invite/accept?token=TOKEN

/invite/accept?token=TOKEN
  ↓ rpc('get_invitation_by_token', { p_token: TOKEN })
      → returns { account_name, invited_by_name, role }
  ↓ user sees: "Join [Household] as [Role] invited by [Name]?"
  ↓ user confirms
  ↓ rpc('accept_invitation', { p_token: TOKEN })
  ↓ window.location.href = '/transactions'  (hard navigate to clear account cache)
```

---

## 6. Sign Out

```ts
await supabase.auth.signOut()
// Clear any cached account ID in AccountService
this.accountService.clearCache()
this.router.navigate(['/auth/login'])
```

---

## 7. Route Guard (Angular equivalent of Next.js middleware)

```ts
// src/app/core/auth.guard.ts
export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService)
  const router   = inject(Router)

  const { data: { user } } = await supabase.client.auth.getUser()
  if (user) return true

  return router.createUrlTree(['/auth/login'])
}
```

```ts
// app.routes.ts
export const routes: Routes = [
  { path: 'auth/login',    component: LoginComponent },
  { path: 'auth/register', component: RegisterComponent },
  { path: 'auth/callback', component: AuthCallbackComponent },
  { path: 'invite/accept', component: InviteAcceptComponent },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '',             redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',    component: DashboardComponent },
      { path: 'transactions', component: TransactionsComponent },
      { path: 'transactions/new', component: TransactionFormComponent },
      { path: 'transactions/:id', component: TransactionFormComponent },
      { path: 'shopping',    component: ShoppingComponent },
      { path: 'calendar',    component: CalendarComponent },
      { path: 'household',   component: HouseholdComponent },
      { path: 'settings',    component: SettingsComponent },
      { path: 'profile',     component: ProfileComponent },
      { path: 'analyst',     component: AnalystComponent },
      { path: 'import',      component: ImportComponent },
    ]
  }
]
```

---

## 8. Session Listener (global)

Set up once in `AppComponent` or `AuthService`:

```ts
ngOnInit() {
  this.supabase.client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      // user signed in — load account, abilities, etc.
      this.accountService.init()
    }
    if (event === 'SIGNED_OUT') {
      this.accountService.clearCache()
      this.router.navigate(['/auth/login'])
    }
  })
}
```
