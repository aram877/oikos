# Roles & Permissions System

The app has a two-layer permission model: **role ceilings** (what a role can ever do) and **access columns** (fine-tuning per member per feature). Copy `src/lib/abilities.ts` directly into your Angular project — it has zero framework dependencies.

---

## Roles

| Role | Description |
|------|-------------|
| `admin` | Full access — read, write, delete on all features. Cannot be invited; only the account creator is admin |
| `parent` | Read & write on finance, shopping, calendar. Settings and AI default to none but admin can grant |
| `child` | Read & write on shopping and calendar only. Finance is permanently blocked |

Roles that can be assigned via invitation: `parent`, `child` (never `admin`).

---

## Features

| Feature | What it covers |
|---------|---------------|
| `finance` | Transactions, dashboard, import, analyst |
| `shopping` | Shopping list |
| `calendar` | Calendar events |
| `settings` | Categories, backup, account management |
| `ai` | Analyst / auto-categorize |

---

## Actions

| Action | Meaning |
|--------|---------|
| `read` | Can view data |
| `write` | Can create and update data |
| `delete` | Can delete data — **always admin-only**, regardless of access columns |

---

## Role Ceilings

The maximum action set each role can ever have per feature. The access column further restricts within this ceiling.

| Role | Finance | Shopping | Calendar | Settings | AI |
|------|---------|----------|----------|----------|----|
| `admin` | R + W + D | R + W + D | R + W + D | R + W + D | R + W + D |
| `parent` | R + W | R + W | R + W | R + W | R + W |
| `child` | **none** | R + W | R + W | R + W | R + W |

> Child can never access Finance at all — not even with an access column grant.

---

## Access Level Columns

Each member row in `account_members` has five columns:
`finance_access`, `shopping_access`, `calendar_access`, `settings_access`, `ai_access`

Each is `'none' | 'read' | 'write'`.

**Meaning:**
- `none` → blocked (no access at all)
- `read` → can only view data
- `write` → can view and modify data

**Default access levels when an invitation is accepted:**

| Role | finance | shopping | calendar | settings | ai |
|------|---------|----------|----------|----------|----|
| `parent` | write | write | write | none | none |
| `child` | none | write | write | none | none |

Admins always get `write` for everything and bypass column checks entirely.

---

## Authorization Logic

Two functions, both portable to Angular:

### `canRole(role, feature, action)` — ceiling check only
Use for **UI gating** (show/hide elements) when you don't have the DB access column available.

```ts
canRole('child', 'finance', 'read')  // → false  (child can never read finance)
canRole('parent', 'settings', 'write') // → true  (ceiling allows, column might restrict)
```

### `can(role, feature, action, accessLevel?)` — authoritative check
Use for **enforcing permissions** in services and route guards. Include the DB column value.

```ts
can('parent', 'finance', 'read', 'none')  // → false  (access column blocks)
can('parent', 'finance', 'read', 'read')  // → true
can('parent', 'finance', 'delete', 'write') // → false  (only admin can delete)
can('admin',  'finance', 'delete')        // → true   (admin bypasses column check)
```

**Decision tree:**
```
1. Does role ceiling allow?  → No  → return false
2. Is action 'delete'?       → Yes → return role === 'admin'
3. Is role 'admin'?          → Yes → return true  (bypass columns)
4. Is accessLevel provided?
   read  → return accessLevel !== 'none'
   write → return accessLevel === 'write'
```

---

## Angular Service Implementation

```ts
// src/app/core/abilities.service.ts
import { Injectable, signal, computed } from '@angular/core'
import { SupabaseService } from './supabase.service'
import { AccountService } from './account.service'
import { can, canRole } from '../shared/lib/abilities'
import type { Role, Feature, Action, AccessLevel, AccountMemberRow } from '../shared/models'

@Injectable({ providedIn: 'root' })
export class AbilitiesService {
  private member = signal<AccountMemberRow | null>(null)
  readonly loading = signal(true)

  readonly role = computed(() => this.member()?.role ?? null)

  constructor(private supabase: SupabaseService, private account: AccountService) {}

  async load() {
    this.loading.set(true)
    const accountId = await this.account.getAccountId()
    const userId    = (await this.supabase.client.auth.getUser()).data.user?.id
    if (!accountId || !userId) { this.loading.set(false); return }

    const { data } = await this.supabase.client
      .rpc('get_account_members', { p_account_id: accountId })

    const me = (data as AccountMemberRow[])?.find(m => m.user_id === userId) ?? null
    this.member.set(me)
    this.loading.set(false)
  }

  can(feature: Feature, action: Action): boolean {
    const m = this.member()
    if (!m) return false
    const col = `${feature}_access` as keyof AccountMemberRow
    return can(m.role as Role, feature, action, m[col] as AccessLevel)
  }

  canRole(feature: Feature, action: Action): boolean {
    const m = this.member()
    if (!m) return false
    return canRole(m.role as Role, feature, action)
  }

  get isAdmin(): boolean {
    return this.member()?.role === 'admin'
  }
}
```

**Usage in a component:**
```ts
@Component({ ... })
export class TransactionsComponent {
  abilities = inject(AbilitiesService)

  get canAddTransaction() {
    return this.abilities.can('finance', 'write')
  }

  get canDeleteTransaction() {
    return this.abilities.can('finance', 'delete')
  }
}
```

**Usage in template:**
```html
<button *ngIf="abilities.can('finance', 'write')" (click)="addTransaction()">
  + New
</button>
```

---

## `abilities.ts` — Copy Directly

This file has no framework dependency. Place it at `src/app/shared/lib/abilities.ts`:

```ts
export const ROLES    = ['admin', 'parent', 'child'] as const
export type  Role     = typeof ROLES[number]

export const FEATURES = ['finance', 'shopping', 'calendar', 'settings', 'ai'] as const
export type  Feature  = typeof FEATURES[number]

export const ACTIONS  = ['read', 'write', 'delete'] as const
export type  Action   = typeof ACTIONS[number]

export type AccessLevel = 'none' | 'read' | 'write'

export const INVITABLE_ROLES = ['parent', 'child'] as const satisfies ReadonlyArray<Role>

type AbilitySet = ReadonlySet<Action>

const ALL_ACTIONS = new Set<Action>(['read', 'write', 'delete'])
const READ_WRITE  = new Set<Action>(['read', 'write'])
const NO_ACCESS   = new Set<Action>()

const ROLE_CEILINGS: Record<Role, Record<Feature, AbilitySet>> = {
  admin:  { finance: ALL_ACTIONS, shopping: ALL_ACTIONS, calendar: ALL_ACTIONS, settings: ALL_ACTIONS, ai: ALL_ACTIONS },
  parent: { finance: READ_WRITE,  shopping: READ_WRITE,  calendar: READ_WRITE,  settings: READ_WRITE,  ai: READ_WRITE  },
  child:  { finance: NO_ACCESS,   shopping: READ_WRITE,  calendar: READ_WRITE,  settings: READ_WRITE,  ai: READ_WRITE  },
}

export function canRole(role: Role, feature: Feature, action: Action): boolean {
  return ROLE_CEILINGS[role][feature].has(action)
}

export function can(role: Role, feature: Feature, action: Action, accessLevel?: AccessLevel): boolean {
  if (!canRole(role, feature, action)) return false
  if (action === 'delete') return role === 'admin'
  if (role === 'admin') return true
  if (accessLevel === undefined) return true
  if (action === 'read')  return accessLevel !== 'none'
  if (action === 'write') return accessLevel === 'write'
  return false
}

export function getDefaultAccessLevels(role: Role) {
  switch (role) {
    case 'admin':  return { finance_access: 'write', shopping_access: 'write', calendar_access: 'write', settings_access: 'write',  ai_access: 'write'  }
    case 'parent': return { finance_access: 'write', shopping_access: 'write', calendar_access: 'write', settings_access: 'none',   ai_access: 'none'   }
    case 'child':  return { finance_access: 'none',  shopping_access: 'write', calendar_access: 'write', settings_access: 'none',   ai_access: 'none'   }
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin', parent: 'Parent', child: 'Child',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin:  'Full access — read, write, and delete on all features',
  parent: 'Read & write on finance, shopping, and calendar. Settings and AI adjustable by admin.',
  child:  'Read & write on shopping and calendar only.',
}
```
