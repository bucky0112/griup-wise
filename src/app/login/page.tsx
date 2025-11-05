'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type LoginType = 'admin' | 'student';

export default function LoginPage() {
  const [loginType, setLoginType] = useState<LoginType>('admin');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Admin form state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Student form state
  const [studentName, setStudentName] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [quizId, setQuizId] = useState('');

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail || !adminPassword) {
      toast.error('請填寫所有欄位');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
        }),
      });

      if (response.ok) {
        toast.success('登入成功');
        router.push('/admin');
        router.refresh();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '登入失敗');
      }
    } catch {
      toast.error('登入失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName || !studentNo || !quizId) {
      toast.error('請填寫所有欄位');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: studentName,
          studentNo: studentNo,
          quizId: quizId,
        }),
      });

      if (response.ok) {
        toast.success('登入成功');
        router.push('/quiz');
        router.refresh();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '登入失敗');
      }
    } catch {
      toast.error('登入失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Group-Wise 登入
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            請選擇登入方式
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={loginType === 'admin' ? 'default' : 'ghost'}
              onClick={() => setLoginType('admin')}
              className="px-6"
            >
              管理者登入
            </Button>
            <Button
              variant={loginType === 'student' ? 'default' : 'ghost'}
              onClick={() => setLoginType('student')}
              className="px-6"
            >
              學生登入
            </Button>
          </div>
        </div>

        {loginType === 'admin' ? (
          <Card>
            <CardHeader>
              <CardTitle>管理者登入</CardTitle>
              <CardDescription>
                請使用您的管理者帳號登入
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700 mb-1">
                    電子郵件
                  </label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="請輸入電子郵件"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">
                    密碼
                  </label>
                  <Input
                    id="admin-password"
                    type="password"
                    placeholder="請輸入密碼"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? '登入中...' : '登入'}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>學生登入</CardTitle>
              <CardDescription>
                請輸入您的姓名和學號
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStudentSubmit} className="space-y-4">
                <div>
                  <label htmlFor="student-name" className="block text-sm font-medium text-gray-700 mb-1">
                    姓名
                  </label>
                  <Input
                    id="student-name"
                    placeholder="請輸入您的姓名"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="student-no" className="block text-sm font-medium text-gray-700 mb-1">
                    學號
                  </label>
                  <Input
                    id="student-no"
                    placeholder="請輸入您的學號"
                    value={studentNo}
                    onChange={(e) => setStudentNo(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="quiz-id" className="block text-sm font-medium text-gray-700 mb-1">
                    測驗代碼
                  </label>
                  <Input
                    id="quiz-id"
                    placeholder="請輸入測驗代碼"
                    value={quizId}
                    onChange={(e) => setQuizId(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? '登入中...' : '開始答題'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="mt-4 p-4 bg-gray-100 rounded text-sm">
          <p className="font-medium">測試用帳號：</p>
          <p>管理者：admin@example.com / admin123</p>
          <p>管理者：test@example.com / test123</p>
          <p className="mt-2 font-medium">測試用測驗代碼：</p>
          <p className="font-mono text-xs break-all">8f46c07b-1897-49c3-8404-7fe1e2b2e4f9</p>
          <p className="text-gray-600">測驗名稱：程式設計基礎測驗</p>
        </div>
      </div>
    </div>
  );
}