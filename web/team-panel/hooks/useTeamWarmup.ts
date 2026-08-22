/**
 * Colleague Plugin useTeamWarmup.ts
 * Team warmup state management.
 *
 * Backend sends a ready signal when the team session is fully initialized.
 * runtimeStatus is the per-member real wake-up signal.
 *
 * Pure event-driven: subscribes to the event stream, no 300ms polling.
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
  /** Get member runtime status */
  getMemberRuntimeStatus: (slot_id: string) => TeamWarmupMemberState | undefined;
  /** Optional: subscribe to event stream (event-driven instead of polling) */
  subscribe?: (listener: () => void) => () => void;
};

export function useTeamWarmup({ teamId, assistants, getMemberRuntimeStatus, subscribe }: Props): {
  phase: TeamWarmupPhase;
  runtimeStatus: Map<string, TeamWarmupMemberState>;
  retry: () => void;
} {
  const [phase, setPhase] = useState<TeamWarmupPhase>('warming');
  const [runtimeStatus, setRuntimeStatus] = useState<Map<string, TeamWarmupMemberState>>(new Map());

  // Stabilize dependencies with string key to avoid infinite re-render from assistants array reference changes
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
    // Otherwise stay in warming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantsKey, assistants.length]);

  useEffect(() => {
    // Initial check
    checkWarmup();

    // Timeout: after 30s if still warming, switch to error
    const timeout = setTimeout(() => {
      setPhase((prev) => (prev === 'warming' ? 'error' : prev));
    }, 30000);

    // Event-driven: if subscribe is available, listen to event stream to trigger checks
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
    // Re-trigger check
    setTimeout(checkWarmup, 100);
  }, [checkWarmup]);

  return { phase, runtimeStatus, retry };
}
