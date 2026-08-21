/**
 * Colleague Plugin MessageCard.tsx
 * 消息卡片：from→to、广播标签、已读/未读、附件、内容展开/折叠
 */

import React, { useRef, useState } from 'react';
import { t } from '../i18n';
import type { MailboxMessage } from '../../types';
import { ACTIVITY_USER_IDENTITY, isBroadcastMessage, isSystemMessageType } from '../hooks/activityTypes';
import { clampStyle, useIsClamped } from '../hooks/useIsClamped';
import { formatActivityTime } from '../hooks/activityTime';

/** Resolves a member/identity display name and color for a slot id. */
export type ActivityIdentityResolver = {
  nameOf: (slotId: string | undefined) => string;
  colorOf: (slotId: string | undefined) => string;
};

type Props = {
  message: MailboxMessage;
  identity: ActivityIdentityResolver;
};

// 内联 SVG
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
  <span className='inline-flex items-center gap-4px min-w-0'>
    <span className='inline-block w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: color }} />
    <span className='truncate text-12px text-[color:var(--color-text-1)]'>{name}</span>
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
  const isRead = !message.broadcast; // 简化：广播默认已读，其他默认未读
  const isClamped = useIsClamped(bodyRef, [body, expanded]);
  const time = formatActivityTime(message.created_at);

  return (
    <div
      className='rounded-8px border border-solid border-[color:var(--border-base)] bg-[color:var(--bg-1)] p-8px flex flex-col gap-6px'
      data-testid='activity-message-card'
      data-message-id={message.id}
    >
      <div className='flex items-center gap-6px text-12px text-[color:var(--color-text-2)]'>
        <IconMail />
        <MemberChip name={fromName} color={identity.colorOf(message.from)} />
        <span className='text-[color:var(--color-text-3)]'>→</span>
        {broadcast ? (
          <span
            className='inline-flex items-center gap-2px px-6px h-18px rounded-4px text-11px text-white'
            style={{ background: 'var(--primary)' }}
          >
            <IconAnnouncement />
            {toName}
          </span>
        ) : (
          <MemberChip name={toName} color={identity.colorOf(message.to)} />
        )}
        <span className='ms-auto flex items-center gap-6px'>
          {isSystemMessageType(message.type) && (
            <span
              className='inline-flex items-center px-6px h-18px rounded-4px text-11px'
              style={{ background: 'var(--bg-6)', color: 'var(--inverse)' }}
            >
              {message.type}
            </span>
          )}
          <span
            className='inline-flex items-center px-6px h-18px rounded-4px text-11px text-white'
            style={{ background: isRead ? 'var(--success)' : 'var(--warning)' }}
          >
            {isRead ? t('message.read') : t('message.unread')}
          </span>
        </span>
      </div>

      <div
        ref={bodyRef}
        className='text-13px text-[color:var(--color-text-1)] whitespace-pre-wrap break-words'
        style={expanded ? undefined : clampStyle(3)}
      >
        {body}
      </div>

      <div className='flex items-center gap-8px text-11px text-[color:var(--color-text-3)]'>
        {attachments > 0 && (
          <span className='inline-flex items-center gap-2px'>
            <IconPaperclip />
            {t('message.files', { count: attachments })}
          </span>
        )}
        {(isClamped || expanded) && (
          <span
            className='inline-flex items-center gap-2px cursor-pointer text-[color:var(--brand)]'
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
        <span className='ms-auto shrink-0' title={time.full}>
          {time.label}
        </span>
      </div>
    </div>
  );
};

export default MessageCard;
