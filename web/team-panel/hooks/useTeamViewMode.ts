/**
 * Colleague Plugin useTeamViewMode.ts
 * 视图模式：parallel / single / board，按团队记忆。
 */

import { useCallback, useState } from 'react';

export type TeamViewMode = 'parallel' | 'single' | 'board';

const STORAGE_KEY = 'team-view-mode';

function loadMode(teamId: string): TeamViewMode {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${teamId}`);
    if (stored === 'parallel' || stored === 'single' || stored === 'board') return stored;
  } catch { /* ignore */ }
  return 'parallel';
}

export function useTeamViewMode(teamId: string): [TeamViewMode, (mode: TeamViewMode) => void] {
  const [mode, setMode] = useState<TeamViewMode>(() => loadMode(teamId));

  const onChange = useCallback((next: TeamViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(`${STORAGE_KEY}-${teamId}`, next);
    } catch { /* ignore */ }
  }, [teamId]);

  return [mode, onChange];
}
