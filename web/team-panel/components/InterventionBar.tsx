/**
 * InterventionBar — 介入控制栏（差异化新增，但使用 AionUi 设计风格）
 *
 * 这是 AionUi 没有的部分，放在面板底部。
 * 使用 AionUi 的 CSS 变量和 Tailwind 工具类风格。
 */

import React, { useState } from 'react';
import { t } from '../i18n';

// 内联 SVG
const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const IconPause = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
  </svg>
);
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconSkip = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
  </svg>
);

interface InterventionBarProps {
  onPause: () => void;
  onResume: () => void;
  onRevise: (message: string) => void;
  onTakeover: () => void;
  onSkip: () => void;
  paused: boolean;
}

const InterventionBar: React.FC<InterventionBarProps> = ({
  onPause,
  onResume,
  onRevise,
  onTakeover,
  onSkip,
  paused,
}) => {
  const [showReviseInput, setShowReviseInput] = useState(false);
  const [reviseMessage, setReviseMessage] = useState('');

  const handleRevise = () => {
    if (reviseMessage.trim()) {
      onRevise(reviseMessage);
      setReviseMessage('');
      setShowReviseInput(false);
    }
  };

  // 照搬 AionUi 按钮类名
  const btnBase = 'flex items-center gap-6px h-32px px-12px rounded-8px text-13px font-500 border-none cursor-pointer';

  return (
    <div className='border-t border-solid border-[color:var(--border-base)] bg-[color:var(--bg-1)] px-12px py-8px'>
      <div className='flex items-center gap-8px'>
        {/* 暂停/恢复 */}
        {paused ? (
          <button
            onClick={onResume}
            className={`${btnBase} text-white`}
            style={{ background: 'var(--success)' }}
          >
            <IconPlay />
            {t('intervention.resume')}
          </button>
        ) : (
          <button
            onClick={onPause}
            className={`${btnBase} text-white`}
            style={{ background: 'var(--warning)' }}
          >
            <IconPause />
            {t('intervention.pause')}
          </button>
        )}

        {/* 修正 */}
        <button
          onClick={() => setShowReviseInput(!showReviseInput)}
          className={`${btnBase} bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-2)] hover:text-[color:var(--brand)]`}
        >
          <IconEdit />
          {t('intervention.revise')}
        </button>

        {/* 接管 */}
        <button
          onClick={onTakeover}
          className={`${btnBase} bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-2)] hover:text-[color:var(--primary)]`}
        >
          <IconUser />
          {t('intervention.takeover')}
        </button>

        {/* 跳过 */}
        <button
          onClick={onSkip}
          className={`${btnBase} bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-2)] hover:text-[color:var(--danger)]`}
        >
          <IconSkip />
          {t('intervention.skip')}
        </button>

        {/* 右侧标签 */}
        <div className='ms-auto'>
          <span className='text-11px text-[color:var(--color-text-3)]'>{t('intervention.label')}</span>
        </div>
      </div>

      {/* 修正输入框 */}
      {showReviseInput && (
        <div className='mt-8px flex items-center gap-8px'>
          <input
            type='text'
            value={reviseMessage}
            onChange={(e) => setReviseMessage(e.target.value)}
            placeholder={t('intervention.revisePlaceholder')}
            className='flex-1 h-32px px-12px text-13px bg-[color:var(--bg-2)] border border-solid border-[color:var(--border-base)] rounded-8px outline-none text-[color:var(--text-primary)] focus:border-[color:var(--brand)]'
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRevise();
              if (e.key === 'Escape') setShowReviseInput(false);
            }}
          />
          <button
            onClick={handleRevise}
            className={`${btnBase} text-white`}
            style={{ background: 'var(--brand)' }}
          >
            {t('intervention.send')}
          </button>
          <button
            onClick={() => setShowReviseInput(false)}
            className={`${btnBase} bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-2)]`}
          >
            {t('intervention.cancel')}
          </button>
        </div>
      )}
    </div>
  );
};

export default InterventionBar;
