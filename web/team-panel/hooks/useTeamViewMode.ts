/**
 * Colleague Plugin useTeamViewMode.ts
 * View mode: parallel / single / board, remembered per team.
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
