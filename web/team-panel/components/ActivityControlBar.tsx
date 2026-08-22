/**
 * ActivityControlBar — control bar
 * Sort direction, content filter, member selection, system messages/finished tasks toggles
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
    <div ref={ref} className='cp-dropdown'>
      <button
        type='button'
        onClick={() => setOpen(!open)}
        className='cp-dropdown-trigger'
        style={{
          background: selected.length > 0 ? 'var(--brand)' : undefined,
          color: selected.length > 0 ? 'var(--inverse)' : undefined,
        }}
      >
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className='cp-dropdown-menu'>
          {allOptions.map((opt) => {
            const isSelected = selected.includes(opt.slotId);
            return (
              <div
                key={opt.slotId}
                onClick={() => toggle(opt.slotId)}
                className='cp-dropdown-item'
                style={{
                  background: isSelected ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'transparent',
                }}
              >
                <span
                  className='cp-member-chip-dot'
                  style={{
                    background: isSelected ? 'var(--brand)' : 'transparent',
                    border: isSelected ? 'none' : '1.5px solid var(--bg-6)',
                  }}
                />
                <span className='truncate' style={{ color: 'var(--color-text-1)' }}>{opt.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <label className='cp-toggle'>
    <span
      onClick={() => onChange(!checked)}
      className='cp-toggle-track'
      style={{ background: checked ? 'var(--brand)' : 'var(--bg-4)' }}
    >
      <span
        className='cp-toggle-thumb'
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
    <div className='cp-control-bar' data-testid='activity-control-bar'>
      {/* Sort direction */}
      <div className='cp-control-segment'>
        <button
          type='button'
          data-testid='activity-sort-desc'
          onClick={() => patch({ sortDirection: 'desc' })}
          className={`cp-control-btn ${value.sortDirection === 'desc' ? 'cp-control-btn-selected' : ''}`}
        >
          {t('control.newest')}
        </button>
        <button
          type='button'
          data-testid='activity-sort-asc'
          onClick={() => patch({ sortDirection: 'asc' })}
          className={`cp-control-btn ${value.sortDirection === 'asc' ? 'cp-control-btn-selected' : ''}`}
        >
          {t('control.oldest')}
        </button>
      </div>

      {/* Content filter */}
      <div className='cp-control-segment'>
        {(['all', 'messages', 'tasks'] as const).map((f) => (
          <button
            key={f}
            type='button'
            data-testid={`activity-filter-${f}`}
            onClick={() => patch({ contentFilter: f })}
            className={`cp-control-btn capitalize ${value.contentFilter === f ? 'cp-control-btn-selected' : ''}`}
          >
            {f === 'all' ? t('control.all') : f === 'messages' ? t('control.messages') : t('control.tasks')}
          </button>
        ))}
      </div>

      {/* Member filter */}
      <MemberFilterDropdown
        members={members}
        selected={value.selectedMembers}
        onChange={(selected) => patch({ selectedMembers: selected })}
      />

      {/* Toggles */}
      <ToggleSwitch
        checked={value.showSystemMessages}
        onChange={(checked) => patch({ showSystemMessages: checked })}
        label={t('control.systemMessages')}
      />
      <ToggleSwitch
        checked={value.showTerminalTasks}
        onChange={(checked) => patch({ showTerminalTasks: checked })}
        label={t('control.finishedTasks')}
      />
    </div>
  );
};

export default ActivityControlBar;
