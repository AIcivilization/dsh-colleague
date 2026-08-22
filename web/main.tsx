/**
 * React 挂载入口 — DSH 嵌入面板
 *
 * 从 DSH TeamRuntime 服务订阅事件流，不再使用 API 轮询。
 * 面板注册为 DSH Web 嵌入组件。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// CSS 由 DSH 宿主加载，不打包到 JS 中
import TeamPage from './team-panel';
import { t } from './team-panel/i18n';
import type { TeamState, TeamEvent, InterventionCommand } from '../core/runtime/types';
import { teamStateToBlackboard, eventsToMessages, type MemberState, type Blackboard, type MailboxMessage } from './types';

// ===== DSH 面板注册 =====

export function registerPanel(mount: HTMLElement, runtime: {
  getSnapshot: () => TeamState;
  subscribe: (listener: (event: TeamEvent) => void) => () => void;
  getEvents?: (since?: number) => TeamEvent[];
  handleIntervention: (command: InterventionCommand) => void;
}) {
  const root = createRoot(mount);
  root.render(
    <React.StrictMode>
      <App runtime={runtime} />
    </React.StrictMode>,
  );
  return () => root.unmount();
}

// ===== 事件流订阅 hook =====

function useTeamEvents(runtime: {
  getSnapshot: () => TeamState;
  subscribe: (listener: (event: TeamEvent) => void) => () => void;
  getEvents?: (since?: number) => TeamEvent[];
}): { state: TeamState; events: TeamEvent[] } {
  const [state, setState] = useState<TeamState>(() => runtime.getSnapshot());
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const eventsRef = useRef<TeamEvent[]>([]);

  useEffect(() => {
    // 初始快照
    setState(runtime.getSnapshot());

    // 获取历史事件
    if (runtime.getEvents) {
      const history = runtime.getEvents();
      eventsRef.current = history.slice(-200);
      setEvents([...eventsRef.current]);
    }

    // 订阅事件流
    const unsubscribe = runtime.subscribe((event) => {
      eventsRef.current = [...eventsRef.current, event].slice(-200);
      setEvents([...eventsRef.current]);
      // 每次事件后刷新状态
      setState(runtime.getSnapshot());
    });

    return () => {
      unsubscribe();
    };
  }, [runtime]);

  return { state, events };
}

// ===== App 组件 =====

function App({ runtime }: {
  runtime: {
    getSnapshot: () => TeamState;
    subscribe: (listener: (event: TeamEvent) => void) => () => void;
    getEvents?: (since?: number) => TeamEvent[];
    handleIntervention: (command: InterventionCommand) => void;
  };
}) {
  const { state, events } = useTeamEvents(runtime);

  const handlePause = useCallback(() => {
    runtime.handleIntervention({ type: 'pause' });
  }, [runtime]);

  const handleResume = useCallback(() => {
    runtime.handleIntervention({ type: 'resume' });
  }, [runtime]);

  const handleRevise = useCallback((message: string) => {
    runtime.handleIntervention({ type: 'revise', message });
  }, [runtime]);

  const handleTakeover = useCallback(() => {
    runtime.handleIntervention({ type: 'takeover' });
  }, [runtime]);

  const handleSkip = useCallback((taskId: string) => {
    if (!taskId) return;
    runtime.handleIntervention({ type: 'skip', taskId });
  }, [runtime]);

  // 转换为 UI 需要的成员格式
  const members: MemberState[] = state.members.map((m) => ({
    colleague_id: m.id,
    name: m.name,
    role: (m.role === 'leader' ? 'leader' : 'member') as 'leader' | 'member',
    status: (state.tasks.some((t) => t.assigneeId === m.id && t.status === 'running')
      ? 'active'
      : 'idle') as MemberState['status'],
    last_activity_at: state.updatedAt,
    slot_id: m.slotId,
    model_family: m.model,
    memory_active: false,
  }));

  const leaderId = members.find((m) => m.role === 'leader')?.colleague_id || members[0]?.colleague_id || 'leader';

  // 转换事件为消息格式
  const messages: MailboxMessage[] = events.map((e) => ({
    id: e.id,
    from: e.memberId || 'system',
    to: 'all',
    type: 'broadcast' as MailboxMessage['type'],
    content: (e.data.summary as string) || (e.data.reason as string) || e.type,
    task_id: e.taskId,
    broadcast: true,
    created_at: e.timestamp,
  }));

  // 构建 fetchState 兼容旧 hook 接口（内部从快照读取，不再发 HTTP 请求）
  const fetchState = useCallback(async () => {
    const blackboard = teamStateToBlackboard(state);
    return {
      blackboard,
      messages,
    };
  }, [state, messages]);

  return (
    <div className='h-screen w-screen overflow-hidden'>
      <TeamPage
        teamId={state.id}
        teamName={state.name}
        leaderId={leaderId}
        members={members}
        runtime={runtime}
        fetchState={fetchState}
        onPause={handlePause}
        onResume={handleResume}
        onRevise={handleRevise}
        onTakeover={handleTakeover}
        onSkip={handleSkip}
      />
    </div>
  );
}

export default App;
