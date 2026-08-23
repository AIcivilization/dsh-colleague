/**
 * InterventionBar — intervention control bar
 */

import React, { useState } from 'react';
import { t } from '../i18n';

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
  busy?: boolean;
}

const InterventionBar: React.FC<InterventionBarProps> = ({
  onPause,
  onResume,
  onRevise,
  onTakeover,
  onSkip,
  paused,
  busy = false,
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

  return (
    <div className='cp-intervention-bar'>
      <div className='cp-intervention-row'>
        {/* Pause/Resume */}
        {paused ? (
          <button onClick={onResume} disabled={busy} className='cp-intervention-btn cp-intervention-btn-resume'>
            <IconPlay />
            {t('intervention.resume')}
          </button>
        ) : (
          <button onClick={onPause} disabled={busy} className='cp-intervention-btn cp-intervention-btn-pause'>
            <IconPause />
            {t('intervention.pause')}
          </button>
        )}

        {/* Revise */}
        <button
          onClick={() => setShowReviseInput(!showReviseInput)}
          disabled={busy}
          className='cp-intervention-btn cp-intervention-btn-ghost cp-intervention-btn-ghost-revise'
        >
          <IconEdit />
          {t('intervention.revise')}
        </button>

        {/* Takeover */}
        <button
          onClick={onTakeover}
          disabled={busy}
          className='cp-intervention-btn cp-intervention-btn-ghost cp-intervention-btn-ghost-takeover'
        >
          <IconUser />
          {t('intervention.takeover')}
        </button>

        {/* Skip */}
        <button
          onClick={onSkip}
          disabled={busy}
          className='cp-intervention-btn cp-intervention-btn-ghost cp-intervention-btn-ghost-skip'
        >
          <IconSkip />
          {t('intervention.skip')}
        </button>

        {/* Right-side label */}
        <span className='cp-intervention-label'>{t('intervention.label')}</span>
      </div>

      {/* Revise input */}
      {showReviseInput && (
        <div className='cp-intervention-input-row'>
          <input
            type='text'
            value={reviseMessage}
            onChange={(e) => setReviseMessage(e.target.value)}
            placeholder={t('intervention.revisePlaceholder')}
            aria-label={t('intervention.revisePlaceholder')}
            className='cp-intervention-input'
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRevise();
              if (e.key === 'Escape') setShowReviseInput(false);
            }}
          />
          <button onClick={handleRevise} disabled={busy || !reviseMessage.trim()} className='cp-intervention-btn cp-intervention-btn-brand'>
            {t('intervention.send')}
          </button>
          <button
            onClick={() => setShowReviseInput(false)}
            className='cp-intervention-btn cp-intervention-btn-ghost'
          >
            {t('intervention.cancel')}
          </button>
        </div>
      )}
    </div>
  );
};

export default InterventionBar;
