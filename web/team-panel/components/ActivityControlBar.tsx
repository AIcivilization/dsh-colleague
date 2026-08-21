/**
 * 照搬 AionUi ActivityControlBar.tsx
 * 控制条：排序方向、内容过滤、成员选择、系统消息/已完成任务开关
 * 使用 AionUi 胶囊式分段控件，不用原生 select
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { t } from '../i18n';
import { ACTIVITY_FALLBACK_LANE, type ActivitySortDirection } from '../hooks/activityTypes';

export type ActivityContentFilter = 'all' | 'messages' | 'tasks';
export type ActivityMemberOption = { slotId: string; name: string };

export type ActivityControlsState = {
  sortDirection: ActivitySortDirection;
  contentFilter: ActivityContentFilter;
  selectedMembers: string[];
  showSystemMessages: boolean;
  showTerminalTasks: boolean;
};

type Props = {
  value: ActivityControlsState;
  onChange: (next: ActivityControlsState) => void;
  members: ActivityMemberOption[];
};

// 照搬 AionUi 下拉筛选控件
const MemberFilterDropdown: React.FC<{
  members: ActivityMemberOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ members, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allOptions = [
    ...members.map((m) => ({ slotId: m.slotId, name: m.name })),
    { slotId: ACTIVITY_FALLBACK_LANE, name: t('control.unassigned') },
  ];

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const label = selected.length === 0
    ? t('control.all')
    : selected.length === 1
      ? allOptions.find((o) => o.slotId === selected[0])?.name ?? t('control.all')
      : `${selected.length}`;

  const toggle = (slotId: string) => {
    if (selected.includes(slotId)) {
      onChange(selected.filter((s) => s !== slotId));
    } else {
      onChange([...selected, slotId]);
    }
  };

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen(!open)}
        className='flex items-center gap-4px px-10px h-24px text-12px rounded-6px border-none cursor-pointer'
        style={{
          background: selected.length > 0 ? 'var(--brand)' : 'var(--bg-1)',
          color: selected.length > 0 ? 'var(--inverse)' : 'var(--color-text-3)',
        }}
      >
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className='absolute top-full mt-4px z-50 rounded-8px py-4px min-w-160px max-h-240px overflow-y-auto'
          style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border-base)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {allOptions.map((opt) => {
            const isSelected = selected.includes(opt.slotId);
            return (
              <div
                key={opt.slotId}
                onClick={() => toggle(opt.slotId)}
                className='flex items-center gap-8px px-10px py-6px cursor-pointer text-12px'
                style={{
                  background: isSelected ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-2)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  className='w-8px h-8px rounded-full shrink-0'
                  style={{
                    background: isSelected ? 'var(--brand)' : 'transparent',
                    border: isSelected ? 'none' : '1.5px solid var(--bg-6)',
                  }}
                />
                <span style={{ color: 'var(--color-text-1)' }} className='truncate'>{opt.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// 照搬 AionUi toggle switch
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <label className='flex items-center gap-6px text-12px select-none cursor-pointer' style={{ color: 'var(--color-text-2)' }}>
    <span
      onClick={() => onChange(!checked)}
      className='inline-flex items-center w-28px h-16px rounded-full cursor-pointer transition-colors duration-150 shrink-0'
      style={{
        background: checked ? 'var(--brand)' : 'var(--bg-4)',
      }}
    >
      <span
        className='inline-block w-12px h-12px rounded-full bg-white transition-transform duration-150'
        style={{
          transform: checked ? 'translateX(14px)' : 'translateX(2px)',
        }}
      />
    </span>
    {label}
  </label>
);

const ActivityControlBar: React.FC<Props> = ({ value, onChange, members }) => {
  const patch = (partial: Partial<ActivityControlsState>) => onChange({ ...value, ...partial });

  return (
    <div
      className='flex flex-wrap items-center gap-12px px-12px py-8px border-b border-solid'
      style={{ borderColor: 'var(--border-base)', background: 'var(--bg-2)' }}
      data-testid='activity-control-bar'
    >
      {/* Sort direction — 照搬 AionUi 分段控件 */}
      <div className='flex items-center gap-2px p-2px rounded-8px' style={{ background: 'var(--bg-1)' }}>
        <button
          type='button'
          data-testid='activity-sort-desc'
          onClick={() => patch({ sortDirection: 'desc' })}
          className={`px-10px h-24px text-12px rounded-6px border-none cursor-pointer ${value.sortDirection === 'desc' ? '' : 'bg-transparent'}`}
          style={value.sortDirection === 'desc' ? { background: 'var(--brand)', color: 'var(--inverse)' } : { color: 'var(--color-text-3)' }}
        >
          {t('control.newest')}
        </button>
        <button
          type='button'
          data-testid='activity-sort-asc'
          onClick={() => patch({ sortDirection: 'asc' })}
          className={`px-10px h-24px text-12px rounded-6px border-none cursor-pointer ${value.sortDirection === 'asc' ? '' : 'bg-transparent'}`}
          style={value.sortDirection === 'asc' ? { background: 'var(--brand)', color: 'var(--inverse)' } : { color: 'var(--color-text-3)' }}
        >
          {t('control.oldest')}
        </button>
      </div>

      {/* Content filter */}
      <div className='flex items-center gap-2px p-2px rounded-8px' style={{ background: 'var(--bg-1)' }}>
        {(['all', 'messages', 'tasks'] as const).map((f) => (
          <button
            key={f}
            type='button'
            data-testid={`activity-filter-${f}`}
            onClick={() => patch({ contentFilter: f })}
            className={`px-10px h-24px text-12px rounded-6px border-none cursor-pointer capitalize ${value.contentFilter === f ? '' : 'bg-transparent'}`}
            style={value.contentFilter === f ? { background: 'var(--brand)', color: 'var(--inverse)' } : { color: 'var(--color-text-3)' }}
          >
            {f === 'all' ? t('control.all') : f === 'messages' ? t('control.messages') : t('control.tasks')}
          </button>
        ))}
      </div>

      {/* Member filter — 照搬 AionUi 下拉菜单，不用原生 select */}
      <MemberFilterDropdown
        members={members}
        selected={value.selectedMembers}
        onChange={(selected) => patch({ selectedMembers: selected })}
      />

      {/* 系统消息 toggle — 照搬 AionUi toggle switch */}
      <ToggleSwitch
        checked={value.showSystemMessages}
        onChange={(checked) => patch({ showSystemMessages: checked })}
        label={t('control.systemMessages')}
      />

      {/* 已完成任务 toggle */}
      <ToggleSwitch
        checked={value.showTerminalTasks}
        onChange={(checked) => patch({ showTerminalTasks: checked })}
        label={t('control.finishedTasks')}
      />
    </div>
  );
};

export default ActivityControlBar;
