'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const quizSchema = z.object({
  title: z.string().min(1, '請輸入測驗標題'),
  classId: z.string().min(1, '請選擇班級'),
  isActive: z.boolean(),
});

type QuizFormData = z.infer<typeof quizSchema>;

interface Class {
  id: string;
  title: string;
}

interface QuizFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    title: string;
    classId: string;
    isActive: boolean;
  };
}

export function QuizForm({ mode, initialData }: QuizFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<QuizFormData>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: initialData?.title || '',
      classId: initialData?.classId || '',
      isActive: initialData?.isActive || false,
    },
  });

  const watchedClassId = watch('classId');

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await fetch('/api/admin/classes');
        const data = await response.json();

        if (response.ok) {
          setClasses(data.classes || []);
        } else {
          toast.error('無法載入班級列表');
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
        toast.error('載入班級列表失敗');
      } finally {
        setIsLoadingClasses(false);
      }
    };

    fetchClasses();
  }, []);

  const onSubmit = async (data: QuizFormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const url = mode === 'create'
        ? '/api/admin/quizzes'
        : `/api/admin/quizzes/${initialData?.id}`;

      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '操作失敗');
      }

      toast.success(result.message);
      router.push('/admin/quizzes');

    } catch (error) {
      console.error(`Error ${mode}ing quiz:`, error);
      toast.error(error instanceof Error ? error.message : `${mode === 'create' ? '建立' : '更新'}測驗失敗`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{mode === 'create' ? '建立新測驗' : '編輯測驗'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <Label htmlFor="title">測驗標題 *</Label>
            <Input
              id="title"
              {...register('title')}
              placeholder="輸入測驗標題"
              className="mt-1"
            />
            {errors.title && (
              <p className="text-sm text-red-600 mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="classId">選擇班級 *</Label>
            <Select
              value={watchedClassId}
              onValueChange={(value) => setValue('classId', value)}
              disabled={isLoadingClasses}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={isLoadingClasses ? "載入中..." : "請選擇班級"} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.classId && (
              <p className="text-sm text-red-600 mt-1">{errors.classId.message}</p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isActive"
              {...register('isActive')}
              defaultChecked={initialData?.isActive || false}
              onCheckedChange={(checked) => setValue('isActive', checked as boolean)}
            />
            <Label htmlFor="isActive">立即啟用測驗</Label>
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
            <Button type="submit" disabled={isSubmitting || isLoadingClasses}>
              {isSubmitting
                ? (mode === 'create' ? '建立中...' : '更新中...')
                : (mode === 'create' ? '建立測驗' : '更新測驗')
              }
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}