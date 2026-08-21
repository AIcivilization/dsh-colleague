/**
 * 团队运行时类型定义 — 追加事件 + 状态投影模型
 *
 * 所有状态变更通过事件追加完成，状态由事件投影得出。
 * 任务和事件使用稳定 UUID，不再以标题作为依赖标识。
 */

// ===== 团队状态机 =====

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

// ===== 角色定义 =====

export type RoleId = 'leader' | 'coder' | 'reviewer' | 'tester' | 'docs';

export interface MemberConfig {
  /** 稳定 UUID */
  id: string;
  name: string;
  role: RoleId;
  /** DSH subagent provider 名称 */
  provider: string;
  /** 模型标识 */
  model?: string;
  /** 权限模式 */
  permission?: 'reject' | 'allow' | 'ask';
  /** 技能 prompt 文件路径 */
  skillPromptPath?: string;
  /** 模板文件路径 */
  templatePath?: string;
  /** 身份色 slot（固定不变） */
  slotId: number;
}

// ===== 任务定义 =====

export interface Task {
  /** 稳定 UUID */
  id: string;
  title: string;
  description: string;
  /** 被分派的成员 ID */
  assigneeId: string;
  /** 角色要求 */
  role: RoleId;
  status: TaskStatus;
  /** 依赖的其他任务 ID 列表 */
  dependencies: string[];
  /** 任务结果 */
  result?: TaskResult;
  /** 质量结论 */
  quality?: QualityResult;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

export interface TaskResult {
  status: 'completed' | 'failed' | 'blocked';
  summary: string;
  /** 产出文件路径列表 */
  artifacts: string[];
  /** 发现的问题列表 */
  issues: Issue[];
  /** 测试命令 */
  testCommand?: string;
  /** 测试输出 */
  testOutput?: string;
  /** 阻塞原因 */
  blockedReason?: string;
}

export interface QualityResult {
  status: QualityStatus;
  /** 审核者 ID */
  reviewerId?: string;
  /** 具体问题 */
  issues: Issue[];
  /** 结论摘要 */
  summary: string;
  /** 时间戳 */
  timestamp: number;
}

export interface Issue {
  severity: 'critical' | 'warning' | 'suggestion';
  file?: string;
  line?: number;
  description: string;
  suggestion?: string;
}

// ===== 事件定义 =====

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
  /** 事件 UUID */
  id: string;
  /** 事件类型 */
  type: TeamEventType;
  /** 团队 ID */
  teamId: string;
  /** 关联任务 ID（可选） */
  taskId?: string;
  /** 关联成员 ID（可选） */
  memberId?: string;
  /** 事件数据 */
  data: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
}

// ===== 团队状态投影 =====

export interface TeamState {
  id: string;
  name: string;
  status: TeamStatus;
  members: MemberConfig[];
  tasks: Task[];
  events: TeamEvent[];
  /** 工作区路径 */
  workspace: string;
  createdAt: number;
  updatedAt: number;
}

// ===== 团队配置 =====

export interface TeamConfig {
  teamId: string;
  teamName: string;
  members: MemberConfig[];
  workspace: string;
  maxConcurrentWriters: number;
  memoryEnabled: boolean;
}

// ===== 用户介入指令 =====

export type InterventionType =
  | 'pause'
  | 'resume'
  | 'revise'
  | 'takeover'
  | 'skip';

export interface InterventionCommand {
  type: InterventionType;
  /** 目标任务 ID（skip/takeover 使用） */
  taskId?: string;
  /** 修正指令内容（revise 使用） */
  message?: string;
}

// ===== Leader 计划器输出 =====

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
  /** 创建任务时的任务定义 */
  task?: {
    title: string;
    description: string;
    role: RoleId;
    dependencies: string[];
  };
  /** 解除阻塞的任务 ID */
  taskId?: string;
  /** 原因说明 */
  reason: string;
  /** 完成报告 */
  summary?: string;
  /** 向用户提问 */
  question?: string;
}
