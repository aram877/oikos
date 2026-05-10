/**
 * Client-side encryption helpers for the household password vault.
 *
 * Algorithms (browser-native, no deps):
 *   • Key derivation: PBKDF2-SHA256 → AES-GCM 256
 *   • Encryption:     AES-GCM 256, random 12-byte IV per blob
 *   • Verifier:       a fixed plaintext encrypted with the derived key.
 *                     On unlock, decryption either succeeds (correct
 *                     passphrase) or fails the AEAD tag (wrong passphrase).
 *
 * Threat model — see docs/features/password-vault.md.  In short: the
 * server never sees plaintext.  Loss of the master passphrase = loss of
 * all encrypted entries (no recovery).
 */

export const KDF_ITERS_DEFAULT = 600_000
/** Reject any server-supplied iteration count below this floor. A malicious
 *  server could otherwise return kdf_iters: 1 to weaken offline brute-force
 *  resistance for any captured DB row. */
export const KDF_ITERS_MIN     = 600_000
/** Minimum master-passphrase length. */
export const VAULT_MIN_PASSPHRASE = 12
const KDF_NAME      = 'PBKDF2'
const HASH          = 'SHA-256'
const KEY_BITS      = 256
const IV_BYTES      = 12
const SALT_BYTES    = 16
/** Fixed plaintext used as the verifier — value is irrelevant, only that it
 *  round-trips through encrypt/decrypt with the correct key. */
const VERIFIER_PLAINTEXT = 'oikos-vault-verifier-v1'

// ── Encoding helpers ──────────────────────────────────────────────────────── //

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

// ── Key derivation ────────────────────────────────────────────────────────── //

async function importPassphrase(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(passphrase)
  return crypto.subtle.importKey('raw', enc, KDF_NAME, false, ['deriveKey'])
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iters: number = KDF_ITERS_DEFAULT,
): Promise<CryptoKey> {
  const baseKey = await importPassphrase(passphrase)
  return crypto.subtle.deriveKey(
    { name: KDF_NAME, salt: salt as BufferSource, iterations: iters, hash: HASH },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  )
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────────── //

export interface EncryptedBlob {
  ciphertext_b64: string
  iv_b64:         string
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_BYTES)
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource),
  )
  return { ciphertext_b64: bytesToBase64(ct), iv_b64: bytesToBase64(iv) }
}

export async function decryptJson<T = unknown>(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<T> {
  const ct = base64ToBytes(blob.ciphertext_b64)
  const iv = base64ToBytes(blob.iv_b64)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

// ── Verifier ──────────────────────────────────────────────────────────────── //

export async function buildVerifier(key: CryptoKey): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_BYTES)
  const plaintext = new TextEncoder().encode(VERIFIER_PLAINTEXT)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource),
  )
  return { ciphertext_b64: bytesToBase64(ct), iv_b64: bytesToBase64(iv) }
}

/**
 * Returns true iff `key` correctly decrypts the verifier blob to the
 * expected plaintext.  AES-GCM authenticates so a wrong key throws; the
 * plaintext check is belt-and-braces against accidental collisions.
 */
export async function verifyKey(key: CryptoKey, verifier: EncryptedBlob): Promise<boolean> {
  try {
    const ct = base64ToBytes(verifier.ciphertext_b64)
    const iv = base64ToBytes(verifier.iv_b64)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource,
    )
    return new TextDecoder().decode(plain) === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

// ── Convenience for the setup flow ────────────────────────────────────────── //

export async function buildSetupBundle(passphrase: string): Promise<{
  key:           CryptoKey
  salt_b64:      string
  verifier_ct:   string
  verifier_iv:   string
}> {
  const salt = randomBytes(SALT_BYTES)
  const key  = await deriveKey(passphrase, salt)
  const v    = await buildVerifier(key)
  return {
    key,
    salt_b64:    bytesToBase64(salt),
    verifier_ct: v.ciphertext_b64,
    verifier_iv: v.iv_b64,
  }
}
