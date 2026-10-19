'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { sortingLabel } from '@/lib/grouping/strategy-label';
import { buildGroupsCsv } from '@/lib/grouping/group-csv';
import { formatGroupingTime } from '@/lib/grouping/grouping-time';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

// Draggable Member Component
interface DraggableMemberProps {
  member: Member;
  isActive: boolean;
  isBatchMode?: boolean;
  isSelected?: boolean;
  isHydrated?: boolean;
  onToggleSelection?: () => void;
  groupId: string; // Add group ID to identify source group
}

function DraggableMember({
  member,
  isActive,
  isBatchMode = false,
  isSelected = false,
  isHydrated = false,
  onToggleSelection,
  groupId
}: DraggableMemberProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: member.participant_id,
    data: {
      type: 'member',
      member,
      sourceGroupId: groupId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getMemberStatusBadge = (member: Member) => {
    if (member.total_score === null) {
      return <Badge variant="destructive">未交卷</Badge>;
    } else if (member.total_score >= 50) {
      return <Badge variant="default">高分</Badge>;
    } else if (member.total_score >= 30) {
      return <Badge variant="secondary">中等</Badge>;
    } else {
      return <Badge variant="outline">待加強</Badge>;
    }
  };

  // Only apply drag attributes and listeners when not in batch mode and hydrated
  // For SSR compatibility, only show batch mode UI after hydration
  const shouldShowBatchMode = isHydrated && isBatchMode;
  const dragProps = shouldShowBatchMode ? {} : (!isHydrated ? {} : { ...attributes, ...listeners });
  const dragStyle = shouldShowBatchMode ? {} : (!isHydrated ? {} : style);

  // Prevent hydration mismatch by rendering consistent content until hydrated
  if (!isHydrated) {
    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg transition-all duration-200 cursor-default">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
            {member.rank_index}
          </div>
          <div>
            <div className="font-medium">{member.display_name}</div>
            <div className="text-sm text-gray-600">{member.student_no}</div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {member.total_score !== null && (
            <div className="text-sm font-medium">{member.total_score}分</div>
          )}
          {getMemberStatusBadge(member)}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...dragProps}
      className={`
        flex items-center justify-between p-3 bg-gray-50 rounded-lg transition-all duration-200
        ${shouldShowBatchMode ?
          `cursor-pointer ${isSelected ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-gray-100'}` :
          `cursor-grab hover:bg-gray-100 ${isDragging ? 'shadow-lg scale-105' : ''} ${isActive ? 'ring-2 ring-blue-500' : ''}`
        }
      `}
      onClick={shouldShowBatchMode ? onToggleSelection : undefined}
    >
      <div className="flex items-center space-x-3">
        {shouldShowBatchMode && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelection}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
          {member.rank_index}
        </div>
        <div>
          <div className="font-medium">{member.display_name}</div>
          <div className="text-sm text-gray-600">{member.student_no}</div>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {member.total_score !== null && (
          <span className="text-sm font-mono">
            {member.total_score.toFixed(1)} 分
          </span>
        )}
        {getMemberStatusBadge(member)}
        {/* Drag handle indicator - only show when not in batch mode */}
        {!shouldShowBatchMode && (
          <div className="text-gray-400 ml-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 5h2v2H9zm0 4h2v2H9zm0 4h2v2H9zm0 4h2v2H9zm4-12h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2z"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

// Droppable Group Container Component
function DroppableGroup({ group, children, isDragging }: { group: Group; children: React.ReactNode; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: group.id,
    data: {
      type: 'group',
      group
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[100px] transition-all duration-200 rounded-lg relative
        ${isDragging ? 'border-2 border-dashed border-gray-300 bg-gray-50' : ''}
        ${isOver ? 'bg-blue-50 border-2 border-blue-400 border-dashed shadow-lg' : ''}
      `}
    >
      {children}
      {isDragging && isOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50 bg-opacity-90 rounded-lg">
          <div className="text-blue-600 font-medium flex items-center space-x-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>放置到 {group.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface Member {
  participant_id: string;
  display_name: string;
  student_no: string;
  total_score: number | null;
  rank_index: number;
}

interface Group {
  id: string;
  name: string;
  order_index: number;
  notes: string;
  members: Member[];
}

interface UngroupedParticipant {
  id: string;
  display_name: string;
  student_no: string;
  reason: 'excluded' | 'unsubmitted';
}

interface RunInfo {
  id: string;
  created_at: string;
  config: {
    target_group_size: number;
    include_unsubmitted: boolean;
    min_groups?: number;
    max_groups?: number;
    sort_by: string;
  };
  strategy: string;
  status: string;
}

interface GroupManagementProps {
  quizId: string;
  quizTitle: string;
  initialShowGroupPublicly: boolean;
  defaultGroupSize: number;
  initialData: {
    run_info: RunInfo | null;
    groups: Group[];
    ungrouped_participants: UngroupedParticipant[];
  };
}

// Network errors and non-JSON responses carry English browser messages, so only server messages reach the toast
const ACTION_FAILED_MESSAGE = '操作失敗，請稍後再試';

interface GroupingConfig {
  target_group_size: number;
  include_unsubmitted: boolean;
  min_groups?: number;
  max_groups?: number;
  reason?: string;
}

export default function GroupManagement({
  quizId,
  quizTitle,
  initialShowGroupPublicly,
  defaultGroupSize,
  initialData,
}: GroupManagementProps) {
  const [data, setData] = useState(initialData);
  const [showGroupPublicly, setShowGroupPublicly] = useState(initialShowGroupPublicly);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAutoGroupDialog, setShowAutoGroupDialog] = useState(false);
  const [autoGroupConfig, setAutoGroupConfig] = useState<GroupingConfig>({
    target_group_size: defaultGroupSize,
    include_unsubmitted: false,
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  // Batch operations state
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [manualParticipant, setManualParticipant] = useState<UngroupedParticipant | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAutoGroup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/groups/auto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...autoGroupConfig,
          reason: '管理者手動觸發自動分組',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '自動分組失敗');
      }

      toast.success(`自動分組完成！建立了 ${result.groupsCreated} 個組別，共 ${result.totalMembers} 位成員`);

      // 重新載入數據
      await refreshData();
      setShowAutoGroupDialog(false);

    } catch (error) {
      console.error('Auto grouping error:', error);
      toast.error(error instanceof Error ? error.message : '自動分組失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAutoGroup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/groups/auto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_group_size: defaultGroupSize,
          include_unsubmitted: false,
          reason: `快速自動分組 (${defaultGroupSize}人一組)`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '自動分組失敗');
      }

      toast.success(`自動分組完成！建立了 ${result.groupsCreated} 個組別，共 ${result.totalMembers} 位成員`);
      await refreshData();

    } catch (error) {
      console.error('Quick auto grouping error:', error);
      toast.error(error instanceof Error ? error.message : '自動分組失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateGroups = async () => {
    if (!data.run_info) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/groups/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_group_size: data.run_info.config.target_group_size,
          include_unsubmitted: data.run_info.config.include_unsubmitted,
          // Don't pass restrictive group constraints to allow optimal grouping
          // min_groups: data.run_info.config.min_groups,
          // max_groups: data.run_info.config.max_groups,
          strategy: 'snake_by_score',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '重新分組失敗');
      }

      toast.success('重新分組完成！');
      await refreshData();

    } catch (error) {
      console.error('Regenerate groups error:', error);
      toast.error(error instanceof Error ? error.message : '重新分組失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleVisibility = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_group_publicly: !showGroupPublicly }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || ACTION_FAILED_MESSAGE);
        return;
      }

      // Show only what the server stored, so the page never claims a visibility that did not save
      const visible: boolean = result.quiz.show_group_publicly;
      setShowGroupPublicly(visible);
      toast.success(visible ? '已公開分組，公開期間自動分組會暫停' : '已取消公開，自動分組將恢復');
    } catch (error) {
      console.error('Toggle group visibility error:', error);
      toast.error(ACTION_FAILED_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGroupDetails = async () => {
    if (!editingGroup) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/groups/${editingGroup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingGroup.name.trim(), notes: editingGroup.notes }),
      });
      const result = await response.json();

      if (response.status === 409) {
        // Same as a stale move: the group was replaced, so show the current groups instead
        toast.error(result.message);
        setEditingGroup(null);
        await refreshData();
        return;
      }

      if (!response.ok) {
        toast.error(result.message || ACTION_FAILED_MESSAGE);
        return;
      }

      const saved: { id: string; name: string; notes: string | null } = result.group;
      setData(prev => ({
        ...prev,
        groups: prev.groups.map(g => (g.id === saved.id ? { ...g, name: saved.name, notes: saved.notes ?? '' } : g)),
      }));
      setEditingGroup(null);
      toast.success('組別已更新');
    } catch (error) {
      console.error('Update group details error:', error);
      toast.error(ACTION_FAILED_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportGroups = () => {
    const csv = buildGroupsCsv(data.groups, data.ungrouped_participants);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${quizTitle}-分組名單.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const refreshData = async () => {
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/groups`, {
        cache: 'no-store',
      });

      if (response.ok) {
        const newData = await response.json();
        setData(newData);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  const calculateGroupStats = (groups: Group[]) => {
    const totalMembers = groups.reduce((sum, group) => sum + group.members.length, 0);
    const avgGroupSize = totalMembers > 0 ? totalMembers / groups.length : 0;

    const groupSizes = groups.map(g => g.members.length);
    const minSize = groupSizes.length > 0 ? Math.min(...groupSizes) : 0;
    const maxSize = groupSizes.length > 0 ? Math.max(...groupSizes) : 0;

    const groupAverages = groups.map(group => {
      const scores = group.members.filter(m => m.total_score !== null).map(m => m.total_score!);
      return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    });

    const avgScore = groupAverages.length > 0 ? groupAverages.reduce((sum, avg) => sum + avg, 0) / groupAverages.length : 0;

    return {
      totalMembers,
      avgGroupSize,
      minSize,
      maxSize,
      sizeVariance: maxSize - minSize,
      avgScore,
    };
  };

  // DnD event handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    // Extract drag data
    const dragData = active.data.current;
    const dropData = over.data.current;

    // Only handle member movements
    if (!dragData || dragData.type !== 'member') return;

    const memberId = active.id as string;
    const member = dragData.member;
    const sourceGroupId = dragData.sourceGroupId;

    // Determine target group ID
    let targetGroupId = over.id as string;

    // If dropped on a group container
    if (dropData && dropData.type === 'group') {
      targetGroupId = dropData.group.id;
    } else {
      // If dropped on another member, find which group it belongs to
      const targetGroup = data.groups.find(g =>
        g.members.some(m => m.participant_id === over.id)
      );
      if (targetGroup) {
        targetGroupId = targetGroup.id;
      }
    }

    // Don't move if it's the same group
    if (sourceGroupId === targetGroupId) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/groups/move-participant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: memberId,
          targetGroupId: targetGroupId,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || '移動失敗');
      }

      // Optimistically update the UI
      setData(prev => ({
        ...prev,
        groups: prev.groups.map(group => {
          if (group.id === sourceGroupId) {
            // Remove from source group
            return {
              ...group,
              members: group.members.filter(m => m.participant_id !== memberId)
            };
          } else if (group.id === targetGroupId) {
            // Add to target group
            return {
              ...group,
              members: [...group.members, member]
            };
          }
          return group;
        })
      }));

      toast.success('成功移動學生');
    } catch (error) {
      console.error('Move participant error:', error);
      toast.error(error instanceof Error ? error.message : '移動失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  // Batch operations handlers
  const toggleBatchMode = () => {
    setIsBatchMode(!isBatchMode);
    setSelectedParticipants(new Set());
  };

  const toggleParticipantSelection = (participantId: string) => {
    const newSelected = new Set(selectedParticipants);
    if (newSelected.has(participantId)) {
      newSelected.delete(participantId);
    } else {
      newSelected.add(participantId);
    }
    setSelectedParticipants(newSelected);
  };

  const selectAllInGroup = (groupMembers: Member[]) => {
    const newSelected = new Set(selectedParticipants);
    groupMembers.forEach(member => {
      newSelected.add(member.participant_id);
    });
    setSelectedParticipants(newSelected);
  };

  const clearSelection = () => {
    setSelectedParticipants(new Set());
  };

  // Shared by batch mode and the "手動分組" dialog for ungrouped participants
  const moveParticipants = async (targetGroupId: string, participantIds: string[]) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/groups/batch-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds, targetGroupId }),
      });
      const result = await response.json();

      if (response.status === 409) {
        // The groups were replaced since this page loaded; show the current ones instead of the stale view
        toast.error(result.message);
        setShowBatchDialog(false);
        setManualParticipant(null);
        clearSelection();
        await refreshData();
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || '移動失敗');
      }

      toast.success(`成功移動 ${result.affectedParticipants} 位學生`);
      await refreshData();
      clearSelection();
      setShowBatchDialog(false);
      setManualParticipant(null);
    } catch (error) {
      console.error('Move participants error:', error);
      toast.error(error instanceof Error ? error.message : '移動失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchMove = async (targetGroupId: string) => {
    if (selectedParticipants.size === 0) {
      toast.error('請選擇要移動的學生');
      return;
    }
    await moveParticipants(targetGroupId, Array.from(selectedParticipants));
  };

  const stats = data.groups.length > 0 ? calculateGroupStats(data.groups) : null;

  // 如果沒有分組，顯示初始創建介面
  if (!data.run_info || data.groups.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <div className="text-gray-500 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">尚未建立分組</h3>
          <p className="text-gray-600 mb-6">
            為此測驗建立分組以開始管理學生分配
          </p>
          <div className="flex justify-center space-x-4">
            <Button onClick={handleQuickAutoGroup} disabled={isLoading}>
              {isLoading ? '分組中...' : '自動分組'}
            </Button>
            <Dialog open={showAutoGroupDialog} onOpenChange={setShowAutoGroupDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={isLoading}>
                  自訂分組設定
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>自動分組設定</DialogTitle>
                  <DialogDescription>
                    設定分組參數，系統將依照分數自動進行蛇形分配
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="target_group_size">每組人數</Label>
                    <Input
                      id="target_group_size"
                      type="number"
                      min="2"
                      max="10"
                      value={autoGroupConfig.target_group_size}
                      onChange={(e) => setAutoGroupConfig(prev => ({
                        ...prev,
                        target_group_size: parseInt(e.target.value) || defaultGroupSize
                      }))}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include_unsubmitted"
                      checked={autoGroupConfig.include_unsubmitted}
                      onCheckedChange={(checked) => setAutoGroupConfig(prev => ({
                        ...prev,
                        include_unsubmitted: checked as boolean
                      }))}
                    />
                    <Label htmlFor="include_unsubmitted">包含未交卷學生</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="min_groups">最少組數 (可選)</Label>
                      <Input
                        id="min_groups"
                        type="number"
                        min="1"
                        value={autoGroupConfig.min_groups || ''}
                        onChange={(e) => setAutoGroupConfig(prev => ({
                          ...prev,
                          min_groups: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="max_groups">最多組數 (可選)</Label>
                      <Input
                        id="max_groups"
                        type="number"
                        min="1"
                        value={autoGroupConfig.max_groups || ''}
                        onChange={(e) => setAutoGroupConfig(prev => ({
                          ...prev,
                          max_groups: e.target.value ? parseInt(e.target.value) : undefined
                        }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <Button variant="outline" onClick={() => setShowAutoGroupDialog(false)}>
                    取消
                  </Button>
                  <Button onClick={handleAutoGroup} disabled={isLoading}>
                    {isLoading ? '分組中...' : '開始分組'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 有分組的情況，顯示分組管理介面
  return (
    <>
      {/* Statistics Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">總組數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.groups.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">總成員</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMembers}</div>
              <p className="text-xs text-gray-500">平均 {stats.avgGroupSize.toFixed(1)} 人/組</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">組別平衡</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.sizeVariance === 0 ? '完美' : `±${stats.sizeVariance}`}
              </div>
              <p className="text-xs text-gray-500">{stats.minSize}-{stats.maxSize} 人</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">平均分數</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgScore.toFixed(1)}</div>
              <p className="text-xs text-gray-500">各組平均</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Group Configuration Info */}
      {data.run_info && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>分組配置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="col-span-2 md:col-span-4">
                <span className="font-medium">分組時間：</span>
                <span>{formatGroupingTime(data.run_info.created_at)}</span>
              </div>
              <div>
                <span className="font-medium">目標人數：</span>
                <span>{data.run_info.config.target_group_size} 人/組</span>
              </div>
              <div>
                <span className="font-medium">排序方式：</span>
                <span>{sortingLabel(data.run_info.strategy)}</span>
              </div>
              <div>
                <span className="font-medium">未交卷者：</span>
                <span>{data.run_info.config.include_unsubmitted ? '包含' : '不包含'}</span>
              </div>
              <div>
                <span className="font-medium">狀態：</span>
                <Badge variant={data.run_info.status === 'active' ? 'default' : 'secondary'}>
                  {data.run_info.status === 'active' ? '活躍' : '已封存'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Operations Toolbar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant={isBatchMode ? "default" : "outline"}
                onClick={toggleBatchMode}
                disabled={isLoading}
              >
                {isBatchMode ? '退出批量模式' : '批量操作'}
              </Button>

              {isHydrated && isBatchMode && (
                <>
                  <div className="text-sm text-gray-600">
                    已選擇 {selectedParticipants.size} 位學生
                  </div>
                  {selectedParticipants.size > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearSelection}
                        disabled={isLoading}
                      >
                        清除選擇
                      </Button>
                      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" disabled={isLoading}>
                            移動至組別
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>批量移動學生</DialogTitle>
                            <DialogDescription>
                              選擇要將 {selectedParticipants.size} 位學生移動到的目標組別
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-3">
                            {data.groups.map((group) => (
                              <Button
                                key={group.id}
                                variant="outline"
                                className="justify-start"
                                onClick={() => handleBatchMove(group.id)}
                                disabled={isLoading}
                              >
                                {group.name} ({group.members.length} 人)
                              </Button>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </>
              )}
            </div>

            {isHydrated && isBatchMode && (
              <div className="text-sm text-gray-500">
                點擊學生卡片選擇，或使用組別的全選功能
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Groups List with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-6">
          {data.groups.map((group) => (
            <Card key={group.id}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg">{group.name}</CardTitle>
                  {group.notes && <p className="text-sm text-gray-500">{group.notes}</p>}
                  <p className="text-sm text-gray-600">
                    {group.members.length} 位成員
                    {group.members.length > 0 && (
                      ` · 平均分數 ${
                        (group.members
                          .filter(m => m.total_score !== null)
                          .reduce((sum, m) => sum + m.total_score!, 0) /
                        group.members.filter(m => m.total_score !== null).length || 0).toFixed(1)
                      }`
                    )}
                  </p>
                </div>
                <div className="flex space-x-2">
                  {isHydrated && isBatchMode && group.members.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAllInGroup(group.members)}
                      disabled={isLoading}
                    >
                      全選此組
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingGroup({ id: group.id, name: group.name, notes: group.notes })}
                    disabled={isLoading}
                  >
                    編輯組別
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DroppableGroup group={group} isDragging={!!activeId}>
                {group.members.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    <div className="mb-2">此組別暫無成員</div>
                    {!!activeId && (
                      <div className="text-sm text-blue-600">拖拉成員到此處</div>
                    )}
                  </div>
                ) : (
                  <SortableContext
                    items={group.members.map(m => m.participant_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid gap-3">
                      {group.members
                        .sort((a, b) => a.rank_index - b.rank_index)
                        .map((member) => (
                          <DraggableMember
                            key={member.participant_id}
                            member={member}
                            groupId={group.id}
                            isActive={activeId === member.participant_id}
                            isBatchMode={isBatchMode}
                            isSelected={selectedParticipants.has(member.participant_id)}
                            isHydrated={isHydrated}
                            onToggleSelection={() => toggleParticipantSelection(member.participant_id)}
                          />
                        ))}
                    </div>
                  </SortableContext>
                )}
              </DroppableGroup>
            </CardContent>
          </Card>
        ))}
        </div>
      </DndContext>

      {/* Ungrouped Participants */}
      {data.ungrouped_participants.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg text-orange-600">
              未分組成員 ({data.ungrouped_participants.length} 位)
            </CardTitle>
            <p className="text-sm text-gray-600">
              以下參與者未被分配到任何組別
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {data.ungrouped_participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200"
                >
                  <div>
                    <div className="font-medium">{participant.display_name}</div>
                    <div className="text-sm text-gray-600">{participant.student_no}</div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge variant={participant.reason === 'unsubmitted' ? 'destructive' : 'secondary'}>
                      {participant.reason === 'unsubmitted' ? '未交卷' : '被排除'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setManualParticipant(participant)}
                      disabled={isLoading || data.groups.length === 0}
                    >
                      手動分組
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Dialog open={manualParticipant !== null} onOpenChange={(open) => !open && setManualParticipant(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>手動分組</DialogTitle>
                  <DialogDescription>
                    選擇要將 {manualParticipant?.display_name} 加入的組別
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                  {data.groups.map((group) => (
                    <Button
                      key={group.id}
                      variant="outline"
                      className="justify-start"
                      onClick={() => manualParticipant && moveParticipants(group.id, [manualParticipant.id])}
                      disabled={isLoading}
                    >
                      {group.name} ({group.members.length} 人)
                    </Button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="mt-8 flex justify-center space-x-4">
        <Button onClick={handleRegenerateGroups} disabled={isLoading}>
          {isLoading ? '分組中...' : '重新分組'}
        </Button>
        <Button
          variant="outline"
          onClick={handleExportGroups}
          disabled={data.groups.length === 0 && data.ungrouped_participants.length === 0}
        >
          匯出分組名單
        </Button>
        <Button variant="outline" onClick={handleToggleVisibility} disabled={isLoading}>
          {showGroupPublicly ? '取消公開' : '公開分組'}
        </Button>
        {showGroupPublicly && (
          <Badge variant="secondary" className="self-center">學生可見</Badge>
        )}
      </div>

      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>編輯組別</DialogTitle>
            <DialogDescription>儲存後，之後的自動分組不會再覆蓋這次的分組。</DialogDescription>
          </DialogHeader>
          {editingGroup && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="group-name">組名</Label>
                <Input
                  id="group-name"
                  value={editingGroup.name}
                  maxLength={100}
                  onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="group-notes">備註</Label>
                <Textarea
                  id="group-notes"
                  value={editingGroup.notes}
                  maxLength={500}
                  onChange={(e) => setEditingGroup({ ...editingGroup, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditingGroup(null)} disabled={isLoading}>
                  取消
                </Button>
                <Button onClick={handleSaveGroupDetails} disabled={isLoading || !editingGroup.name.trim()}>
                  {isLoading ? '儲存中...' : '儲存'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}