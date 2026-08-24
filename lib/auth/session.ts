import { SESSION_MAX_AGE_SECONDS } from './constants';

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './constants';

interface SessionPayload {
  version: 1;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('invalid base64url');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('session secret is required');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function issueSessionToken(
  secret: string,
  nowMs = Date.now(),
  nonce = randomNonce(),
): Promise<string> {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('invalid session issue time');
  if (!nonce) throw new Error('session nonce is required');

  const payload: SessionPayload = {
    version: 1,
    issuedAt: nowMs,
    expiresAt: nowMs + SESSION_MAX_AGE_SECONDS * 1_000,
    nonce,
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload)));
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  try {
    if (!token || !secret || !Number.isFinite(nowMs)) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [encodedPayload, encodedSignature] = parts;
    if (!encodedPayload || !encodedSignature) return false;

    const key = await importHmacKey(secret);
    const signature = base64UrlToBytes(encodedSignature);
    const signatureBuffer = new Uint8Array(signature).buffer;
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      encoder.encode(encodedPayload),
    );
    if (!validSignature) return false;

    const payload = JSON.parse(decoder.decode(base64UrlToBytes(encodedPayload))) as Partial<SessionPayload>;
    if (
      payload.version !== 1 ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length === 0
    ) {
      return false;
    }

    const issuedAt = payload.issuedAt as number;
    const expiresAt = payload.expiresAt as number;
    if (expiresAt !== issuedAt + SESSION_MAX_AGE_SECONDS * 1_000) return false;
    return nowMs >= issuedAt && nowMs < expiresAt;
  } catch {
    return false;
  }
}
