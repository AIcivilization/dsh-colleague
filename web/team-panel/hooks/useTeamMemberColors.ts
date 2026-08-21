/**
 * 照搬 AionUi useTeamMemberColors.ts + TeamIdentityContext
 * 成员身份色映射，localStorage 持久化。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { assignMemberColors, memberColorValue, TEAM_MEMBER_PALETTE } from '../identity/member-colors';

type MemberLike = { slot_id: string; role: string };

const STORAGE_KEY = 'team-member-colors';

function loadColorMap(teamId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${teamId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveColorMap(teamId: string, map: Record<string, number>) {
  try {
    localStorage.setItem(`${STORAGE_KEY}-${teamId}`, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function useTeamMemberColors(teamId: string, assistants: MemberLike[]) {
  const [colorMap, setColorMap] = useState<Record<string, number>>(() => loadColorMap(teamId));

  // 当 teamId 变化时重新加载
  useEffect(() => {
    setColorMap(loadColorMap(teamId));
  }, [teamId]);

  // 用字符串 key 稳定化依赖，避免 assistants 引用变化导致无限重渲染
  const assistantsKey = assistants.map((a) => `${a.slot_id}:${a.role}`).join(',');
  useEffect(() => {
    if (assistants.length === 0) return;
    setColorMap((prev) => {
      const next = assignMemberColors(prev, assistants);
      // 如果结果相同，返回 prev 避免不必要的重渲染
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      saveColorMap(teamId, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantsKey, teamId]);

  const colorOf = useCallback(
    (slot_id: string | undefined): string => {
      return memberColorValue(colorMap, slot_id);
    },
    [colorMap]
  );

  return { colorOf, colorMap };
}
