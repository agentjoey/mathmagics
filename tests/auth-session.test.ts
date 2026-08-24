import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  issueSessionToken,
  verifySessionToken,
} from '@/lib/auth/session';
import { POST } from '@/app/api/auth/route';
import { proxy } from '@/proxy';

const NOW = Date.parse('2026-08-25T00:00:00.000Z');
const SIGNING_SECRET = 'test-signing-secret-that-is-long-enough';
const HOUSEHOLD_PASSWORD = 'household-password-fixture';
const originalEnv = {
  SITE_PASSWORD: process.env.SITE_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  if (originalEnv.SITE_PASSWORD === undefined) delete process.env.SITE_PASSWORD;
  else process.env.SITE_PASSWORD = originalEnv.SITE_PASSWORD;
  if (originalEnv.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalEnv.SESSION_SECRET;
});

describe('signed household session token', () => {
  it('verifies with the same secret before expiry without exposing secrets', async () => {
    const token = await issueSessionToken(SIGNING_SECRET, NOW, 'fixed-nonce');

    expect(token).not.toContain(SIGNING_SECRET);
    expect(token).not.toContain(HOUSEHOLD_PASSWORD);
    await expect(verifySessionToken(token, SIGNING_SECRET, NOW + 1_000)).resolves.toBe(true);
  });

  it('fails closed for tampered, wrong-secret, malformed, and expired tokens', async () => {
    const token = await issueSessionToken(SIGNING_SECRET, NOW, 'fixed-nonce');
    const [payload, signature] = token.split('.');
    const tampered = `${payload}x.${signature}`;

    await expect(verifySessionToken(tampered, SIGNING_SECRET, NOW)).resolves.toBe(false);
    await expect(verifySessionToken(token, 'different-signing-secret', NOW)).resolves.toBe(false);
    await expect(verifySessionToken('not-a-session-token', SIGNING_SECRET, NOW)).resolves.toBe(false);
    await expect(
      verifySessionToken(token, SIGNING_SECRET, NOW + SESSION_MAX_AGE_SECONDS * 1_000),
    ).resolves.toBe(false);
  });
});

describe('auth route and proxy integration', () => {
  it('sets mm_session without storing the household password', async () => {
    process.env.SITE_PASSWORD = HOUSEHOLD_PASSWORD;
    process.env.SESSION_SECRET = SIGNING_SECRET;

    const response = await POST(
      new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: HOUSEHOLD_PASSWORD }),
      }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).not.toContain(HOUSEHOLD_PASSWORD);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
  });

  it('returns the same generic unauthorized response for bad or unavailable credentials', async () => {
    process.env.SITE_PASSWORD = HOUSEHOLD_PASSWORD;
    process.env.SESSION_SECRET = SIGNING_SECRET;
    const badPassword = await POST(
      new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' }),
      }),
    );
    delete process.env.SESSION_SECRET;
    const missingSecret = await POST(
      new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: HOUSEHOLD_PASSWORD }),
      }),
    );

    expect(badPassword.status).toBe(401);
    expect(missingSecret.status).toBe(401);
    await expect(badPassword.text()).resolves.toBe('Unauthorized');
    await expect(missingSecret.text()).resolves.toBe('Unauthorized');
  });

  it('allows public auth routes, accepts a valid session, and redirects an invalid session', async () => {
    process.env.SESSION_SECRET = SIGNING_SECRET;
    const token = await issueSessionToken(SIGNING_SECRET);

    const publicResponse = await proxy(new NextRequest('http://localhost/auth'));
    expect(publicResponse.status).toBe(200);

    const validResponse = await proxy(
      new NextRequest('http://localhost/', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    );
    expect(validResponse.status).toBe(200);
    expect(validResponse.headers.get('location')).toBeNull();

    const invalidResponse = await proxy(
      new NextRequest('http://localhost/', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=tampered` },
      }),
    );
    expect(invalidResponse.status).toBe(307);
    expect(invalidResponse.headers.get('location')).toBe('http://localhost/auth');
  });
});
