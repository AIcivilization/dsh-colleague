/**
 * MessageCard — message card
 */

import React, { useRef, useState } from 'react';
import { t } from '../i18n';
import type { MailboxMessage } from '../../types';
import { ACTIVITY_USER_IDENTITY, isBroadcastMessage, isSystemMessageType } from '../hooks/activityTypes';
import { clampStyle, useIsClamped } from '../hooks/useIsClamped';
import { formatActivityTime } from '../hooks/activityTime';

export type ActivityIdentityResolver = {
  nameOf: (slotId: string | undefined) => string;
  colorOf: (slotId: string | undefined) => string;
};

type Props = {
  message: MailboxMessage;
  identity: ActivityIdentityResolver;
};

const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconAnnouncement = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);
const IconPaperclip = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
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

const MemberChip: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <span className='cp-member-chip'>
    <span className='cp-member-chip-dot' style={{ backgroundColor: color }} />
    <span className='cp-member-chip-name'>{name}</span>
  </span>
);

const MessageCard: React.FC<Props> = ({ message, identity }) => {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const broadcast = isBroadcastMessage(message);
  const fromName =
    message.from === ACTIVITY_USER_IDENTITY
      ? t('message.userExternal')
      : identity.nameOf(message.from);
  const toName = broadcast
    ? t('message.broadcast')
    : message.to === ACTIVITY_USER_IDENTITY
      ? t('message.userExternal')
      : identity.nameOf(message.to);

  const body = message.content;
  const attachments = (message.attachments ?? []).length;
  const isRead = !message.broadcast;
  const isClamped = useIsClamped(bodyRef, [body, expanded]);
  const time = formatActivityTime(message.created_at);

  return (
    <div
      className='cp-card'
      data-testid='activity-message-card'
      data-message-id={message.id}
    >
      <div className='cp-card-header' style={{ fontSize: '12px', color: 'var(--color-text-2)' }}>
        <IconMail />
        <MemberChip name={fromName} color={identity.colorOf(message.from)} />
        <span style={{ color: 'var(--color-text-3)' }}>→</span>
        {broadcast ? (
          <span className='cp-broadcast-tag'>
            <IconAnnouncement />
            {toName}
          </span>
        ) : (
          <MemberChip name={toName} color={identity.colorOf(message.to)} />
        )}
        <span className='flex items-center' style={{ marginInlineStart: 'auto', gap: '6px' }}>
          {isSystemMessageType(message.type) && (
            <span className='cp-sysmsg-tag'>
              {message.type}
            </span>
          )}
          <span
            className='cp-read-tag'
            style={{ background: isRead ? 'var(--success)' : 'var(--warning)' }}
          >
            {isRead ? t('message.read') : t('message.unread')}
          </span>
        </span>
      </div>

      <div
        ref={bodyRef}
        className='cp-card-desc'
        style={{ ...{ fontSize: '13px', color: 'var(--color-text-1)' }, ...(expanded ? {} : clampStyle(3)) }}
      >
        {body}
      </div>

      <div className='cp-card-footer'>
        {attachments > 0 && (
          <span className='flex items-center' style={{ gap: '2px' }}>
            <IconPaperclip />
            {t('message.files', { count: attachments })}
          </span>
        )}
        {(isClamped || expanded) && (
          <span
            className='cp-card-expand-btn'
            role='button'
            tabIndex={0}
            data-testid='activity-message-expand'
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v)}
          >
            {expanded ? <IconUp /> : <IconDown />}
            {expanded ? t('message.collapse') : t('message.expand')}
          </span>
        )}
        <span className='cp-card-time' title={time.full}>
          {time.label}
        </span>
      </div>
    </div>
  );
};

export default MessageCard;
