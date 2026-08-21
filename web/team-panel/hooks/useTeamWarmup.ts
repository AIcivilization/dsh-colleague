/**
 * Colleague Plugin useTeamWarmup.ts
 * 团队 warmup 状态管理。
 *
 * 后端在团队会话整体就绪时发 ready 信号。
 * runtimeStatus 是各成员逐个的真实唤醒信号。
 *
 * 纯事件驱动：通过 subscribe 监听事件流，不再使用 300ms 轮询。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TeamWarmupPhase, TeamWarmupMemberState } from '../components/TeamWarmupOverlay';

type TeamAssistant = {
  slot_id: string;
  assistant_name: string;
  assistant_backend: string;
  role: string;
};

type Props = {
  teamId: string;
  assistants: TeamAssistant[];
  /** 获取成员运行时状态 */
  getMemberRuntimeStatus: (slot_id: string) => TeamWarmupMemberState | undefined;
  /** 可选：订阅事件流（事件驱动替代轮询） */
  subscribe?: (listener: () => void) => () => void;
};

export function useTeamWarmup({ teamId, assistants, getMemberRuntimeStatus, subscribe }: Props): {
  phase: TeamWarmupPhase;
  runtimeStatus: Map<string, TeamWarmupMemberState>;
  retry: () => void;
} {
  const [phase, setPhase] = useState<TeamWarmupPhase>('warming');
  const [runtimeStatus, setRuntimeStatus] = useState<Map<string, TeamWarmupMemberState>>(new Map());

  // 用字符串 key 稳定化依赖，避免 assistants 数组引用变化导致无限重渲染
  const assistantsKey = assistants.map((a) => a.slot_id).join(',');
  const getMemberRuntimeStatusRef = useRef(getMemberRuntimeStatus);
  getMemberRuntimeStatusRef.current = getMemberRuntimeStatus;

  const checkWarmup = useCallback(() => {
    const statusMap = new Map<string, TeamWarmupMemberState>();
    let allReady = true;
    let anyFailed = false;

    for (const a of assistants) {
      const status = getMemberRuntimeStatusRef.current(a.slot_id);
      if (status) {
        statusMap.set(a.slot_id, status);
        if (status.status === 'pending') allReady = false;
        if (status.status === 'failed') anyFailed = true;
      } else {
        statusMap.set(a.slot_id, { status: 'pending' });
        allReady = false;
      }
    }

    setRuntimeStatus(statusMap);

    if (anyFailed) {
      setPhase('error');
    } else if (allReady && assistants.length > 0) {
      setPhase('ready');
    }
    // 否则保持 warming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantsKey, assistants.length]);

  useEffect(() => {
    // 初始检查
    checkWarmup();

    // 超时：30 秒后如果还在 warming，切换到 error
    const timeout = setTimeout(() => {
      setPhase((prev) => (prev === 'warming' ? 'error' : prev));
    }, 30000);

    // 事件驱动：如果有 subscribe，监听事件流触发检查
    let unsubscribe: (() => void) | undefined;
    if (subscribe) {
      unsubscribe = subscribe(() => {
        checkWarmup();
      });
    }

    return () => {
      clearTimeout(timeout);
      if (unsubscribe) unsubscribe();
    };
  }, [checkWarmup, subscribe]);

  const retry = useCallback(() => {
    setPhase('warming');
    setRuntimeStatus(new Map());
    // 重新触发检查
    setTimeout(checkWarmup, 100);
  }, [checkWarmup]);

  return { phase, runtimeStatus, retry };
}
