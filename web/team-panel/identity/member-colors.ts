/**
 * Team member identity colors — Colleague Plugin teamMemberColors.ts
 *
 * Purpose: When multiple members work in parallel and the same assistant can be
 * instantiated multiple times, use a set of low-saturation colors to help users
 * visually distinguish which "chip / message bubble / conversation column" belongs
 * to which member instance.
 *
 * The source of truth is a `slot_id -> color index` map (member-instance level),
 * maintained incrementally:
 * - Leader always gets color index 0 (brand color).
 * - Previously assigned members keep their original color index (pinned) — adding,
 *   removing, or reordering other members does not change their color.
 * - New members get the smallest unoccupied non-zero color index, prioritizing
 *   reuse of slots freed by removed members.
 * - When member count exceeds palette capacity, colors cycle modulo length
 *   (rare; cycled items are far apart and not easily confused).
 *
 * Colors are not persisted to a database — only stored in localStorage (see useTeamMemberColors).
 */

/** Identity color palette: low-saturation colors near brand slate. Index 0 is fixed for Leader (brand color). */
export const TEAM_MEMBER_PALETTE = [
  'var(--brand)', // 0 = Leader
  '#5c9ea4', // Mist Teal
  '#b58a5e', // Warm Brown
  '#9481bf', // Lotus Purple
  '#c07d97', // Rose Sand
  '#6ba07e', // Sage Green
  '#4f8ac9', // Mist Blue
  '#c99a4b', // Amber
] as const;

export const LEADER_COLOR_INDEX = 0;

type MemberLike = { slot_id: string; role: string };

/**
 * Incrementally assign member color indices: given the previous mapping and the
 * current member list, return the new mapping.
 * Pure function, no side effects, suitable for unit testing.
 */
export function assignMemberColors(prev: Record<string, number>, assistants: MemberLike[]): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  const paletteLen = TEAM_MEMBER_PALETTE.length;

  // 1) Leader gets fixed color index 0
  const leader = assistants.find((a) => a.role === 'leader');
  if (leader) {
    next[leader.slot_id] = LEADER_COLOR_INDEX;
    used.add(LEADER_COLOR_INDEX);
  }

  // 2) Previously assigned members keep their original color index (pinned)
  for (const a of assistants) {
    if (a.slot_id in next) continue;
    const previous = prev[a.slot_id];
    if (previous !== undefined) {
      next[a.slot_id] = previous;
      used.add(previous);
    }
  }

  // 3) New members get the smallest unoccupied non-zero color index; cycle modulo length when palette is full
  let cursor = 1;
  const nextFreeIndex = (): number => {
    // Still has non-zero slots available: return smallest unoccupied color index
    if (used.size < paletteLen - 1) {
      let idx = 1;
      while (used.has(idx)) idx++;
      return idx;
    }
    // Palette full: cycle reuse (skip 0, reserved for Leader)
    const idx = cursor % paletteLen || 1;
    cursor++;
    return idx;
  };
  for (const a of assistants) {
    if (a.slot_id in next) continue;
    const idx = nextFreeIndex();
    next[a.slot_id] = idx;
    used.add(idx);
  }

  return next;
}

/** Get the identity color CSS value for a member instance. Unknown slot falls back to Leader color (safe default). */
export function memberColorValue(colorMap: Record<string, number>, slot_id: string | undefined): string {
  const idx: number = (slot_id != null && colorMap[slot_id] != null) ? colorMap[slot_id] : LEADER_COLOR_INDEX;
  return TEAM_MEMBER_PALETTE[idx % TEAM_MEMBER_PALETTE.length];
}
