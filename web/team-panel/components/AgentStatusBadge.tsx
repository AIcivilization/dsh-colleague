/**
 * Colleague Plugin AgentStatusBadge.tsx
 * Agent 状态徽章——头像右下角叠加点或内联圆点
 * 使用 Colleague Plugin CSS 变量，不使用 Tailwind 原生色
 */

import React from 'react';

export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed' | 'dormant';

type Props = {
  status: TeammateStatus;
  testId?: string;
  /** 作为头像右下角叠加点时：绝对定位到右下角、带描边环以脱离头像底色。 */
  overlay?: boolean;
};

// 使用 Colleague Plugin：使用 CSS 变量而非 Tailwind 原生色
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
  const overlayClass = overlay
    ? 'absolute -bottom-1px -end-1px w-8px h-8px border-2 border-solid'
    : 'inline-block w-2 h-2';
  // overlay 模式：边框颜色用 var(--bg-base) 脱离头像底色；
  // dormant overlay 模式：用 var(--bg-6) 显示 hollow 效果
  const borderClr = overlay
    ? (config.border ? config.border : 'var(--bg-base)')
    : (config.border ?? 'transparent');
  return (
    <span
      data-testid={testId}
      className={`${overlayClass} rounded-full ${status === 'active' ? 'animate-pulse' : ''}`}
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
