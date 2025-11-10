import { NextResponse } from 'next/server';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '@/lib/db';
import { seedAdmins } from '../../../../scripts/seed-admins';

export async function POST() {
  try {
    // Check if this is already initialized by checking if any admin exists
    const { admins } = await import('@/lib/db/schema');
    const existingAdmins = await db.select().from(admins).limit(1);

    if (existingAdmins.length > 0) {
      return NextResponse.json({
        message: '資料庫已初始化，無法重複執行',
        success: false
      }, { status: 400 });
    }

    // Run migrations
    console.log('執行資料庫遷移...');
    await migrate(db, {
      migrationsFolder: './src/lib/db/migrations'
    });

    // Seed admins
    console.log('創建管理員帳號...');
    await seedAdmins();

    return NextResponse.json({
      message: '資料庫初始化完成！預設管理員帳號：admin@example.com / admin123',
      success: true
    });

  } catch (error) {
    console.error('初始化錯誤:', error);
    return NextResponse.json({
      message: '初始化失敗',
      error: error instanceof Error ? error.message : '未知錯誤',
      success: false
    }, { status: 500 });
  }
}