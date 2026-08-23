/**
 * UI adapter types — adapts new runtime types to the format expected by UI components
 *
 * Existing UI components use old Blackboard/MemberState/Task/MailboxMessage types.
 * This provides a structurally compatible adapter layer to avoid major UI refactoring.
 */

import type {
  TeamState,
  MemberConfig,
  TeamEvent,
  TaskStatus,
} from '../core/runtime/types';

// ===== Compatibility types =====

export interface MemberState {
  colleague_id: string;
  name: string;
  role: 'leader' | 'member';
  status: 'pending' | 'idle' | 'active' | 'completed' | 'failed' | 'dormant';
  current_task_id?: string;
  last_activity_at: number;
  slot_id: number;
  model_family?: string;
  memory_active?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  dependencies?: string[];
  result?: {
    status: 'completed' | 'failed' | 'blocked';
    summary: string;
    artifacts?: string[];
    issues?: Array<{
      severity: 'critical' | 'warning' | 'suggestion';
      file?: string;
      line?: number;
      description: string;
      suggestion?: string;
    }>;
    notes?: string;
  };
  created_at: number;
  updated_at: number;
  slot_id?: number;
}

export interface Blackboard {
  team_id: string;
  team_name: string;
  tasks: Task[];
  artifacts: Array<{
    id: string;
    task_id: string;
    author: string;
    type: 'code' | 'review' | 'test' | 'doc';
    content: string;
    created_at: number;
  }>;
  member_states: Record<string, MemberState>;
  context_handoffs: Array<{
    id: string;
    from: string;
    to: string;
    task_id: string;
    message: string;
    attachments?: string[];
    created_at: number;
  }>;
  created_at: number;
  updated_at: number;
}

export interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  type: 'task_assign' | 'task_complete' | 'task_fail' | 'review_feedback' | 'test_result' | 'user_intervention' | 'broadcast' | 'query' | 'response';
  content: string;
  task_id?: string;
  attachments?: string[];
  broadcast?: boolean;
  created_at: number;
}

// ===== Conversion functions =====

export function teamStateToBlackboard(state: TeamState): Blackboard {
  const members: MemberState[] = state.members.map((m) => {
    const hasRunningTask = state.tasks.some(
      (t) => t.assigneeId === m.id && t.status === 'running',
    );
    return {
      colleague_id: m.id,
      name: m.name,
      role: m.role === 'leader' ? 'leader' : 'member',
      status: hasRunningTask ? 'active' : 'idle',
      last_activity_at: state.updatedAt,
      slot_id: m.slotId,
      model_family: m.model,
      memory_active: false,
    };
  });

  const tasks: Task[] = state.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    assignee: t.assigneeId,
    status: mapTaskStatus(t.status),
    dependencies: t.dependencies,
    result: t.result ? {
      status: t.result.status,
      summary: t.result.summary,
      artifacts: t.result.artifacts,
      issues: t.result.issues,
    } : undefined,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    slot_id: state.members.find((m) => m.id === t.assigneeId)?.slotId,
  }));

  return {
    team_id: state.id,
    team_name: state.name,
    tasks,
    artifacts: [],
    member_states: Object.fromEntries(members.map((m) => [m.colleague_id, m])),
    context_handoffs: [],
    created_at: state.createdAt,
    updated_at: state.updatedAt,
  };
}

function mapTaskStatus(status: string): Task['status'] {
  switch (status) {
    case 'planned':
    case 'ready':
      return 'pending';
    case 'running':
      return 'in_progress';
    case 'passed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

export function eventsToMessages(events: TeamEvent[]): MailboxMessage[] {
  return events
    .filter((e) => e.type === 'message_sent' || e.type === 'task_assigned' || e.type === 'task_completed' || e.type === 'task_failed' || e.type === 'user_intervention' || e.type === 'error')
    .map((e) => ({
      id: e.id,
      from: e.memberId || e.data.from as string || 'system',
      to: 'all',
      type: mapEventType(e.type),
      content: (e.data.summary as string) || (e.data.reason as string) || (e.data.message as string) || e.type,
      task_id: e.taskId,
      broadcast: true,
      created_at: e.timestamp,
    }));
}

function mapEventType(type: string): MailboxMessage['type'] {
  switch (type) {
    case 'task_assigned':
      return 'task_assign';
    case 'task_completed':
      return 'task_complete';
    case 'task_failed':
      return 'task_fail';
    case 'user_intervention':
      return 'user_intervention';
    case 'error':
      return 'broadcast';
    default:
      return 'broadcast';
  }
}
