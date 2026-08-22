/**
 * TeamWarmupOverlay — 初始化遮罩
 * 磨砂玻璃覆盖对话区，从列抬头下方开始
 */

import React from 'react';
import { t } from '../i18n';

export type TeamWarmupPhase = 'warming' | 'ready' | 'error';
export type TeamWarmupMemberState = {
  status: 'pending' | 'ready' | 'failed';
  error?: string;
};

type TeamAssistant = {
  slot_id: string;
  assistant_name: string;
  assistant_backend: string;
  icon?: string;
  conversation_id?: string;
  role: string;
};

type Props = {
  phase: TeamWarmupPhase;
  assistants: TeamAssistant[];
  runtimeStatus: Map<string, TeamWarmupMemberState>;
  colorOf: (slot_id: string | undefined) => string;
  onRetry?: () => void;
};

const COLUMN_HEADER_HEIGHT = 41;

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

function simplifyWarmupError(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let s = raw.trim();
  s = s.replace(/failed to warm up rebuilt agent \S+:\s*/gi, '');
  s = s.replace(/\b(invalid request|bad request|internal error):\s*/gi, '');
  s = s.trim();
  return s || raw.trim();
}

const TeamWarmupOverlay: React.FC<Props> = ({ phase, assistants, runtimeStatus, colorOf, onRetry }) => {
  if (phase === 'ready') return null;

  const isFailure = phase === 'error';

  const failedMembers = assistants
    .filter((a) => runtimeStatus.get(a.slot_id)?.status === 'failed')
    .map((a) => ({ assistant: a, error: runtimeStatus.get(a.slot_id)?.error }));
  const fallbackLeader = assistants.find((a) => a.role === 'leader');
  if (failedMembers.length === 0 && fallbackLeader) {
    failedMembers.push({ assistant: fallbackLeader, error: undefined });
  }
  const isMulti = failedMembers.length > 1;
  const single = failedMembers[0];
  const singleIsLeader = single?.assistant.role === 'leader';
  const anyRemovable = failedMembers.some((m) => m.assistant.role !== 'leader');

  return (
    <div
      data-testid='team-warmup-overlay'
      data-phase={phase}
      className='cp-warmup-overlay'
      style={{ top: COLUMN_HEADER_HEIGHT }}
    >
      <div className='cp-warmup-content'>
        {/* 成员头像 */}
        <div className='cp-warmup-avatars'>
          {assistants.slice(0, 6).map((a) => {
            const status = runtimeStatus.get(a.slot_id)?.status;
            const mc = colorOf(a.slot_id);
            const isReady = status === 'ready';
            const isPending = status === 'pending';
            const isFailed = status === 'failed';
            const opacity = isReady || isFailed ? 1 : isPending ? 0.75 : 0.35;
            const boxShadow = isFailed
              ? '0 0 0 2px var(--danger)'
              : isReady
                ? `0 0 0 2px ${mc}, 0 0 12px 2px color-mix(in srgb, ${mc} 45%, transparent)`
                : isPending
                  ? `0 0 0 2px color-mix(in srgb, ${mc} 55%, transparent)`
                  : 'none';
            return (
              <span
                key={a.slot_id}
                data-testid={`team-warmup-avatar-${a.slot_id}`}
                data-status={status ?? 'idle'}
                className={`cp-warmup-avatar-wrap ${isPending ? 'team-warmup-breathe' : ''}`}
                style={{ opacity, boxShadow }}
              >
                <div className={`cp-warmup-avatar ${isFailed ? 'grayscale' : ''}`}>
                  <span className='font-600' style={{ color: mc }}>
                    {a.assistant_name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                {isFailed && (
                  <span className='cp-warmup-fail-badge' style={{ width: '14px', height: '14px', fontSize: '9px', border: '1.5px solid var(--bg-1)' }}>
                    !
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {isFailure ? (
          <>
            <div className='cp-warmup-title'>
              {isMulti
                ? t('warmup.failedMulti', { count: failedMembers.length })
                : single
                  ? singleIsLeader
                    ? t('warmup.failedLeader', { name: single.assistant.assistant_name })
                    : t('warmup.failedSingle', { name: single.assistant.assistant_name })
                  : t('warmup.cannotStart')}
            </div>
            {isMulti ? (
              <div
                data-testid='team-warmup-error'
                className='cp-warmup-error-box'
              >
                {failedMembers.map((m) => (
                  <div
                    key={m.assistant.slot_id}
                    className='flex items-start'
                    style={{ gap: '6px', fontSize: '11px', lineHeight: 1.5, textAlign: 'left' }}
                  >
                    <span className='shrink-0 font-600' style={{ color: 'var(--danger)' }}>
                      {m.assistant.assistant_name}
                      {m.assistant.role === 'leader' ? ` (${t('warmup.lead')})` : ''}
                    </span>
                    <span className='min-w-0 break-words' style={{ color: 'var(--danger)' }}>
                      {simplifyWarmupError(m.error) ?? t('warmup.failedToStart')}
                    </span>
                  </div>
                ))}
              </div>
            ) : single?.error ? (
              <div
                data-testid='team-warmup-error'
                className='cp-warmup-error-single'
              >
                {simplifyWarmupError(single.error)}
              </div>
            ) : null}
            <div style={{ fontSize: '12px', color: 'var(--color-text-3)', textAlign: 'center', lineHeight: 1.5 }}>
              {anyRemovable
                ? t('warmup.switchOrRemove')
                : t('warmup.switchModel')}
            </div>
            {onRetry && (
              <button
                type='button'
                onClick={onRetry}
                data-testid='team-warmup-retry'
                className='cp-warmup-retry-btn'
              >
                <IconRefresh />
                {t('warmup.retry')}
              </button>
            )}
          </>
        ) : (
          <>
            <div className='cp-warmup-title'>
              {t('warmup.waking')}
            </div>
            <div className='cp-warmup-subtitle'>
              {t('warmup.gettingReady')}
            </div>
            {/* 品牌色进度条 */}
            <div className='cp-warmup-progress'>
              <div className='cp-warmup-progress-bar team-warmup-sweep' />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TeamWarmupOverlay;
