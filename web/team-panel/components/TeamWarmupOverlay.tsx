/**
 * Colleague Plugin TeamWarmupOverlay.tsx
 * 团队 warmup 遮罩 —— 磨砂玻璃覆盖对话区，从列抬头下方开始。
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

// 列抬头 h-40px + 底部 1px border-b
const COLUMN_HEADER_HEIGHT = 41;

const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

/** 后端错误层层包裹，只有末尾一段对用户有意义。 */
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
      className='absolute start-0 end-0 bottom-0 z-20 flex flex-col items-center justify-center'
      style={{
        top: COLUMN_HEADER_HEIGHT,
        background: 'color-mix(in srgb, var(--bg-1) 80%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div className='flex flex-col items-center gap-14px px-40px py-28px max-w-420px'>
        {/* 成员头像：跟随各自 runtime 状态 */}
        <div className='flex items-center gap-10px'>
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
                className={`relative inline-flex rounded-full transition-all duration-300 ${isPending ? 'team-warmup-breathe' : ''}`}
                style={{ opacity, boxShadow }}
              >
                <div
                  className={`w-34px h-34px rounded-full flex items-center justify-center text-15px leading-none bg-[color:var(--fill-2)] ${isFailed ? 'grayscale' : ''}`}
                >
                  <span className='font-600' style={{ color: mc }}>
                    {a.assistant_name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                {isFailed && (
                  <span
                    className='absolute -end-2px -bottom-2px w-14px h-14px rounded-full flex items-center justify-center text-9px font-700 text-white'
                    style={{ background: 'var(--danger)', border: '1.5px solid var(--bg-1)' }}
                  >
                    !
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {isFailure ? (
          <>
            <div className='text-15px font-600 text-[color:var(--text-primary)] text-center'>
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
                className='w-320px max-h-120px overflow-y-auto flex flex-col gap-4px rounded-6px px-10px py-8px'
                style={{ background: 'color-mix(in srgb, var(--danger) 8%, var(--bg-base))' }}
              >
                {failedMembers.map((m) => (
                  <div
                    key={m.assistant.slot_id}
                    className='flex items-start gap-6px text-11px leading-relaxed text-start'
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
                className='max-w-320px max-h-64px overflow-y-auto text-11px leading-relaxed text-start rounded-6px px-10px py-6px'
                style={{ background: 'color-mix(in srgb, var(--danger) 8%, var(--bg-base))', color: 'var(--danger)' }}
              >
                {simplifyWarmupError(single.error)}
              </div>
            ) : null}
            <div className='text-12px text-[color:var(--color-text-3)] text-center leading-relaxed'>
              {anyRemovable
                ? t('warmup.switchOrRemove')
                : t('warmup.switchModel')}
            </div>
            {onRetry && (
              <button
                type='button'
                onClick={onRetry}
                data-testid='team-warmup-retry'
                className='mt-4px flex items-center gap-6px h-32px px-18px rounded-8px border-none text-13px font-500 text-white cursor-pointer'
                style={{ background: 'var(--brand)' }}
              >
                <IconRefresh />
                {t('warmup.retry')}
              </button>
            )}
          </>
        ) : (
          <>
            <div className='text-15px font-600 text-[color:var(--text-primary)]'>
              {t('warmup.waking')}
            </div>
            <div className='text-12px text-[color:var(--color-text-3)]'>
              {t('warmup.gettingReady')}
            </div>
            {/* 品牌色进度条（不确定进度，来回扫动） */}
            <div className='w-180px h-4px rounded-2px overflow-hidden' style={{ background: 'var(--bg-3)' }}>
              <div
                className='h-full rounded-2px team-warmup-sweep'
                style={{ background: 'linear-gradient(90deg, var(--brand-hover), var(--brand))' }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TeamWarmupOverlay;
