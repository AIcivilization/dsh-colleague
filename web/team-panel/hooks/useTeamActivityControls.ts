/**
 * Colleague Plugin useTeamActivityControls.ts
 * Activity control state: sort direction, content filter, member selection, system messages/finished tasks toggles
 * State persisted to localStorage, isolated per teamId.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ActivityControlsState } from '../components/ActivityControlBar';

const STORAGE_PREFIX = 'team-activity-controls';

function loadState(teamId: string, validLaneIds: string[]): ActivityControlsState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}-${teamId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sortDirection: parsed.sortDirection ?? 'desc',
        contentFilter: parsed.contentFilter ?? 'all',
        // Filter out members that no longer exist
        selectedMembers: (parsed.selectedMembers ?? []).filter((id: string) => validLaneIds.includes(id)),
        showSystemMessages: parsed.showSystemMessages ?? false,
        showTerminalTasks: parsed.showTerminalTasks ?? false,
      };
    }
  } catch {
    // ignore
  }
  return {
    sortDirection: 'desc',
    contentFilter: 'all',
    selectedMembers: [],
    showSystemMessages: false,
    showTerminalTasks: false,
  };
}

function saveState(teamId: string, state: ActivityControlsState) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}-${teamId}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function useTeamActivityControls(
  teamId: string,
  validLaneIds: string[]
): [ActivityControlsState, (next: ActivityControlsState) => void] {
  const [state, setState] = useState<ActivityControlsState>(() => loadState(teamId, validLaneIds));

  // When validLaneIds changes, filter out members that no longer exist
  // Use JSON serialization for comparison to avoid infinite re-render from array reference differences
  const laneKey = validLaneIds.join(',');
  useEffect(() => {
    setState((prev) => {
      const filtered = prev.selectedMembers.filter((id) => validLaneIds.includes(id));
      if (filtered.length === prev.selectedMembers.length) return prev;
      return { ...prev, selectedMembers: filtered };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneKey]);

  const onChange = useCallback((next: ActivityControlsState) => {
    setState(next);
    saveState(teamId, next);
  }, [teamId]);

  return [state, onChange];
}
