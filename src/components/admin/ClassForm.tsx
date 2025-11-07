'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const classSchema = z.object({
  title: z.string().min(1, '請輸入班級名稱'),
  expectedSize: z.string().optional().refine((val) => {
    if (!val || val.trim() === '') return true;
    const num = parseInt(val);
    return !isNaN(num) && num > 0;
  }, '預期人數必須是正整數'),
  targetGroupSize: z.string().optional().refine((val) => {
    if (!val || val.trim() === '') return true;
    const num = parseInt(val);
    return !isNaN(num) && num > 0;
  }, '目標組別大小必須是正整數'),
});

type ClassFormData = z.infer<typeof classSchema>;

interface ClassFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    title: string;
    expectedSize: number | null;
    targetGroupSize: number | null;
  };
}

export function ClassForm({ mode, initialData }: ClassFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClassFormData>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      title: initialData?.title || '',
      expectedSize: initialData?.expectedSize?.toString() || '',
      targetGroupSize: initialData?.targetGroupSize?.toString() || '',
    },
  });

  const onSubmit = async (data: ClassFormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const payload = {
        title: data.title,
        expectedSize: data.expectedSize && data.expectedSize.trim() !== ''
          ? parseInt(data.expectedSize)
          : null,
        targetGroupSize: data.targetGroupSize && data.targetGroupSize.trim() !== ''
          ? parseInt(data.targetGroupSize)
          : null,
      };

      const url = mode === 'create'
        ? '/api/admin/classes'
        : `/api/admin/classes/${initialData?.id}`;

      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '操作失敗');
      }

      toast.success(result.message);
      router.push('/admin/classes');

    } catch (error) {
      console.error(`Error ${mode}ing class:`, error);
      toast.error(error instanceof Error ? error.message : `${mode === 'create' ? '建立' : '更新'}班級失敗`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{mode === 'create' ? '建立新班級' : '編輯班級'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <Label htmlFor="title">班級名稱 *</Label>
            <Input
              id="title"
              {...register('title')}
              placeholder="輸入班級名稱"
              className="mt-1"
            />
            {errors.title && (
              <p className="text-sm text-red-600 mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="expectedSize">預期總人數</Label>
            <Input
              id="expectedSize"
              type="number"
              {...register('expectedSize')}
              placeholder="輸入預期總人數（可選）"
              className="mt-1"
            />
            <p className="text-sm text-gray-500 mt-1">用於參考和統計，可留空</p>
            {errors.expectedSize && (
              <p className="text-sm text-red-600 mt-1">{errors.expectedSize.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="targetGroupSize">理想每組人數</Label>
            <Input
              id="targetGroupSize"
              type="number"
              {...register('targetGroupSize')}
              placeholder="輸入理想每組人數（可選）"
              className="mt-1"
            />
            <p className="text-sm text-gray-500 mt-1">用於自動分組時的參考，可留空</p>
            {errors.targetGroupSize && (
              <p className="text-sm text-red-600 mt-1">{errors.targetGroupSize.message}</p>
            )}
          </div>

          <div className="flex justify-end space-x-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? (mode === 'create' ? '建立中...' : '更新中...')
                : (mode === 'create' ? '建立班級' : '更新班級')
              }
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}