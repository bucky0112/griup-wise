import { NextRequest, NextResponse } from 'next/server';
import { studentLoginSchema, authenticateStudent } from '@/lib/auth';
import { createSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = studentLoginSchema.parse(body);

    const result = await authenticateStudent(
      validatedData.displayName,
      validatedData.studentNo,
      validatedData.quizId
    );

    if (!result.ok) {
      return result.reason === 'name_mismatch'
        ? NextResponse.json(
            { message: '此學號已由其他姓名登入，請確認姓名與學號，或洽詢老師' },
            { status: 409 }
          )
        : NextResponse.json(
            { message: '測驗不存在或未開放，請檢查測驗代碼' },
            { status: 401 }
          );
    }

    await createSession(result.session);

    return NextResponse.json({ message: '登入成功' });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { message: '輸入資料格式錯誤' },
        { status: 400 }
      );
    }

    console.error('Student login error:', error);
    return NextResponse.json(
      { message: '伺服器錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}