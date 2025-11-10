'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Admin form state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

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


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Group-Wise 管理者登入
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            請使用您的管理者帳號登入
          </p>
        </div>

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
      </div>
    </div>
  );
}
