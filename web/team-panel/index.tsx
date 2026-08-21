/**
 * 团队面板主入口 —— 组装所有组件。
 *
 * 1. Warmup 初始化遮罩
 * 2. 顶部成员栏 (TeamTabs)
 * 3. 视图切换 (TeamViewToggle)
 * 4. 活动看板 (ActivityBoardLayout + ActivityControlBar)
 * 5. 介入控制栏 (InterventionBar)
 *
 * 面板通过 TeamRuntime 的 subscribe 获取事件流，不再轮询。
 * 暂停、恢复、修正、接管、跳过通过 runtime 服务端确认后更新 UI。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeamTabs from './components/TeamTabs';
import TeamViewToggle from './components/ViewToggle';
import TeamWarmupOverlay, { type TeamWarmupPhase, type TeamWarmupMemberState } from './components/TeamWarmupOverlay';
import ActivityBoardLayout from './components/ActivityBoardLayout';
import ActivityControlBar, { type ActivityControlsState } from './components/ActivityControlBar';
import InterventionBar from './components/InterventionBar';
import MessageCard from './components/MessageCard';
import TaskCard from './components/TaskCard';
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
import type { TeamState, TeamEvent, InterventionCommand } from '../../core/runtime/types';
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
  runtime: {
    getSnapshot: () => TeamState;
    subscribe: (listener: (event: TeamEvent) => void) => () => void;
    getEvents?: (since?: number) => TeamEvent[];
    handleIntervention: (command: InterventionCommand) => void;
  };
  fetchState: () => Promise<{ blackboard: Blackboard; messages: MailboxMessage[] }>;
  onPause: () => void;
  onResume: () => void;
  onRevise: (message: string) => void;
  onTakeover: () => void;
  onSkip: (taskId: string) => void;
}

const TeamPage: React.FC<TeamPageProps> = ({
  teamId,
  teamName,
  leaderId,
  members,
  runtime,
  fetchState,
  onPause,
  onResume,
  onRevise,
  onTakeover,
  onSkip,
}) => {
  const [activeSlotId, setActiveSlotId] = useState<string>(leaderId);
  const [paused, setPaused] = useState(false);
  const [skipTargetTaskId, setSkipTargetTaskId] = useState<string | null>(null);

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

  // 直接使用 runtime 而非 fetchState（fetchState 仅作为兼容回退）
  const { messages, tasks, members: feedMembers, snapshot, isLoading } = useTeamActivityFeed(
    teamId,
    true,
    controls.sortDirection,
    feedKind,
    runtime
  );

  // Warmup — dormant 成员视为 idle（ready），不会触发 warmup 错误
  const getMemberRuntimeStatus = useCallback(
    (slot_id: string): TeamWarmupMemberState | undefined => {
      const member = members.find((m) => m.colleague_id === slot_id);
      if (!member) return undefined;
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

  // 暂停/恢复 — 等待服务端确认
  const handlePause = useCallback(() => {
    onPause();
    setPaused(true);
  }, [onPause]);

  const handleResume = useCallback(() => {
    onResume();
    setPaused(false);
  }, [onResume]);

  // 跳过 — 需要选择具体任务
  const handleSkipClick = useCallback(() => {
    // 如果有选中任务则跳过，否则提示用户选择
    if (skipTargetTaskId) {
      onSkip(skipTargetTaskId);
      setSkipTargetTaskId(null);
    } else {
      // 取第一个 running 的任务
      const runningTask = tasks.find((t) => t.status === 'in_progress');
      if (runningTask) {
        onSkip(runningTask.id);
      }
    }
  }, [skipTargetTaskId, tasks, onSkip]);

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
      {/* 顶部标题栏 */}
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
          // 成员重命名通过 runtime 受控操作
          // 暂不支持持久化重命名
        }}
        onRemoveAssistant={(slot_id) => {
          // 成员移除通过 runtime 受控操作
          // 暂不支持运行时移除
        }}
        onAddMember={() => {
          // 添加成员通过 runtime 受控操作
          // 暂不支持运行时添加
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
          // 看板视图：多列并行展示
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
        ) : viewMode === 'parallel' ? (
          // 并行视图：按成员分组，水平排列
          <div className='flex flex-col flex-1 h-full min-w-0'>
            <ActivityControlBar value={controls} onChange={setControls} members={memberOptions} />
            <div className='flex-1 min-h-0 flex gap-8px overflow-auto p-8px'>
              {lanes.map((lane) => (
                <div
                  key={lane.slotId}
                  className='flex flex-col shrink-0 w-288px h-full rounded-8px border border-solid border-[color:var(--border-base)] bg-[color:var(--bg-2)]'
                >
                  <div className='flex items-center gap-6px px-10px py-8px border-b border-solid border-[color:var(--border-base)]'>
                    <span className='inline-block w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: lane.color }} />
                    <span className='truncate text-12px font-medium text-[color:var(--color-text-1)]' title={lane.name}>
                      {lane.name}
                    </span>
                    <span className='ms-auto text-11px text-[color:var(--color-text-3)]'>
                      {filteredItems.filter((i) => i.laneSlotId === lane.slotId).length}
                    </span>
                  </div>
                  <div className='flex-1 overflow-auto flex flex-col gap-8px p-8px'>
                    {filteredItems
                      .filter((i) => i.laneSlotId === lane.slotId)
                      .map((item) => {
                        return item.kind === 'message'
                          ? <MessageCard key={item.id} message={item.message} identity={identity} />
                          : <TaskCard key={item.id} task={item.task} identity={identity} />;
                      })}
                    {filteredItems.filter((i) => i.laneSlotId === lane.slotId).length === 0 && (
                      <div className='text-12px text-[color:var(--color-text-3)] text-center py-12px'>
                        {t('board.noActivity')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // 单聊视图：只显示选中成员的活动
          <div className='flex flex-col flex-1 h-full min-w-0'>
            <ActivityControlBar value={controls} onChange={setControls} members={memberOptions} />
            <div className='flex-1 min-h-0 overflow-auto p-8px'>
              {filteredItems
                .filter((i) => i.laneSlotId === activeSlotId)
                .map((item) => {
                  return item.kind === 'message'
                    ? <MessageCard key={item.id} message={item.message} identity={identity} />
                    : <TaskCard key={item.id} task={item.task} identity={identity} />;
                })}
              {filteredItems.filter((i) => i.laneSlotId === activeSlotId).length === 0 && (
                <div className='text-12px text-[color:var(--color-text-3)] text-center py-24px'>
                  {t('board.noActivity')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 介入控制栏 */}
      <InterventionBar
        onPause={handlePause}
        onResume={handleResume}
        onRevise={onRevise}
        onTakeover={onTakeover}
        onSkip={handleSkipClick}
        paused={paused}
      />
    </div>
  );
};

export default TeamPage;
