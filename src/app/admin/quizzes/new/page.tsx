import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { QuizForm } from '@/components/admin/QuizForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function NewQuizPage() {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">建立新測驗</h1>
              <p className="text-gray-600">為您的班級建立一個新的測驗</p>
            </div>
            <div className="flex space-x-4">
              <Link href="/admin/quizzes">
                <Button variant="outline" className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  返回測驗列表
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
        <QuizForm mode="create" />
      </div>
    </div>
  );
}