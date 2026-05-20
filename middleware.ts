import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'mm_auth';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/auth') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === process.env.SITE_PASSWORD) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/auth', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|avatar).*)'],
};
