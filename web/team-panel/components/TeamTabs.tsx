/**
 * 照搬 AionUi TeamTabs.tsx
 * Tab bar for team mode showing assistant tabs with status badges.
 * Supports scroll overflow with fade indicators.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentStatusBadge, { type TeammateStatus } from './AgentStatusBadge';
import { t } from '../i18n';

// 内联 SVG 图标
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
const IconDrag = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
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

  const showHoverActions = !editing && ((hovered && !dragActive));

  return (
    <div
      data-testid={`team-tab-${slot_id}`}
      data-team-tab-role={isLeader ? 'leader' : 'teammate'}
      data-active={isActive ? 'true' : 'false'}
      className='relative flex items-center gap-6px ps-6px pe-10px h-34px max-w-220px cursor-pointer rounded-999px border border-solid transition-colors duration-150 shrink-0 bg-[color:var(--bg-2)]'
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
          className='text-15px flex-1 min-w-0 bg-transparent border-none outline-none text-[color:var(--color-text-1)] p-0'
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className='min-w-0 flex-1 flex items-center gap-4px'>
          {pendingCount > 0 && (
            <span
              className='shrink-0 text-14px leading-none animate-wiggle'
              title={`${pendingCount} pending permission request(s)`}
            >
              ‼️
            </span>
          )}
          {/* 头像 */}
          <div className={`relative shrink-0 w-22px h-22px rounded-full flex items-center justify-center text-12px leading-none bg-[color:var(--fill-2)] ${warmupFailed ? 'grayscale' : ''}`}>
            <span className='truncate text-10px font-600' style={{ color }}>
              {assistant_name.slice(0, 2).toUpperCase()}
            </span>
            {warmupFailed ? (
              <span
                className='absolute -end-2px -bottom-2px w-12px h-12px rounded-full flex items-center justify-center text-9px font-700 text-white'
                style={{ background: 'var(--danger)', border: '1.5px solid var(--bg-base)' }}
              >
                !
              </span>
            ) : (
              <AgentStatusBadge status={status} testId={`team-tab-status-${slot_id}`} />
            )}
          </div>
          <span
            className='text-13px font-600 whitespace-nowrap overflow-hidden text-ellipsis select-none'
            style={{ color }}
          >
            {assistant_name}
          </span>
        </div>
      )}
      {/* hover 时胶囊变宽、露出操作按钮 */}
      {showHoverActions && onRename && (
        <span
          data-testid={`team-tab-edit-${slot_id}`}
          className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text-primary)] transition-colors duration-150'
          onClick={startEditing}
        >
          <IconEdit />
        </span>
      )}
      {showHoverActions && !isLeader && onRemove && (
        <span
          data-testid={`team-tab-remove-${slot_id}`}
          className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--danger)] transition-colors duration-150'
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
    <div
      data-testid='team-tab-bar'
      className='relative shrink-0 bg-[color:var(--bg-1)] border-t border-x border-b border-solid border-[color:var(--border-base)]'
    >
      <div className='relative flex items-stretch min-h-48px'>
        {/* 可横向滚动的成员胶囊列表 */}
        <div
          ref={tabsContainerRef}
          className='flex items-center gap-6px flex-1 min-w-0 overflow-x-auto overflow-y-hidden py-8px px-12px [scrollbar-width:none]'
        >
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
        {/* 两侧渐隐提示 */}
        {showLeftFade && (
          <div
            className='pointer-events-none absolute start-0 top-0 bottom-0 w-28px z-10'
            style={{ background: 'linear-gradient(90deg, var(--bg-1), transparent)' }}
          />
        )}
        {showRightFade && (
          <div
            className='pointer-events-none absolute top-0 bottom-0 end-0 w-28px z-10'
            style={{
              background: 'linear-gradient(270deg, var(--bg-1), transparent)',
            }}
          />
        )}
        {/* 固定在最右的「添加成员」— 照搬 AionUi */}
        {onAddMember ? (
          <div className='flex items-center shrink-0 ps-8px pe-12px'>
            <button
              type='button'
              disabled={warmingUp}
              data-testid='team-tab-add-member'
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                background: 'transparent',
                border: 'none',
                height: 32,
                lineHeight: 'normal',
              }}
              className={`flex items-center gap-6px px-10px rounded-8px text-13px font-500 whitespace-nowrap ${
                warmingUp
                  ? 'text-[color:var(--text-disabled)] cursor-not-allowed'
                  : 'text-[color:var(--text-secondary)] hover:text-[color:var(--brand)] hover:bg-[color:var(--bg-2)] cursor-pointer'
              }`}
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
