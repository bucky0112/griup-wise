'use client';

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function StudentLoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const params = useParams();
  const quizId = params.quizId as string;

  // Student form state
  const [studentName, setStudentName] = useState('');
  const [studentNo, setStudentNo] = useState('');

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName || !studentNo) {
      toast.error('請填寫所有欄位');
      return;
    }

    if (!quizId) {
      toast.error('無效的測驗連結');
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
            Group-Wise 學生登入
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            請輸入您的姓名和學號開始答題
          </p>
        </div>

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
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '登入中...' : '開始答題'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}