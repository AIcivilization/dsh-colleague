/**
 * Colleague Plugin useTeamActivityControls.ts
 * 活动控制状态：排序方向、内容过滤、成员选择、系统消息/已完成任务开关
 * 状态持久化到 localStorage，按 teamId 隔离。
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
        // 过滤掉已不存在的成员
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

  // 当 validLaneIds 变化时，过滤掉已不存在的成员
  // 用 JSON 序列化比较，避免数组引用不同但内容相同导致的无限重渲染
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
