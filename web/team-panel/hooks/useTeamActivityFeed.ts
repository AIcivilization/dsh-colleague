/**
 * Activity feed hook — pure event-driven, no polling
 *
 * Gets event stream from TeamRuntime's subscribe,
 * computes messages and tasks via event projection.
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
 * Pure event-driven activity feed hook.
 * Gets events from runtime subscribe, projects blackboard and messages.
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

  // Stabilize runtime reference
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  useEffect(() => {
    if (!active) return;

    // Initial snapshot
    try {
      const snapshot = runtimeRef.current.getSnapshot();
      setState(snapshot);
      // Get historical events (most recent 200)
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

    // Subscribe to event stream (replaces 500ms polling)
    const unsubscribe = runtimeRef.current.subscribe((event) => {
      eventsRef.current = [...eventsRef.current, event].slice(-200);
      setEvents([...eventsRef.current]);
      // Refresh state snapshot after each event
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

  // Project blackboard and messages from state
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
