/**
 * Colleague Plugin useTeamMemberColors.ts + TeamIdentityContext
 * Member identity color mapping, persisted in localStorage.
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

  // Reload when teamId changes
  useEffect(() => {
    setColorMap(loadColorMap(teamId));
  }, [teamId]);

  // Stabilize dependencies with string key to avoid infinite re-render from assistants reference changes
  const assistantsKey = assistants.map((a) => `${a.slot_id}:${a.role}`).join(',');
  useEffect(() => {
    if (assistants.length === 0) return;
    setColorMap((prev) => {
      const next = assignMemberColors(prev, assistants);
      // If result is the same, return prev to avoid unnecessary re-render
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
