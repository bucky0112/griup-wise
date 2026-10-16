'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface CreateGroupsFormProps {
  quizId: string;
  defaultGroupSize: number;
  hasActiveGrouping: boolean;
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  return value === null || value === '' ? undefined : Number(value);
}

export default function CreateGroupsForm({ quizId, defaultGroupSize, hasActiveGrouping }: CreateGroupsFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const body = {
      target_group_size: Number(formData.get('target_group_size')),
      min_groups: optionalNumber(formData.get('min_groups')),
      max_groups: optionalNumber(formData.get('max_groups')),
      include_unsubmitted: formData.get('include_unsubmitted') === 'on',
      strategy: 'snake_by_score',
    };

    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(`已建立 ${result.groups_created} 組`);
      router.push(`/admin/groups/${quizId}`);
    } catch {
      toast.error('建立分組失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {hasActiveGrouping && (
        <p className="text-sm text-amber-700">建立分組會取代目前的分組</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            每組人數
          </label>
          <input
            type="number"
            name="target_group_size"
            min="1"
            max="20"
            defaultValue={defaultGroupSize}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            最少組數
          </label>
          <input
            type="number"
            name="min_groups"
            min="1"
            defaultValue="1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            最多組數
          </label>
          <input
            type="number"
            name="max_groups"
            min="1"
            defaultValue="20"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="include_unsubmitted"
              className="mr-2"
            />
            <span className="text-sm">包含未交卷者</span>
          </label>
        </div>
      </div>

      <div className="flex space-x-4">
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={submitting}>
          {submitting ? '建立中...' : '建立分組'}
        </Button>
        <Link href={`/admin/groups/${quizId}`}>
          <Button variant="outline">管理現有分組</Button>
        </Link>
      </div>
    </form>
  );
}
