/**
 * 照搬 AionUi useIsClamped.ts
 * 检测元素是否被 CSS line-clamp 截断。
 */

import { useLayoutEffect, useState } from 'react';

const TOLERANCE_PX = 1;

/** Multi-line CSS clamp so the clamped element's overflow can be measured. */
export const clampStyle = (rows: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: rows,
  overflow: 'hidden',
});

/**
 * Detects whether a (line-clamped) element is actually truncated.
 */
export function useIsClamped<T extends HTMLElement>(ref: React.RefObject<T | null>, deps: unknown[]): boolean {
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + TOLERANCE_PX);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return clamped;
}
