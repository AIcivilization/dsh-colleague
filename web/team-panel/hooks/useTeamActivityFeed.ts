/**
 * 照搬 AionUi useTeamActivityFeed.ts
 * 分页活动流 —— 从后端获取统一的 message + task 流。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MailboxMessage, Task, Blackboard, MemberState } from '../../types';
import type { ActivitySortDirection } from './activityTypes';

export type ActivityFeedDirection = ActivitySortDirection;
export type ActivityFeedKind = 'all' | 'message' | 'task';

export type TeamActivityFeed = {
  messages: MailboxMessage[];
  tasks: Task[];
  members: MemberState[];
  snapshot: Blackboard | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: unknown;
};

/**
 * 从后端 API 获取活动流数据。
 * 后端 /api/team/state 返回 { blackboard, messages } 结构。
 */
export function useTeamActivityFeed(
  teamId: string,
  active: boolean,
  direction: ActivityFeedDirection,
  kind: ActivityFeedKind,
  fetchState: () => Promise<{ blackboard: Blackboard; messages: MailboxMessage[] }>
): TeamActivityFeed {
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<MemberState[]>([]);
  const [snapshot, setSnapshot] = useState<Blackboard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadingRef = useRef(false);
  const epochRef = useRef(0);
  // 用 ref 稳定化 fetchState，避免 useEffect 依赖链无限循环
  const fetchStateRef = useRef(fetchState);
  fetchStateRef.current = fetchState;

  const fetchPage = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const myEpoch = epochRef.current;
    if (reset) setIsLoading(true);
    else setIsLoadingMore(true);
    try {
      const data = await fetchStateRef.current();
      if (myEpoch !== epochRef.current) {
        loadingRef.current = false;
        return;
      }
      // 只在实际变化时才 setState，避免 500ms 轮询触发无限更新警告
      const newMessages = data.messages;
      const newTasks = data.blackboard.tasks;
      const newMembers = Object.values(data.blackboard.member_states);
      setSnapshot(prev => {
        if (prev === data.blackboard) return prev;
        // 浅比较：如果 tasks 长度和 member_states 长度相同，可能没变
        if (prev && prev.tasks.length === newTasks.length && 
            Object.keys(prev.member_states).length === Object.keys(data.blackboard.member_states).length &&
            prev.updated_at === data.blackboard.updated_at) return prev;
        return data.blackboard;
      });
      setMessages(prev => prev.length === newMessages.length ? prev : newMessages);
      setTasks(prev => prev.length === newTasks.length ? prev : newTasks);
      setMembers(prev => prev.length === newMembers.length ? prev : newMembers);
      setHasMore(prev => prev === false ? prev : false);
      setError((prev: unknown) => prev === null ? prev : null);
    } catch (e) {
      if (myEpoch === epochRef.current) setError(e);
    } finally {
      // 始终重置 loadingRef，避免 epoch 不匹配时锁死
      loadingRef.current = false;
      if (myEpoch === epochRef.current) {
        if (reset) setIsLoading(prev => prev ? false : prev);
        else setIsLoadingMore(prev => prev ? false : prev);
      }
    }
  }, []);  // 空依赖 — fetchState 通过 ref 访问

  const resetAndReload = useCallback(() => {
    epochRef.current += 1;
    void fetchPage(true);
  }, [fetchPage]);

  // Reset + first page on activation and whenever team/direction/kind changes.
  useEffect(() => {
    if (!active) return;
    resetAndReload();
    // 轮询刷新（每 500ms）
    const interval = setInterval(() => {
      void fetchPage(false);
    }, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, teamId, direction, kind]);

  const loadMore = useCallback(() => {
    void fetchPage(false);
  }, [fetchPage]);

  return {
    messages,
    tasks,
    members,
    snapshot,
    isLoading: active ? isLoading : false,
    isLoadingMore,
    hasMore,
    loadMore,
    error,
  };
}
