/**
 * 照搬 AionUi activityTime.ts
 * 格式化活动卡片时间戳。
 */

/**
 * - same day  -> `HH:mm`
 * - same year -> `MM-DD HH:mm`
 * - earlier   -> `YYYY-MM-DD HH:mm`
 */
export function formatActivityTime(ms: number, nowMs: number = Date.now()): { label: string; full: string } {
  const d = new Date(ms);
  const now = new Date(nowMs);

  const pad = (n: number) => String(n).padStart(2, '0');

  const sameDay = d.toDateString() === now.toDateString();
  const sameYear = d.getFullYear() === now.getFullYear();

  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const YYYY = d.getFullYear();

  let label: string;
  if (sameDay) {
    label = `${hh}:${mm}`;
  } else if (sameYear) {
    label = `${MM}-${DD} ${hh}:${mm}`;
  } else {
    label = `${YYYY}-${MM}-${DD} ${hh}:${mm}`;
  }

  return { label, full: `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}` };
}
