import { NextResponse } from 'next/server';
import { clearSession, getSession } from '@/lib/session';

export async function POST() {
  try {
    const session = await getSession();

    // Clear the session first
    await clearSession();

    // Determine redirect URL based on session type
    let redirectUrl: string;

    if (!session) {
      // No session found, redirect to home page
      redirectUrl = '/';
    } else if (session.type === 'student') {
      // Student logout - redirect to completion page
      redirectUrl = '/quiz/complete';
    } else if (session.type === 'admin') {
      // Admin logout - redirect to admin login
      redirectUrl = '/login';
    } else {
      // Fallback for unknown session types
      redirectUrl = '/';
    }

    // A relative Location keeps the browser on the origin it used, and 303 makes it follow with GET
    // (the admin pages log out through a form POST; 307 would repeat the POST against the page).
    return new NextResponse(null, { status: 303, headers: { Location: redirectUrl } });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { message: '登出失敗' },
      { status: 500 }
    );
  }
}