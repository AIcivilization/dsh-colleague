/**
 * Colleague Plugin activityTypes.ts
 * Activity type definitions + lane routing logic
 */

import type { MailboxMessage, Task, MemberState } from '../../types';

/** Lane bucket for items that have no resolvable member. */
export const ACTIVITY_FALLBACK_LANE = '__activity_fallback__';

/** The synthetic "user/external" identity used by mailbox rows. */
export const ACTIVITY_USER_IDENTITY = 'user';

/** Broadcast recipient marker. */
export const ACTIVITY_BROADCAST_TARGET = '*';

export type ActivitySortDirection = 'desc' | 'asc';

/** A rendered lane/column: a team member or the shared fallback bucket. */
export type ActivityLane = {
  slotId: string;
  name: string;
  color: string;
  isFallback: boolean;
  backend?: string;
  icon?: string;
  conversationId?: string;
};

/** A unified, lane-positioned activity entry (message or task). */
export type ActivityItem =
  | { kind: 'message'; id: string; laneSlotId: string; createdAt: number; message: MailboxMessage }
  | { kind: 'task'; id: string; laneSlotId: string; createdAt: number; task: Task };

/** True when a message is a broadcast to the whole team (to="*" or broadcast=true). */
export const isBroadcastMessage = (message: MailboxMessage): boolean =>
  message.to === ACTIVITY_BROADCAST_TARGET || message.broadcast === true;

/**
 * Resolves the swimlane/column a message belongs to.
 * Messages sit in their recipient's lane. Broadcasts sit in the sender's lane.
 */
export const resolveMessageLane = (message: MailboxMessage, knownSlots: ReadonlySet<string>): string => {
  const target = isBroadcastMessage(message) ? message.from : message.to;
  if (target && target !== ACTIVITY_USER_IDENTITY && knownSlots.has(target)) {
    return target;
  }
  return ACTIVITY_FALLBACK_LANE;
};

/**
 * Resolves the swimlane/column a task belongs to (its owner's lane).
 */
export const resolveTaskLane = (task: Task, knownSlots: ReadonlySet<string>): string => {
  const owner = task.assignee;
  if (owner && owner !== ACTIVITY_USER_IDENTITY && knownSlots.has(owner)) {
    return owner;
  }
  return ACTIVITY_FALLBACK_LANE;
};

export const messageToActivityItem = (message: MailboxMessage, knownSlots: ReadonlySet<string>): ActivityItem => ({
  kind: 'message',
  id: message.id,
  laneSlotId: resolveMessageLane(message, knownSlots),
  createdAt: message.created_at,
  message,
});

export const taskToActivityItem = (task: Task, knownSlots: ReadonlySet<string>): ActivityItem => ({
  kind: 'task',
  id: task.id,
  laneSlotId: resolveTaskLane(task, knownSlots),
  createdAt: task.updated_at,
  task,
});

/**
 * Builds the unified item list from message/task maps, positioned into lanes
 * and sorted by `created_at` with `id` as a stable secondary key.
 */
export const buildActivityItems = (
  messages: ReadonlyArray<MailboxMessage>,
  tasks: ReadonlyArray<Task>,
  knownSlots: ReadonlySet<string>,
  direction: ActivitySortDirection
): ActivityItem[] => {
  const items: ActivityItem[] = [
    ...messages.map((message) => messageToActivityItem(message, knownSlots)),
    ...tasks.map((task) => taskToActivityItem(task, knownSlots)),
  ];
  return sortActivityItems(items, direction);
};

/** Stable sort by `createdAt` (respecting direction) then `id` as tiebreak. */
export const sortActivityItems = (
  items: ReadonlyArray<ActivityItem>,
  direction: ActivitySortDirection
): ActivityItem[] => {
  const factor = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return (a.createdAt - b.createdAt) * factor;
    return a.id < b.id ? -factor : a.id > b.id ? factor : 0;
  });
};

/** Terminal task statuses hidden by default. */
export const isTerminalTaskStatus = (status: string): boolean => status === 'completed' || status === 'cancelled';

/** System message types hidden by default. */
export const isSystemMessageType = (msgType: string): boolean =>
  msgType === 'idle_notification' || msgType === 'shutdown_request';
