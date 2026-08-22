/**
 * TeamTabs — member chip bar
 * Circular avatar + status light + identity-color name + hover actions
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentStatusBadge, { type TeammateStatus } from './AgentStatusBadge';
import { t } from '../i18n';

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const TAB_OVERFLOW_THRESHOLD = 10;

type TeamAssistant = {
  slot_id: string;
  assistant_name: string;
  assistant_backend: string;
  icon?: string;
  conversation_id?: string;
  role: string;
  status: TeammateStatus;
};

type TeamTabViewProps = {
  slot_id: string;
  assistant_name: string;
  assistant_backend: string;
  icon?: string;
  conversation_id?: string;
  isActive: boolean;
  status: TeammateStatus;
  isLeader: boolean;
  warmupFailed?: boolean;
  color: string;
  pendingCount?: number;
  dragActive: boolean;
  onSwitch: (slot_id: string) => void;
  onRename?: (slot_id: string, new_name: string) => void;
  onRemove?: (slot_id: string) => void;
};

const TeamTabView: React.FC<TeamTabViewProps> = ({
  slot_id,
  assistant_name,
  isActive,
  status,
  isLeader,
  warmupFailed = false,
  color,
  pendingCount = 0,
  dragActive,
  onSwitch,
  onRename,
  onRemove,
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(assistant_name);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const nextValue = inputRef.current?.value ?? editValue;
    const trimmed = nextValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== assistant_name && onRename) {
      setEditValue(trimmed);
      onRename(slot_id, trimmed);
    } else {
      setEditValue(assistant_name);
    }
  }, [editValue, assistant_name, slot_id, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename();
      } else if (e.key === 'Escape') {
        setEditValue(assistant_name);
        setEditing(false);
      }
    },
    [commitRename, assistant_name]
  );

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditValue(assistant_name);
      setEditing(true);
    },
    [assistant_name]
  );

  const showHoverActions = !editing && (hovered && !dragActive);

  return (
    <div
      data-testid={`team-tab-${slot_id}`}
      data-team-tab-role={isLeader ? 'leader' : 'teammate'}
      data-active={isActive ? 'true' : 'false'}
      className='cp-tab'
      style={{
        borderColor: isActive ? color : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !editing && onSwitch(slot_id)}
      onDoubleClick={onRename ? startEditing : undefined}
    >
      {editing ? (
        <input
          ref={inputRef}
          className='flex-1 min-w-0 bg-transparent border-none outline-none'
          style={{ color: 'var(--color-text-1)', fontSize: '13px', padding: '0' }}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className='flex items-center min-w-0 flex-1' style={{ gap: '4px' }}>
          {pendingCount > 0 && (
            <span
              className='shrink-0 animate-wiggle'
              style={{ fontSize: '14px', lineHeight: 1 }}
              title={`${pendingCount} pending permission request(s)`}
            >
              ‼️
            </span>
          )}
          {/* Avatar */}
          <div
            className={`cp-tab-avatar ${warmupFailed ? 'grayscale' : ''}`}
            style={isActive ? { boxShadow: `0 0 0 1.5px ${color}` } : undefined}
          >
            <span className='cp-tab-avatar-text' style={{ color }}>
              {assistant_name.slice(0, 2).toUpperCase()}
            </span>
            {warmupFailed ? (
              <span className='cp-warmup-fail-badge'>!</span>
            ) : (
              <AgentStatusBadge status={status} testId={`team-tab-status-${slot_id}`} />
            )}
          </div>
          <span className='cp-tab-name' style={{ color }}>
            {assistant_name}
          </span>
        </div>
      )}
        {/* Hover action buttons */}
      {showHoverActions && onRename && (
        <span
          data-testid={`team-tab-edit-${slot_id}`}
          className='cp-tab-action cp-tab-action-edit'
          onClick={startEditing}
        >
          <IconEdit />
        </span>
      )}
      {showHoverActions && !isLeader && onRemove && (
        <span
          data-testid={`team-tab-remove-${slot_id}`}
          className='cp-tab-action cp-tab-action-remove'
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slot_id);
          }}
        >
          <IconClose />
        </span>
      )}
    </div>
  );
};

type TeamTabsProps = {
  assistants: TeamAssistant[];
  activeSlotId: string;
  onTabClick?: (slot_id: string) => void;
  onSwitchTab: (slot_id: string) => void;
  onRenameAssistant?: (slot_id: string, new_name: string) => void;
  onRemoveAssistant?: (slot_id: string) => void;
  onAddMember?: () => void;
  colorOf: (slot_id: string) => string;
  pendingCounts?: Map<string, number>;
  warmingUp?: boolean;
  failedSlotIds?: Set<string>;
};

const TeamTabs: React.FC<TeamTabsProps> = ({
  assistants,
  activeSlotId,
  onTabClick,
  onSwitchTab,
  onRenameAssistant,
  onRemoveAssistant,
  onAddMember,
  colorOf,
  pendingCounts,
  warmingUp = false,
  failedSlotIds,
}) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateTabOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setShowLeftFade(hasOverflow && container.scrollLeft > TAB_OVERFLOW_THRESHOLD);
    setShowRightFade(
      hasOverflow && container.scrollLeft + container.clientWidth < container.scrollWidth - TAB_OVERFLOW_THRESHOLD
    );
  }, []);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateTabOverflow, { passive: true });
    window.addEventListener('resize', updateTabOverflow);
    const observer = new ResizeObserver(updateTabOverflow);
    observer.observe(container);
    updateTabOverflow();
    return () => {
      container.removeEventListener('scroll', updateTabOverflow);
      window.removeEventListener('resize', updateTabOverflow);
      observer.disconnect();
    };
  }, [updateTabOverflow]);

  if (assistants.length === 0) return null;

  return (
    <div data-testid='team-tab-bar' className='cp-tab-bar'>
      <div className='cp-tab-bar-inner'>
        {/* Horizontally scrollable member chip list */}
        <div ref={tabsContainerRef} className='cp-tab-list scrollbar-hide'>
          {assistants.map((assistant) => {
            return (
              <TeamTabView
                key={assistant.slot_id}
                slot_id={assistant.slot_id}
                assistant_name={assistant.assistant_name}
                assistant_backend={assistant.assistant_backend}
                icon={assistant.icon}
                conversation_id={assistant.conversation_id}
                isActive={assistant.slot_id === activeSlotId}
                status={assistant.status}
                isLeader={assistant.role === 'leader'}
                warmupFailed={failedSlotIds?.has(assistant.slot_id) ?? false}
                color={colorOf(assistant.slot_id)}
                pendingCount={pendingCounts?.get(assistant.slot_id) ?? 0}
                dragActive={false}
                onSwitch={(slot_id) => {
                  onSwitchTab(slot_id);
                  onTabClick?.(slot_id);
                }}
                onRename={
                  onRenameAssistant && !warmingUp ? (sid, name) => onRenameAssistant(sid, name) : undefined
                }
                onRemove={onRemoveAssistant && !warmingUp ? (sid) => onRemoveAssistant(sid) : undefined}
              />
            );
          })}
        </div>
        {/* Edge fade indicators */}
        {showLeftFade && (
          <div
            className='cp-tab-fade'
            style={{ left: 0, background: 'linear-gradient(90deg, var(--bg-1), transparent)' }}
          />
        )}
        {showRightFade && (
          <div
            className='cp-tab-fade'
            style={{ right: 0, background: 'linear-gradient(270deg, var(--bg-1), transparent)' }}
          />
        )}
        {/* Pinned "Add member" on the right */}
        {onAddMember ? (
          <div className='flex items-center shrink-0' style={{ paddingInlineStart: '8px', paddingInlineEnd: '12px' }}>
            <button
              type='button'
              disabled={warmingUp}
              data-testid='team-tab-add-member'
              className='cp-tab-add'
              onClick={onAddMember}
            >
              <IconPlus />
              {t('member.add')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TeamTabs;
