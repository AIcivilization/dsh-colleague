/**
 * 活动流 hook — 纯事件驱动，不再轮询
 *
 * 从 TeamRuntime 的 subscribe 获取事件流，
 * 通过事件投影计算 messages 和 tasks。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MailboxMessage, Task, Blackboard, MemberState } from '../../types';
import type { ActivitySortDirection } from './activityTypes';
import type { TeamState, TeamEvent } from '../../../core/runtime/types';
import { teamStateToBlackboard, eventsToMessages } from '../../types';

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
 * 纯事件驱动的活动流 hook。
 * 从 runtime subscribe 获取事件，投影出 blackboard 和 messages。
 */
export function useTeamActivityFeed(
  teamId: string,
  active: boolean,
  direction: ActivityFeedDirection,
  kind: ActivityFeedKind,
  runtime: {
    getSnapshot: () => TeamState;
    subscribe: (listener: (event: TeamEvent) => void) => () => void;
    getEvents?: (since?: number) => TeamEvent[];
  },
): TeamActivityFeed {
  const [state, setState] = useState<TeamState | null>(null);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const eventsRef = useRef<TeamEvent[]>([]);

  // 稳定化 runtime 引用
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  useEffect(() => {
    if (!active) return;

    // 初始快照
    try {
      const snapshot = runtimeRef.current.getSnapshot();
      setState(snapshot);
      // 获取历史事件（最近 200 条）
      const history = runtimeRef.current.getEvents
        ? runtimeRef.current.getEvents()
        : [];
      eventsRef.current = history.slice(-200);
      setEvents([...eventsRef.current]);
      setIsLoading(false);
      setError(null);
    } catch (e) {
      setError(e);
      setIsLoading(false);
    }

    // 订阅事件流（替代 500ms 轮询）
    const unsubscribe = runtimeRef.current.subscribe((event) => {
      eventsRef.current = [...eventsRef.current, event].slice(-200);
      setEvents([...eventsRef.current]);
      // 每次事件后刷新状态快照
      try {
        setState(runtimeRef.current.getSnapshot());
        setError(null);
      } catch (e) {
        setError(e);
      }
    });

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, teamId]);

  // 从 state 投影 blackboard 和 messages
  const blackboard = useMemo(() => {
    if (!state) return null;
    return teamStateToBlackboard(state);
  }, [state]);

  const messages = useMemo(() => {
    return eventsToMessages(events);
  }, [events]);

  const tasks = useMemo(() => {
    if (!blackboard) return [];
    return blackboard.tasks;
  }, [blackboard]);

  const members = useMemo(() => {
    if (!blackboard) return [];
    return Object.values(blackboard.member_states);
  }, [blackboard]);

  return {
    messages,
    tasks,
    members,
    snapshot: blackboard,
    isLoading: active ? isLoading : false,
    isLoadingMore: false,
    hasMore: false,
    loadMore: () => {},
    error,
  };
}
