import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password?: string };
  if (!password || password !== process.env.SITE_PASSWORD) {
    return new NextResponse('Wrong password', { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('mm_auth', password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,  // 1 week
    path: '/',
  });
  return res;
}
