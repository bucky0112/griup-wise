'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface DeleteClassButtonProps {
  classId: string;
  className: string;
}

export function DeleteClassButton({ classId, className }: DeleteClassButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm(`確定要刪除班級「${className}」嗎？此操作無法復原。`)) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/classes/${classId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(result.message);
        router.refresh(); // Refresh the page to update the list
      } else {
        toast.error(result.message || '刪除失敗');
      }
    } catch (error) {
      console.error('Error deleting class:', error);
      toast.error('刪除失敗');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? '刪除中...' : '刪除'}
    </Button>
  );
}