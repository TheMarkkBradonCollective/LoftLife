/**
 * Portable authentication primitives shared by the Cloudflare Worker and the
 * Node game server.
 *
 * Only Web Platform APIs are used (Web Crypto, TextEncoder), so the same code
 * runs in workerd, Node >= 20 and the browser. That is what lets Cloudflare
 * issue an identity and the Node server trust it without a database round-trip.
 */

const TOKEN_PREFIX = 'llt1';
const PASSWORD_SCHEME = 'pbkdf2';
export const PASSWORD_ITERATIONS = 210_000;
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

/* ------------------------------- encoding -------------------------------- */

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeString(value) {
  return bytesToBase64Url(encoder.encode(value));
}

function decodeString(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/* ------------------------------- passwords ------------------------------- */

async function derivePasswordBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
}

/** `pbkdf2$<iterations>$<salt>$<hash>` — safe to store, portable to workers. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivePasswordBits(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$${bytesToBase64Url(
    salt
  )}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 4 || parts[0] !== PASSWORD_SCHEME) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10_000) return false;
  try {
    const salt = base64UrlToBytes(parts[2]);
    const expected = parts[3];
    const bits = await derivePasswordBits(password, salt, iterations);
    return constantTimeEqual(expected, bytesToBase64Url(new Uint8Array(bits)));
  } catch {
    return false;
  }
}

/* -------------------------------- tokens --------------------------------- */

function assertSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Session secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
}

async function hmacBase64Url(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sign a session token: `llt1.<payload>.<hmac>`.
 * `exp` is in seconds, matching JWT conventions.
 */
export async function signAuthToken(payload, secret) {
  assertSecret(secret);
  const body = encodeString(JSON.stringify(payload));
  const signature = await hmacBase64Url(`${TOKEN_PREFIX}.${body}`, secret);
  return `${TOKEN_PREFIX}.${body}.${signature}`;
}

export async function verifyAuthToken(token, secret, atMs = Date.now()) {
  if (typeof token !== 'string' || typeof secret !== 'string') return null;
  if (secret.length < MIN_SECRET_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const expected = await hmacBase64Url(`${parts[0]}.${parts[1]}`, secret);
  if (!constantTimeEqual(expected, parts[2])) return null;

  let payload;
  try {
    payload = JSON.parse(decodeString(parts[1]));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= atMs) return null;
  return payload;
}

/* ------------------------------ validation ------------------------------- */

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function validateHandle(value) {
  const handle = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return HANDLE_RE.test(handle) ? handle : null;
}

export function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 160) return null;
  return EMAIL_RE.test(email) ? email : null;
}

export function validatePassword(value) {
  if (typeof value !== 'string') return null;
  return value.length >= 10 && value.length <= 200 ? value : null;
}

export function validateDisplayName(value, fallback = 'Resident') {
  const cleaned = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 32) : '';
  return cleaned.length >= 2 ? cleaned : fallback;
}
