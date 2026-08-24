import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/auth') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionSecret && (await verifySessionToken(token, sessionSecret))) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/auth', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|avatar).*)'],
};
