/**
 * AgentStatusBadge — status badge
 * Overlay dot on avatar bottom-right or inline dot
 */

import React from 'react';

export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed' | 'dormant';

type Props = {
  status: TeammateStatus;
  testId?: string;
  overlay?: boolean;
};

const STATUS_CONFIG: Record<TeammateStatus, { bg: string; border?: string }> = {
  pending: { bg: 'var(--bg-6)' },
  idle: { bg: 'var(--bg-6)' },
  active: { bg: 'var(--success)' },
  completed: { bg: 'var(--bg-6)' },
  failed: { bg: 'var(--danger)' },
  dormant: { bg: 'transparent', border: 'var(--bg-6)' },
};

const FALLBACK = { bg: 'var(--bg-6)' };

const AgentStatusBadge: React.FC<Props> = ({ status, testId, overlay = true }) => {
  const config = STATUS_CONFIG[status] ?? FALLBACK;
  const className = overlay
    ? `cp-status-badge-overlay ${status === 'active' ? 'animate-pulse' : ''}`
    : `cp-status-badge-inline ${status === 'active' ? 'animate-pulse' : ''}`;
  const borderClr = overlay
    ? (config.border ? config.border : 'var(--bg-base)')
    : (config.border ?? 'transparent');
  return (
    <span
      data-testid={testId}
      className={className}
      style={{
        backgroundColor: config.bg,
        borderColor: borderClr,
        ...(config.border && !overlay ? { borderWidth: '1px', borderStyle: 'solid' } : {}),
      }}
      aria-label={status}
    />
  );
};

export default AgentStatusBadge;
