import { NextRequest, NextResponse } from 'next/server';
import { adminLoginSchema, verifyAdmin } from '@/lib/auth';
import { createSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = adminLoginSchema.parse(body);

    const adminSession = await verifyAdmin(validatedData.email, validatedData.password);

    if (!adminSession) {
      return NextResponse.json(
        { message: '電子郵件或密碼錯誤' },
        { status: 401 }
      );
    }

    await createSession(adminSession);

    return NextResponse.json({ message: '登入成功' });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { message: '輸入資料格式錯誤' },
        { status: 400 }
      );
    }

    console.error('Admin login error:', error);
    return NextResponse.json(
      { message: '伺服器錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}