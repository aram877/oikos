/**
 * abilities.ts — Centralized role & ability system
 *
 * Single source of truth for what each role can do.
 * Used by API routes (server) and React components (client).
 *
 * Roles:
 *   admin  — Full access: read, write, delete on everything
 *   parent — Read/write (no delete) on finance/shopping/calendar.
 *            Settings and AI default to none but admin can grant them.
 *   child  — Read/write (no delete) on shopping/calendar only.
 *            Settings and AI default to none but admin can grant them.
 *
 * The per-feature access columns act as a fine-tuning layer.
 * Admins are exempt from all column checks.
 * Delete is always admin-only regardless of access columns.
 */

import type { AccessLevel } from '@/db/types'

// ── Core vocabulary ──────────────────────────────────────────────────────────

export const ROLES    = ['admin', 'parent', 'child'] as const
export type  Role     = typeof ROLES[number]

export const FEATURES = ['finance', 'shopping', 'calendar', 'settings', 'ai', 'messaging', 'vault', 'wiki'] as const
export type  Feature  = typeof FEATURES[number]

export const ACTIONS  = ['read', 'write', 'delete'] as const
export type  Action   = typeof ACTIONS[number]

// Roles that can be assigned when sending an invitation (admin is never invited)
export const INVITABLE_ROLES = ['parent', 'child'] as const satisfies ReadonlyArray<Role>

// ── Role ceilings ────────────────────────────────────────────────────────────
// Defines the MAXIMUM actions each role may ever perform per feature.
// The access-column check further restricts read/write within this ceiling.
// Admin bypasses all column checks.

type AbilitySet = ReadonlySet<Action>

const ALL_ACTIONS = new Set<Action>(['read', 'write', 'delete'])
const READ_WRITE  = new Set<Action>(['read', 'write'])
const NO_ACCESS   = new Set<Action>()

const ROLE_CEILINGS: Record<Role, Record<Feature, AbilitySet>> = {
  admin: {
    finance:   ALL_ACTIONS,
    shopping:  ALL_ACTIONS,
    calendar:  ALL_ACTIONS,
    settings:  ALL_ACTIONS,
    ai:        ALL_ACTIONS,
    messaging: ALL_ACTIONS,
    vault:     ALL_ACTIONS,
    wiki:      ALL_ACTIONS,
  },
  parent: {
    finance:   READ_WRITE,
    shopping:  READ_WRITE,
    calendar:  READ_WRITE,
    settings:  READ_WRITE,   // default none, but admin can grant
    ai:        READ_WRITE,   // default none, but admin can grant
    messaging: READ_WRITE,
    vault:     READ_WRITE,   // default none, but admin can grant
    wiki:      READ_WRITE,
  },
  child: {
    finance:   NO_ACCESS,    // strict — child never gets finance
    shopping:  READ_WRITE,
    calendar:  READ_WRITE,
    settings:  READ_WRITE,   // default none, but admin can grant
    ai:        READ_WRITE,   // default none, but admin can grant
    messaging: READ_WRITE,
    vault:     READ_WRITE,   // default none, but admin can grant
    wiki:      READ_WRITE,
  },
}

// ── Core ability checks ──────────────────────────────────────────────────────

/**
 * canRole — ceiling-only check.
 * Use for UI gating (show/hide elements) independent of the access column.
 */
export function canRole(role: Role, feature: Feature, action: Action): boolean {
  return ROLE_CEILINGS[role][feature].has(action)
}

/**
 * can — authoritative check including the per-feature access column.
 *
 * @param role        The member's role
 * @param feature     The feature being accessed
 * @param action      The action being attempted
 * @param accessLevel The relevant DB column value (e.g. finance_access).
 *                    Omit when you only want the ceiling check (same as canRole).
 */
export function can(
  role: Role,
  feature: Feature,
  action: Action,
  accessLevel?: AccessLevel,
): boolean {
  // 1. Role ceiling is the hard limit
  if (!canRole(role, feature, action)) return false

  // 2. Delete is purely role-gated — access columns don't apply
  if (action === 'delete') return role === 'admin'

  // 3. Admin bypasses access columns entirely
  if (role === 'admin') return true

  // 4. Apply the fine-tuning column for read / write
  if (accessLevel === undefined) return true
  if (action === 'read')  return accessLevel !== 'none'
  if (action === 'write') return accessLevel === 'write'

  return false
}

// ── Access-level defaults ─────────────────────────────────────────────────────
// Used when inserting an invitation row. Reflects the role's intended starting point.

export function getDefaultAccessLevels(role: Role): {
  finance_access:   AccessLevel
  shopping_access:  AccessLevel
  calendar_access:  AccessLevel
  settings_access:  AccessLevel
  ai_access:        AccessLevel
  messaging_access: AccessLevel
  vault_access:     AccessLevel
  wiki_access:      AccessLevel
} {
  switch (role) {
    case 'admin':
      return {
        finance_access:   'write',
        shopping_access:  'write',
        calendar_access:  'write',
        settings_access:  'write',
        ai_access:        'write',
        messaging_access: 'write',
        vault_access:     'write',
        wiki_access:      'write',
      }
    case 'parent':
      return {
        finance_access:   'write',
        shopping_access:  'write',
        calendar_access:  'write',
        settings_access:  'none',
        ai_access:        'none',
        messaging_access: 'write',
        vault_access:     'read',     // can browse / use, not edit
        wiki_access:      'write',
      }
    case 'child':
      return {
        finance_access:   'none',
        shopping_access:  'write',
        calendar_access:  'write',
        settings_access:  'none',
        ai_access:        'none',
        messaging_access: 'write',
        vault_access:     'none',     // admin grants per-household
        wiki_access:      'write',    // shared knowledge — kids contribute too
      }
  }
}

// ── UI metadata ───────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  admin:  'Admin',
  parent: 'Parent',
  child:  'Child',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin:  'Full access — read, write, and delete on all features',
  parent: 'Read & write on finance, shopping, and calendar (no delete). Settings and AI adjustable by admin.',
  child:  'Read & write on shopping and calendar only. Settings and AI adjustable by admin.',
}
