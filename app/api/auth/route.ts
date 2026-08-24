import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  issueSessionToken,
} from '@/lib/auth/session';

export const runtime = 'nodejs';

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 });
}

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };
  const sitePassword = process.env.SITE_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!password || !sitePassword || !sessionSecret || password !== sitePassword) {
    return unauthorized();
  }

  const token = await issueSessionToken(sessionSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return res;
}
