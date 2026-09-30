// PBKDF2-SHA256 via WebCrypto + HMAC pepper (spec 8.1). No native bcrypt/argon2.
import { bytesToB64Url, b64UrlToBytes } from './base64'

const ALG = 'PBKDF2'
const HASH = 'SHA-256'
const KEY_LEN_BITS = 256
export const PASSWORD_ALGO = 'pbkdf2_sha256'

async function hmacPeppered(password: string, pepper: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pepper),
    { name: 'HMAC', hash: HASH },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password)))
}

async function pbkdf2(secret: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', secret as unknown as ArrayBuffer, 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: ALG, salt: salt as unknown as ArrayBuffer, iterations, hash: HASH },
    baseKey,
    KEY_LEN_BITS,
  )
  return new Uint8Array(bits)
}

/** Format: pbkdf2_sha256$<iter>$<saltB64url>$<hashB64url> */
export async function hashPassword(password: string, pepper: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const secret = await hmacPeppered(password, pepper)
  const derived = await pbkdf2(secret, salt, iterations)
  return `${PASSWORD_ALGO}$${iterations}$${bytesToB64Url(salt)}$${bytesToB64Url(derived)}`
}

export interface ParsedHash {
  iterations: number
  salt: Uint8Array
  hash: Uint8Array
}

function parseStored(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== PASSWORD_ALGO) return null
  const iterations = Number.parseInt(parts[1] ?? '', 10)
  if (!Number.isFinite(iterations) || iterations <= 0) return null
  const salt = b64UrlToBytes(parts[2] ?? '')
  const hash = b64UrlToBytes(parts[3] ?? '')
  return { iterations, salt, hash }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/** Verify a candidate password against the stored hash. */
export async function verifyPassword(password: string, stored: string, pepper: string): Promise<boolean> {
  const parsed = parseStored(stored)
  if (!parsed) return false
  const secret = await hmacPeppered(password, pepper)
  const derived = await pbkdf2(secret, parsed.salt, parsed.iterations)
  return constantTimeEqual(derived, parsed.hash)
}

/** Dummy hash used when the email is not found, to keep response timing uniform (spec 8.1). */
export async function burnPasswordHash(password: string, pepper: string, iterations: number): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const secret = await hmacPeppered(password, pepper)
  await pbkdf2(secret, salt, iterations)
}
