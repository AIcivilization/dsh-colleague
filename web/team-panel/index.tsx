/**
 * 照搬 AionUi TeamPage.tsx
 * 团队面板主入口 —— 组装所有组件。
 *
 * 1. Warmup 初始化遮罩
 * 2. 顶部成员栏 (TeamTabs)
 * 3. 视图切换 (TeamViewToggle)
 * 4. 活动看板 (ActivityBoardLayout + ActivityControlBar)
 * 5. 介入控制栏 (InterventionBar) — 差异化
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeamTabs from './components/TeamTabs';
import TeamViewToggle from './components/ViewToggle';
import TeamWarmupOverlay, { type TeamWarmupPhase, type TeamWarmupMemberState } from './components/TeamWarmupOverlay';
import ActivityBoardLayout from './components/ActivityBoardLayout';
import ActivityControlBar, { type ActivityControlsState } from './components/ActivityControlBar';
import InterventionBar from './components/InterventionBar';
import { t } from './i18n';
import { useTeamActivityFeed } from './hooks/useTeamActivityFeed';
import { useTeamActivityControls } from './hooks/useTeamActivityControls';
import { useTeamViewMode } from './hooks/useTeamViewMode';
import { useTeamWarmup } from './hooks/useTeamWarmup';
import { useTeamMemberColors } from './hooks/useTeamMemberColors';
import {
  buildActivityItems,
  ACTIVITY_FALLBACK_LANE,
  isSystemMessageType,
  isTerminalTaskStatus,
  type ActivityItem,
  type ActivityLane,
} from './hooks/activityTypes';
import type { Blackboard, MemberState, MailboxMessage } from '../types';
import type { ActivityIdentityResolver } from './components/MessageCard';

// ===== 类型适配 =====
type TeamAssistant = {
  slot_id: string;
  assistant_name: string;
  assistant_backend: string;
  icon?: string;
  conversation_id?: string;
  role: 'leader' | 'member';
  status: MemberState['status'];
};

interface TeamPageProps {
  teamId: string;
  teamName: string;
  leaderId: string;
  members: MemberState[];
  fetchState: () => Promise<{ blackboard: Blackboard; messages: MailboxMessage[] }>;
  onPause: () => void;
  onResume: () => void;
  onRevise: (message: string) => void;
  onTakeover: () => void;
  onSkip: () => void;
}

const TeamPage: React.FC<TeamPageProps> = ({
  teamId,
  teamName,
  leaderId,
  members,
  fetchState,
  onPause,
  onResume,
  onRevise,
  onTakeover,
  onSkip,
}) => {
  const [activeSlotId, setActiveSlotId] = useState<string>(leaderId);
  const [paused, setPaused] = useState(false);

  // 将 MemberState 转为 TeamAssistant
  const assistants: TeamAssistant[] = useMemo(
    () =>
      members.map((m) => ({
        slot_id: m.colleague_id,
        assistant_name: m.name,
        assistant_backend: m.model_family ?? 'unknown',
        role: m.role,
        status: m.status,
      })),
    [members]
  );

  // 成员身份色
  const { colorOf } = useTeamMemberColors(
    teamId,
    assistants.map((a) => ({ slot_id: a.slot_id, role: a.role }))
  );

  // 视图模式
  const [viewMode, setViewMode] = useTeamViewMode(teamId);

  // 活动流数据 — 用 useMemo 稳定化 slot_ids 防止无限重渲染
  const slotIds = useMemo(() => assistants.map((a) => a.slot_id), [assistants]);
  const [controls, setControls] = useTeamActivityControls(
    teamId,
    slotIds
  );

  const feedKind =
    controls.contentFilter === 'messages' ? 'message' : controls.contentFilter === 'tasks' ? 'task' : 'all';
  const { messages, tasks, members: feedMembers, snapshot, isLoading } = useTeamActivityFeed(
    teamId,
    true,
    controls.sortDirection,
    feedKind,
    fetchState
  );

  // Warmup — dormant 成员视为 idle（ready），不会触发 warmup 错误
  const getMemberRuntimeStatus = useCallback(
    (slot_id: string): TeamWarmupMemberState | undefined => {
      const member = members.find((m) => m.colleague_id === slot_id);
      if (!member) return undefined;
      // dormant、idle、active 都算 ready（成员已注册，只是还没接到任务）
      if (member.status === 'idle' || member.status === 'active' || member.status === 'dormant') return { status: 'ready' };
      if (member.status === 'failed') return { status: 'failed' };
      if (member.status === 'pending') return { status: 'pending' };
      if (member.status === 'completed') return { status: 'ready' };
      return { status: 'ready' };
    },
    [members]
  );

  const { phase: warmupPhase, runtimeStatus: warmupRuntimeStatus, retry: retryWarmup } = useTeamWarmup({
    teamId,
    assistants,
    getMemberRuntimeStatus,
  });

  const isWarmingUp = warmupPhase === 'warming';

  // 活动流构建
  const knownSlots = useMemo(() => new Set(assistants.map((a) => a.slot_id)), [assistants]);

  const identity = useMemo<ActivityIdentityResolver>(() => {
    const nameBySlot = new Map(assistants.map((a) => [a.slot_id, a.assistant_name] as const));
    return {
      nameOf: (slotId) => (slotId ? (nameBySlot.get(slotId) ?? slotId) : ''),
      colorOf: (slotId) => colorOf(slotId),
    };
  }, [assistants, colorOf]);

  const allItems = useMemo(
    () => buildActivityItems(messages, tasks, knownSlots, controls.sortDirection),
    [messages, tasks, knownSlots, controls.sortDirection]
  );

  const filteredItems = useMemo(() => {
    const selected = new Set(controls.selectedMembers);
    return allItems.filter((item: ActivityItem) => {
      if (controls.contentFilter === 'messages' && item.kind !== 'message') return false;
      if (controls.contentFilter === 'tasks' && item.kind !== 'task') return false;
      if (item.kind === 'message' && !controls.showSystemMessages && isSystemMessageType(item.message.type))
        return false;
      if (item.kind === 'task' && !controls.showTerminalTasks && isTerminalTaskStatus(item.task.status)) return false;
      if (selected.size > 0 && !selected.has(item.laneSlotId)) return false;
      return true;
    });
  }, [allItems, controls]);

  const lanes = useMemo<ActivityLane[]>(() => {
    const selected = new Set(controls.selectedMembers);
    const memberLanes: ActivityLane[] = assistants
      .filter((a) => selected.size === 0 || selected.has(a.slot_id))
      .map((a) => ({
        slotId: a.slot_id,
        name: a.assistant_name,
        color: colorOf(a.slot_id),
        isFallback: false,
        backend: a.assistant_backend,
      }));
    const showFallback =
      (selected.size === 0 || selected.has(ACTIVITY_FALLBACK_LANE)) &&
      filteredItems.some((item) => item.laneSlotId === ACTIVITY_FALLBACK_LANE);
    if (showFallback) {
      memberLanes.push({
        slotId: ACTIVITY_FALLBACK_LANE,
        name: t('control.unassigned'),
        color: 'var(--color-text-3)',
        isFallback: true,
      });
    }
    return memberLanes;
  }, [assistants, colorOf, controls.selectedMembers, filteredItems]);

  const memberOptions = useMemo(
    () => assistants.map((a) => ({ slotId: a.slot_id, name: a.assistant_name })),
    [assistants]
  );

  // 暂停/恢复
  const handlePause = useCallback(() => {
    setPaused(true);
    onPause();
  }, [onPause]);

  const handleResume = useCallback(() => {
    setPaused(false);
    onResume();
  }, [onResume]);

  // warmup 失败的成员（必须在所有早期 return 之前调用，遵守 Hooks 规则）
  const warmupFailedSlotIds = useMemo(() => {
    if (warmupPhase !== 'error') return undefined;
    const ids = new Set<string>();
    warmupRuntimeStatus.forEach((state, slot_id) => {
      if (state.status === 'failed') ids.add(slot_id);
    });
    return ids.size > 0 ? ids : undefined;
  }, [warmupPhase, warmupRuntimeStatus]);

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-full' style={{ background: 'var(--bg-base)' }}>
        <div
          className='w-24px h-24px border-2 rounded-full loading'
          style={{ borderColor: 'var(--bg-3)', borderTopColor: 'var(--brand)' }}
        />
      </div>
    );
  }

  return (
    <div className='flex flex-col h-full' style={{ background: 'var(--bg-base)' }}>
      {/* 顶部标题栏 — 照搬 AionUi: h-40px + brand 色渐变图标 */}
      <div
        className='flex items-center justify-between px-12px h-40px shrink-0 border-b border-solid'
        style={{ borderColor: 'var(--border-base)', background: 'var(--bg-1)' }}
      >
        <div className='flex items-center gap-8px'>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand)' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className='text-16px font-700 text-[color:var(--text-primary)]'>{teamName}</span>
        </div>
        {assistants.length > 1 ? <TeamViewToggle value={viewMode} onChange={setViewMode} /> : null}
      </div>

      {/* 顶部成员栏 */}
      <TeamTabs
        assistants={assistants}
        activeSlotId={activeSlotId}
        onSwitchTab={setActiveSlotId}
        onRenameAssistant={(slot_id, new_name) => {
          // 双击重命名 — 前端本地更新（后端暂不支持持久化）
          const idx = members.findIndex((m) => m.colleague_id === slot_id);
          if (idx >= 0) {
            members[idx] = { ...members[idx], name: new_name };
          }
        }}
        onRemoveAssistant={(slot_id) => {
          // 移除成员 — 前端本地移除
          const idx = members.findIndex((m) => m.colleague_id === slot_id);
          if (idx >= 0) members.splice(idx, 1);
        }}
        onAddMember={() => {
          // 添加成员 — 简化：添加一个空壳成员
          const newId = `member-${Date.now().toString(36)}`;
          members.push({
            colleague_id: newId,
            name: '新成员',
            role: 'member',
            status: 'idle',
            last_activity_at: Date.now(),
            slot_id: members.length,
            model_family: 'unknown',
            memory_active: false,
          });
        }}
        colorOf={colorOf}
        warmingUp={isWarmingUp}
        failedSlotIds={warmupFailedSlotIds}
      />

      {/* 主区域 */}
      <div className='relative flex flex-1 min-h-0'>
        {/* Warmup 遮罩 */}
        <TeamWarmupOverlay
          phase={warmupPhase}
          assistants={assistants}
          runtimeStatus={warmupRuntimeStatus}
          colorOf={colorOf}
          onRetry={retryWarmup}
        />

        {viewMode === 'board' ? (
          // 看板视图
          <div className='flex flex-col flex-1 h-full min-w-0'>
            <ActivityControlBar value={controls} onChange={setControls} members={memberOptions} />
            <div className='flex-1 min-h-0'>
              <ActivityBoardLayout
                items={filteredItems}
                lanes={lanes}
                identity={identity}
                hasMore={false}
                isLoadingMore={false}
              />
            </div>
          </div>
        ) : (
          // 并行/单聊视图（当前简化为看板视图的另一种展示）
          <div className='flex flex-col flex-1 h-full min-w-0'>
            <ActivityControlBar value={controls} onChange={setControls} members={memberOptions} />
            <div className='flex-1 min-h-0'>
              <ActivityBoardLayout
                items={filteredItems}
                lanes={lanes}
                identity={identity}
                hasMore={false}
                isLoadingMore={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* 介入控制栏（差异化：放在面板底部） */}
      <InterventionBar
        onPause={handlePause}
        onResume={handleResume}
        onRevise={onRevise}
        onTakeover={onTakeover}
        onSkip={onSkip}
        paused={paused}
      />
    </div>
  );
};

export default TeamPage;
