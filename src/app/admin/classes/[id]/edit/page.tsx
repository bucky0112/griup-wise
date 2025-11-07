import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { classes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { ClassForm } from '@/components/admin/ClassForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

export default async function EditClassPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  const classId = params.id;

  // Get class details
  const classData = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.createdBy, session.id)))
    .limit(1);

  if (classData.length === 0) {
    notFound();
  }

  const classInfo = classData[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">編輯班級</h1>
              <p className="text-gray-600">修改 &quot;{classInfo.title}&quot; 的設定</p>
            </div>
            <div className="flex space-x-4">
              <Link href={`/admin/classes/${classId}`}>
                <Button variant="outline" className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  返回班級詳情
                </Button>
              </Link>
              <form action="/api/auth/logout" method="POST">
                <Button variant="outline" type="submit">
                  登出
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <ClassForm
          mode="edit"
          initialData={{
            id: classInfo.id,
            title: classInfo.title,
            expectedSize: classInfo.expectedSize,
            targetGroupSize: classInfo.targetGroupSize,
          }}
        />
      </div>
    </div>
  );
}