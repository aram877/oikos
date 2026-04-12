import { describe, it, expect } from 'vitest'
import { canRole, can, getDefaultAccessLevels } from './abilities'

// ── canRole ──────────────────────────────────────────────────────────────────

describe('canRole', () => {
  describe('admin', () => {
    it('has read on every feature', () => {
      expect(canRole('admin', 'finance',   'read')).toBe(true)
      expect(canRole('admin', 'shopping',  'read')).toBe(true)
      expect(canRole('admin', 'calendar',  'read')).toBe(true)
      expect(canRole('admin', 'settings',  'read')).toBe(true)
      expect(canRole('admin', 'ai',        'read')).toBe(true)
      expect(canRole('admin', 'messaging', 'read')).toBe(true)
    })

    it('has write on every feature', () => {
      expect(canRole('admin', 'finance',   'write')).toBe(true)
      expect(canRole('admin', 'shopping',  'write')).toBe(true)
      expect(canRole('admin', 'calendar',  'write')).toBe(true)
      expect(canRole('admin', 'settings',  'write')).toBe(true)
      expect(canRole('admin', 'ai',        'write')).toBe(true)
      expect(canRole('admin', 'messaging', 'write')).toBe(true)
    })

    it('has delete on every feature', () => {
      expect(canRole('admin', 'finance',   'delete')).toBe(true)
      expect(canRole('admin', 'shopping',  'delete')).toBe(true)
      expect(canRole('admin', 'calendar',  'delete')).toBe(true)
      expect(canRole('admin', 'settings',  'delete')).toBe(true)
      expect(canRole('admin', 'ai',        'delete')).toBe(true)
      expect(canRole('admin', 'messaging', 'delete')).toBe(true)
    })
  })

  describe('parent', () => {
    it('has read/write on all features', () => {
      const features = ['finance', 'shopping', 'calendar', 'settings', 'ai', 'messaging'] as const
      for (const f of features) {
        expect(canRole('parent', f, 'read'),  `parent read  ${f}`).toBe(true)
        expect(canRole('parent', f, 'write'), `parent write ${f}`).toBe(true)
      }
    })

    it('has NO delete on any feature', () => {
      expect(canRole('parent', 'finance',   'delete')).toBe(false)
      expect(canRole('parent', 'shopping',  'delete')).toBe(false)
      expect(canRole('parent', 'calendar',  'delete')).toBe(false)
      expect(canRole('parent', 'settings',  'delete')).toBe(false)
      expect(canRole('parent', 'ai',        'delete')).toBe(false)
      expect(canRole('parent', 'messaging', 'delete')).toBe(false)
    })
  })

  describe('child', () => {
    it('has NO access to finance at all', () => {
      expect(canRole('child', 'finance', 'read')).toBe(false)
      expect(canRole('child', 'finance', 'write')).toBe(false)
      expect(canRole('child', 'finance', 'delete')).toBe(false)
    })

    it('has read/write on shopping and calendar', () => {
      expect(canRole('child', 'shopping', 'read')).toBe(true)
      expect(canRole('child', 'shopping', 'write')).toBe(true)
      expect(canRole('child', 'calendar', 'read')).toBe(true)
      expect(canRole('child', 'calendar', 'write')).toBe(true)
    })

    it('has NO delete on any feature', () => {
      expect(canRole('child', 'shopping',  'delete')).toBe(false)
      expect(canRole('child', 'calendar',  'delete')).toBe(false)
      expect(canRole('child', 'settings',  'delete')).toBe(false)
      expect(canRole('child', 'ai',        'delete')).toBe(false)
      expect(canRole('child', 'messaging', 'delete')).toBe(false)
    })
  })
})

// ── can ───────────────────────────────────────────────────────────────────────

describe('can', () => {
  describe('admin', () => {
    it('ignores access columns — can read finance even with accessLevel none', () => {
      expect(can('admin', 'finance', 'read', 'none')).toBe(true)
    })

    it('ignores access columns — can write finance even with accessLevel none', () => {
      expect(can('admin', 'finance', 'write', 'none')).toBe(true)
    })

    it('can delete', () => {
      expect(can('admin', 'finance',   'delete')).toBe(true)
      expect(can('admin', 'shopping',  'delete')).toBe(true)
      expect(can('admin', 'calendar',  'delete')).toBe(true)
    })
  })

  describe('non-admin with access columns', () => {
    it('accessLevel none → cannot read', () => {
      expect(can('parent', 'finance', 'read', 'none')).toBe(false)
      expect(can('parent', 'shopping', 'read', 'none')).toBe(false)
    })

    it('accessLevel read → can read', () => {
      expect(can('parent', 'finance', 'read', 'read')).toBe(true)
      expect(can('parent', 'shopping', 'read', 'read')).toBe(true)
    })

    it('accessLevel read → cannot write', () => {
      expect(can('parent', 'finance', 'write', 'read')).toBe(false)
      expect(can('parent', 'shopping', 'write', 'read')).toBe(false)
    })

    it('accessLevel write → can read', () => {
      expect(can('parent', 'finance', 'read', 'write')).toBe(true)
      expect(can('parent', 'shopping', 'read', 'write')).toBe(true)
    })

    it('accessLevel write → can write', () => {
      expect(can('parent', 'finance', 'write', 'write')).toBe(true)
      expect(can('parent', 'shopping', 'write', 'write')).toBe(true)
    })
  })

  describe('delete is admin-only', () => {
    it('parent cannot delete regardless of feature', () => {
      expect(can('parent', 'finance',   'delete')).toBe(false)
      expect(can('parent', 'shopping',  'delete')).toBe(false)
      expect(can('parent', 'calendar',  'delete')).toBe(false)
    })

    it('child cannot delete regardless of feature', () => {
      expect(can('child', 'shopping',  'delete')).toBe(false)
      expect(can('child', 'calendar',  'delete')).toBe(false)
      expect(can('child', 'messaging', 'delete')).toBe(false)
    })

    it('only admin can delete', () => {
      expect(can('admin', 'finance', 'delete')).toBe(true)
      expect(can('admin', 'shopping', 'delete')).toBe(true)
    })
  })

  describe('child + finance', () => {
    it('child cannot read finance regardless of accessLevel', () => {
      expect(can('child', 'finance', 'read', 'none')).toBe(false)
      expect(can('child', 'finance', 'read', 'read')).toBe(false)
      expect(can('child', 'finance', 'read', 'write')).toBe(false)
    })

    it('child cannot write finance regardless of accessLevel', () => {
      expect(can('child', 'finance', 'write', 'none')).toBe(false)
      expect(can('child', 'finance', 'write', 'read')).toBe(false)
      expect(can('child', 'finance', 'write', 'write')).toBe(false)
    })

    it('child cannot delete finance', () => {
      expect(can('child', 'finance', 'delete')).toBe(false)
    })
  })

  describe('without accessLevel (ceiling-only check)', () => {
    it('returns true when role ceiling allows and no accessLevel provided', () => {
      expect(can('parent', 'finance', 'read')).toBe(true)
      expect(can('child',  'shopping', 'write')).toBe(true)
    })

    it('returns false when role ceiling blocks', () => {
      expect(can('child',  'finance', 'read')).toBe(false)
      expect(can('parent', 'finance', 'delete')).toBe(false)
    })
  })
})

// ── getDefaultAccessLevels ────────────────────────────────────────────────────

describe('getDefaultAccessLevels', () => {
  it('admin — all features write', () => {
    const d = getDefaultAccessLevels('admin')
    expect(d.finance_access).toBe('write')
    expect(d.shopping_access).toBe('write')
    expect(d.calendar_access).toBe('write')
    expect(d.settings_access).toBe('write')
    expect(d.ai_access).toBe('write')
    expect(d.messaging_access).toBe('write')
  })

  it('parent — finance/shopping/calendar/messaging write; settings/ai none', () => {
    const d = getDefaultAccessLevels('parent')
    expect(d.finance_access).toBe('write')
    expect(d.shopping_access).toBe('write')
    expect(d.calendar_access).toBe('write')
    expect(d.settings_access).toBe('none')
    expect(d.ai_access).toBe('none')
    expect(d.messaging_access).toBe('write')
  })

  it('child — shopping/calendar/messaging write; finance/settings/ai none', () => {
    const d = getDefaultAccessLevels('child')
    expect(d.finance_access).toBe('none')
    expect(d.shopping_access).toBe('write')
    expect(d.calendar_access).toBe('write')
    expect(d.settings_access).toBe('none')
    expect(d.ai_access).toBe('none')
    expect(d.messaging_access).toBe('write')
  })
})
