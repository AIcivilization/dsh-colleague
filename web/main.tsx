/**
 * React mount entry — DSH embedded panel
 *
 * Subscribes to the DSH TeamRuntime service event stream. No API polling.
 * Panel registered as a DSH Web embedded component.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// CSS loaded by DSH host, not bundled into JS
import TeamPage from './team-panel';
import { t } from './team-panel/i18n';
import type { TeamState, TeamEvent, InterventionCommand } from '../core/runtime/types';
import { teamStateToBlackboard, eventsToMessages, type MemberState, type Blackboard, type MailboxMessage } from './types';

// ===== DSH panel registration =====

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

// ===== Event stream subscription hook =====

function useTeamEvents(runtime: {
  getSnapshot: () => TeamState;
  subscribe: (listener: (event: TeamEvent) => void) => () => void;
  getEvents?: (since?: number) => TeamEvent[];
}): { state: TeamState; events: TeamEvent[] } {
  const [state, setState] = useState<TeamState>(() => runtime.getSnapshot());
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const eventsRef = useRef<TeamEvent[]>([]);

  useEffect(() => {
    // Initial snapshot
    setState(runtime.getSnapshot());

    // Get historical events
    if (runtime.getEvents) {
      const history = runtime.getEvents();
      eventsRef.current = history.slice(-200);
      setEvents([...eventsRef.current]);
    }

    // Subscribe to event stream
    const unsubscribe = runtime.subscribe((event) => {
      eventsRef.current = [...eventsRef.current, event].slice(-200);
      setEvents([...eventsRef.current]);
      // Refresh state after each event
      setState(runtime.getSnapshot());
    });

    return () => {
      unsubscribe();
    };
  }, [runtime]);

  return { state, events };
}

// ===== App component =====

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

  // Convert to member format expected by UI
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

  // Convert events to message format
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

  // Build fetchState compatible with old hook interface (reads from snapshot internally, no HTTP requests)
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
