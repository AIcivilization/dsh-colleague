/**
 * ViewToggle — 视图切换分段控件
 */

import React from 'react';
import { t } from '../i18n';
import type { TeamViewMode } from '../hooks/useTeamViewMode';

const IconGrid = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);
const IconSquare = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);
const IconList = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

type Props = {
  value: TeamViewMode;
  onChange: (mode: TeamViewMode) => void;
};

const TeamViewToggle: React.FC<Props> = ({ value, onChange }) => {
  const options: Array<{ mode: TeamViewMode; icon: React.ReactNode; label: string }> = [
    { mode: 'parallel', icon: <IconGrid />, label: t('team.parallel') },
    { mode: 'single', icon: <IconSquare />, label: t('team.single') },
    { mode: 'board', icon: <IconList />, label: t('team.board') },
  ];

  return (
    <div className='cp-view-toggle' data-testid='team-view-toggle'>
      <span className='cp-view-toggle-label'>{t('team.view')}</span>
      <div className='cp-segment'>
        {options.map((opt) => {
          const selected = value === opt.mode;
          return (
            <button
              key={opt.mode}
              type='button'
              data-testid={`team-view-toggle-${opt.mode}`}
              data-selected={selected ? 'true' : 'false'}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => onChange(opt.mode)}
              className={`cp-segment-btn ${selected ? 'cp-segment-btn-selected' : ''}`}
            >
              {opt.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TeamViewToggle;
