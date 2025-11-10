import { NextResponse } from 'next/server';
import { clearSession, getSession } from '@/lib/session';

export async function POST() {
  try {
    const session = await getSession();

    // Clear the session first
    await clearSession();

    // Determine redirect URL based on session type
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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

    return NextResponse.redirect(new URL(redirectUrl, baseUrl));
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { message: '登出失敗' },
      { status: 500 }
    );
  }
}