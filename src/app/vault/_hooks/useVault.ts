'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type {
  PasswordVaultMetaRow,
  PasswordEntryRow,
  PasswordEntrySecret,
} from '@/db/types'
import {
  base64ToBytes,
  buildSetupBundle,
  decryptJson,
  deriveKey,
  encryptJson,
  verifyKey,
  KDF_ITERS_DEFAULT,
} from '@/lib/vaultCrypto'

export type VaultStatus =
  | 'loading'        // initial load
  | 'not-set-up'     // no vault row yet (admin should set up)
  | 'locked'         // vault exists but the user hasn't entered the passphrase
  | 'unlocked'
  | 'error'

interface UseVaultResult {
  status:        VaultStatus
  meta:          PasswordVaultMetaRow | null
  entries:       PasswordEntryRow[]
  error:         string | null
  loadError:     string | null
  /** Create the vault.  Admin only.  Throws on RLS rejection. */
  setup:         (passphrase: string) => Promise<void>
  /** Verify the passphrase, derive the key, and load entries. */
  unlock:        (passphrase: string) => Promise<boolean>
  /** Drop the in-memory key + entries (back to 'locked'). */
  lock:          () => void
  /** Decrypt one entry's secret blob. */
  decryptEntry:  (entry: PasswordEntryRow) => Promise<PasswordEntrySecret>
  /** Add a new entry — encrypts the secret client-side then inserts. */
  addEntry:      (input: { name: string; url: string | null; secret: PasswordEntrySecret }) => Promise<void>
  /** Update an existing entry (re-encrypts the secret). */
  saveEntry:     (id: string, input: { name?: string; url?: string | null; secret?: PasswordEntrySecret }) => Promise<void>
  removeEntry:   (id: string) => Promise<void>
  /** Wipe the vault entirely (admin only).  Irreversible. */
  resetVault:    () => Promise<void>
}

const EMPTY_SECRET: PasswordEntrySecret = {
  username: '', password: '', notes: '', totp_secret: null,
}

export function useVault(): UseVaultResult {
  const [status,    setStatus]    = useState<VaultStatus>('loading')
  const [meta,      setMeta]      = useState<PasswordVaultMetaRow | null>(null)
  const [entries,   setEntries]   = useState<PasswordEntryRow[]>([])
  const [error,     setError]     = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // The derived AES-GCM key lives ONLY in memory while the page is open.
  // Reload, navigate away → re-enter passphrase.
  const keyRef = useRef<CryptoKey | null>(null)

  // ── Initial meta fetch ──────────────────────────────────────────────────── //

  const loadMeta = useCallback(async () => {
    try {
      const m = await dbClient.vault.getMeta()
      setMeta(m)
      setStatus(m === null ? 'not-set-up' : 'locked')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await loadMeta() })()
    return () => { cancelled = true }
  }, [loadMeta])

  // ── Setup ───────────────────────────────────────────────────────────────── //

  const setup = useCallback(async (passphrase: string) => {
    if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters.')
    const bundle = await buildSetupBundle(passphrase)
    const created = await dbClient.vault.setup({
      kdf:         'PBKDF2-SHA256',
      kdf_iters:   KDF_ITERS_DEFAULT,
      salt_b64:    bundle.salt_b64,
      verifier_ct: bundle.verifier_ct,
      verifier_iv: bundle.verifier_iv,
    })
    keyRef.current = bundle.key
    setMeta(created)
    setEntries([])
    setStatus('unlocked')
  }, [])

  // ── Unlock ──────────────────────────────────────────────────────────────── //

  const unlock = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!meta) return false
    setError(null)
    try {
      const salt = base64ToBytes(meta.salt_b64)
      const key  = await deriveKey(passphrase, salt, meta.kdf_iters)
      const ok   = await verifyKey(key, { ciphertext_b64: meta.verifier_ct, iv_b64: meta.verifier_iv })
      if (!ok) {
        setError('Wrong passphrase.')
        return false
      }
      keyRef.current = key
      const rows = await dbClient.vault.listEntries()
      setEntries(rows)
      setStatus('unlocked')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [meta])

  const lock = useCallback(() => {
    keyRef.current = null
    setEntries([])
    setStatus(meta ? 'locked' : 'not-set-up')
  }, [meta])

  // ── Decrypt one entry ───────────────────────────────────────────────────── //

  const decryptEntry = useCallback(async (entry: PasswordEntryRow): Promise<PasswordEntrySecret> => {
    const key = keyRef.current
    if (!key) throw new Error('Vault is locked.')
    try {
      const secret = await decryptJson<Partial<PasswordEntrySecret>>(key, {
        ciphertext_b64: entry.ciphertext,
        iv_b64:         entry.iv,
      })
      return {
        username:    typeof secret.username    === 'string' ? secret.username    : '',
        password:    typeof secret.password    === 'string' ? secret.password    : '',
        notes:       typeof secret.notes       === 'string' ? secret.notes       : '',
        totp_secret: typeof secret.totp_secret === 'string' ? secret.totp_secret : null,
      }
    } catch {
      // AEAD failure → corrupt blob or wrong key (key was good for the
      // verifier, so corrupt blob is the realistic case).
      return { ...EMPTY_SECRET }
    }
  }, [])

  // ── Mutations ───────────────────────────────────────────────────────────── //

  const addEntry = useCallback(async ({
    name, url, secret,
  }: { name: string; url: string | null; secret: PasswordEntrySecret }) => {
    const key = keyRef.current
    if (!key) throw new Error('Vault is locked.')
    const blob = await encryptJson(key, secret)
    const created = await dbClient.vault.insertEntry({
      name:       name.trim(),
      url:        url?.trim() || null,
      ciphertext: blob.ciphertext_b64,
      iv:         blob.iv_b64,
    })
    setEntries((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const saveEntry = useCallback(async (
    id: string,
    input: { name?: string; url?: string | null; secret?: PasswordEntrySecret },
  ) => {
    const key = keyRef.current
    if (!key) throw new Error('Vault is locked.')
    const patch: { name?: string; url?: string | null; ciphertext?: string; iv?: string } = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.url  !== undefined) patch.url  = input.url ? input.url.trim() : null
    if (input.secret !== undefined) {
      const blob = await encryptJson(key, input.secret)
      patch.ciphertext = blob.ciphertext_b64
      patch.iv         = blob.iv_b64
    }
    const updated = await dbClient.vault.updateEntry(id, patch)
    if (updated) {
      setEntries((prev) =>
        prev.map((e) => e.id === id ? updated : e)
            .sort((a, b) => a.name.localeCompare(b.name)),
      )
    }
  }, [])

  const removeEntry = useCallback(async (id: string) => {
    const snapshot = entries
    setEntries((prev) => prev.filter((e) => e.id !== id))
    try {
      await dbClient.vault.deleteEntry(id)
    } catch (err) {
      setEntries(snapshot)
      throw err
    }
  }, [entries])

  const resetVault = useCallback(async () => {
    await dbClient.vault.reset()
    keyRef.current = null
    setMeta(null)
    setEntries([])
    setStatus('not-set-up')
  }, [])

  return {
    status, meta, entries, error, loadError,
    setup, unlock, lock,
    decryptEntry, addEntry, saveEntry, removeEntry,
    resetVault,
  }
}
