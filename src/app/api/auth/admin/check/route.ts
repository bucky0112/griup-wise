import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();

    if (!session || session.type !== 'admin') {
      return NextResponse.json(
        { message: '未授權，請重新登入' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      message: '已授權',
      session,
    });

  } catch (error) {
    console.error('Error checking admin session:', error);
    return NextResponse.json(
      { message: '檢查權限失敗' },
      { status: 500 }
    );
  }
}