/**
 * TaskCard — task card
 */

import React, { useRef, useState } from 'react';
import { t } from '../i18n';
import type { Task } from '../../types';
import { ACTIVITY_USER_IDENTITY } from '../hooks/activityTypes';
import type { ActivityIdentityResolver } from './MessageCard';
import { clampStyle, useIsClamped } from '../hooks/useIsClamped';
import { formatActivityTime } from '../hooks/activityTime';

type Props = {
  task: Task;
  identity: ActivityIdentityResolver;
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--bg-6)',
  in_progress: 'var(--primary)',
  completed: 'var(--success)',
  failed: 'var(--danger)',
  blocked: 'var(--warning, #f0ad4e)',
  cancelled: 'var(--danger)',
};

const IconListView = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const IconLock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconDown = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconUp = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const TaskCard: React.FC<Props> = ({ task, identity }) => {
  const [expanded, setExpanded] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  const ownerName =
    !task.assignee || task.assignee === ACTIVITY_USER_IDENTITY
      ? t('message.userExternal')
      : identity.nameOf(task.assignee);
  const ownerColor = identity.colorOf(task.assignee);
  const description = task.description ?? '';
  const isClamped = useIsClamped(descRef, [description, expanded]);
  const time = formatActivityTime(task.updated_at);

  const statusColor = STATUS_COLOR[task.status] ?? 'var(--bg-6)';

  return (
    <div
      className='cp-card'
      data-testid='activity-task-card'
      data-task-id={task.id}
    >
      <div className='cp-card-header'>
        <span style={{ color: 'var(--color-text-2)' }}><IconListView /></span>
        <span className='cp-card-title'>{task.title}</span>
        <span className='cp-card-status-tag' style={{ background: statusColor }}>
          {t(`task.status.${task.status}`)}
        </span>
      </div>

      <div className='cp-card-owner'>
        <span className='cp-card-owner-dot' style={{ backgroundColor: ownerColor }} />
        <span className='truncate'>{ownerName}</span>
      </div>

      {task.dependencies && task.dependencies.length > 0 && (
        <div className='flex flex-wrap items-center' style={{ gap: '4px' }}>
          {task.dependencies.map((dep) => (
            <span
              key={dep}
              className='cp-dep-chip'
              style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)' }}
              title={`blocked by ${dep.slice(0, 6)}`}
            >
              <IconLock />
              <span className='truncate' style={{ maxWidth: '210px' }}>{t('task.blockedBy', { id: dep.slice(0, 6) })}</span>
            </span>
          ))}
        </div>
      )}

      {description.length > 0 && (
        <div
          ref={descRef}
          id={`task-desc-${task.id}`}
          className='cp-card-desc'
          style={expanded ? undefined : clampStyle(2)}
        >
          {description}
        </div>
      )}

      <div className='cp-card-footer'>
        {description.length > 0 && (isClamped || expanded) && (
          <span
            className='cp-card-expand-btn'
            role='button'
            tabIndex={0}
            aria-expanded={expanded}
            aria-controls={`task-desc-${task.id}`}
            data-testid='activity-task-expand'
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v)}
          >
            {expanded ? <IconUp /> : <IconDown />}
            {expanded ? t('task.collapse') : t('task.expand')}
          </span>
        )}
        <span className='cp-card-time' title={time.full}>
          {time.label}
        </span>
      </div>
    </div>
  );
};

export default TaskCard;
