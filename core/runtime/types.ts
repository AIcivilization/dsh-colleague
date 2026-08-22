/**
 * Team runtime type definitions — append-event + state projection model
 *
 * All state changes are made through event appending. State is derived from event projection.
 * Tasks and events use stable UUIDs; titles are not used as dependency identifiers.
 */

// ===== Team state machine =====

export type TeamStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskStatus =
  | 'planned'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'passed'
  | 'failed'
  | 'cancelled';

export type QualityStatus =
  | 'pending'
  | 'approved'
  | 'changes_requested'
  | 'test_passed'
  | 'test_failed';

// ===== Role definitions =====

export type RoleId = 'leader' | 'coder' | 'reviewer' | 'tester' | 'docs';

export interface MemberConfig {
  /** Stable UUID */
  id: string;
  name: string;
  role: RoleId;
  /** DSH subagent provider name */
  provider: string;
  /** Model identifier */
  model?: string;
  /** Permission mode */
  permission?: 'reject' | 'allow' | 'ask';
  /** Skill prompt content (loaded from template file) */
  skillPrompt?: string;
  /** Template file path */
  templatePath?: string;
  /** Identity color slot (fixed) */
  slotId: number;
}

// ===== Task definitions =====

export interface Task {
  /** Stable UUID */
  id: string;
  title: string;
  description: string;
  /** Assigned member ID */
  assigneeId: string;
  /** Role requirement */
  role: RoleId;
  status: TaskStatus;
  /** List of dependency task IDs */
  dependencies: string[];
  /** Task result */
  result?: TaskResult;
  /** Quality result */
  quality?: QualityResult;
  /** Creation timestamp */
  createdAt: number;
  /** Update timestamp */
  updatedAt: number;
}

export interface TaskResult {
  status: 'completed' | 'failed' | 'blocked';
  summary: string;
  /** Artifact file paths */
  artifacts: string[];
  /** Issues found */
  issues: Issue[];
  /** Test command */
  testCommand?: string;
  /** Test output */
  testOutput?: string;
  /** Block reason */
  blockedReason?: string;
}

export interface QualityResult {
  status: QualityStatus;
  /** Reviewer ID */
  reviewerId?: string;
  /** Specific issues */
  issues: Issue[];
  /** Conclusion summary */
  summary: string;
  /** Timestamp */
  timestamp: number;
}

export interface Issue {
  severity: 'critical' | 'warning' | 'suggestion';
  file?: string;
  line?: number;
  description: string;
  suggestion?: string;
}

// ===== Event definitions =====

export type TeamEventType =
  | 'team_created'
  | 'team_status_changed'
  | 'member_added'
  | 'member_removed'
  | 'task_created'
  | 'task_status_changed'
  | 'task_assigned'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'task_blocked'
  | 'quality_recorded'
  | 'artifact_added'
  | 'message_sent'
  | 'user_intervention'
  | 'error';

export interface TeamEvent {
  /** Event UUID */
  id: string;
  /** Event type */
  type: TeamEventType;
  /** Team ID */
  teamId: string;
  /** Associated task ID (optional) */
  taskId?: string;
  /** Associated member ID (optional) */
  memberId?: string;
  /** Event data */
  data: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
}

// ===== Team state projection =====

export interface TeamState {
  id: string;
  name: string;
  status: TeamStatus;
  members: MemberConfig[];
  tasks: Task[];
  events: TeamEvent[];
  /** Workspace path */
  workspace: string;
  createdAt: number;
  updatedAt: number;
}

// ===== Team configuration =====

export interface TeamConfig {
  teamId: string;
  teamName: string;
  members: MemberConfig[];
  workspace: string;
  maxConcurrentWriters: number;
  memoryEnabled: boolean;
}

// ===== User intervention commands =====

export type InterventionType =
  | 'pause'
  | 'resume'
  | 'revise'
  | 'takeover'
  | 'skip';

export interface InterventionCommand {
  type: InterventionType;
  /** Target task ID (for skip/takeover) */
  taskId?: string;
  /** Revision instruction content (for revise) */
  message?: string;
}

// ===== Leader planner output =====

export type LeaderActionType =
  | 'create_task'
  | 'unblock_task'
  | 'request_review'
  | 'request_test'
  | 'request_docs'
  | 'report'
  | 'ask_user';

export interface LeaderAction {
  type: LeaderActionType;
  /** Task definition (for create_task) */
  task?: {
    title: string;
    description: string;
    role: RoleId;
    dependencies: string[];
  };
  /** Task ID to unblock */
  taskId?: string;
  /** Reason */
  reason: string;
  /** Completion report */
  summary?: string;
  /** Question to user */
  question?: string;
}
