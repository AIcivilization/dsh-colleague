/**
 * 照搬 AionUi ActivityBoardLayout.tsx
 * Board layout: one column per lane (members + fallback).
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { t } from '../i18n';
import type { ActivityItem, ActivityLane } from '../hooks/activityTypes';
import type { ActivityIdentityResolver } from './MessageCard';
import MessageCard from './MessageCard';
import TaskCard from './TaskCard';

type Props = {
  items: ActivityItem[];
  lanes: ActivityLane[];
  identity: ActivityIdentityResolver;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
};

/** Bottom-of-column sentinel: fires `onLoadMore` when scrolled into view. */
const LoadMoreSentinel: React.FC<{
  rootRef: React.RefObject<HTMLElement | null>;
  onLoadMore: () => void;
}> = ({ rootRef, onLoadMore }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root: rootRef.current ?? null }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onLoadMore, rootRef]);
  return <div ref={ref} data-testid='activity-load-sentinel' className='h-1px w-full shrink-0' />;
};

const BoardColumn: React.FC<{
  lane: ActivityLane;
  laneItems: ActivityItem[];
  identity: ActivityIdentityResolver;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void;
  emptyLabel: string;
}> = ({ lane, laneItems, identity, hasMore, isLoadingMore, onLoadMore, emptyLabel }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showSentinel = hasMore && laneItems.length > 0 && !!onLoadMore;

  return (
    <div
      className='flex flex-col shrink-0 w-288px h-full rounded-8px border border-solid border-[color:var(--border-base)] bg-[color:var(--bg-2)]'
      data-testid='activity-board-column'
      data-lane-id={lane.slotId}
    >
      <div className='flex items-center gap-6px px-10px py-8px border-b border-solid border-[color:var(--border-base)]'>
        {lane.isFallback || !lane.backend ? (
          <>
            <span className='inline-block w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: lane.color }} />
            <span className='truncate text-12px font-medium text-[color:var(--color-text-1)]' title={lane.name}>
              {lane.name}
            </span>
          </>
        ) : (
          <div className='flex items-center gap-6px min-w-0 flex-1'>
            <span className='inline-block w-16px h-16px rounded-full shrink-0 flex items-center justify-center text-10px font-600 bg-[color:var(--fill-2)]' style={{ color: lane.color }}>
              {lane.name.slice(0, 2).toUpperCase()}
            </span>
            <span className='truncate text-12px font-medium text-[color:var(--color-text-1)]' title={lane.name}>
              {lane.name}
            </span>
          </div>
        )}
        <span className='ms-auto text-11px text-[color:var(--color-text-3)]'>{laneItems.length}</span>
      </div>
      <div ref={scrollRef} className='flex-1 overflow-auto flex flex-col gap-8px p-8px'>
        {laneItems.length === 0 ? (
          <div className='text-12px text-[color:var(--color-text-3)] text-center py-12px'>{emptyLabel}</div>
        ) : (
          <>
            {laneItems.map((item) =>
              item.kind === 'message' ? (
                <MessageCard key={item.id} message={item.message} identity={identity} />
              ) : (
                <TaskCard key={item.id} task={item.task} identity={identity} />
              )
            )}
            {showSentinel && <LoadMoreSentinel rootRef={scrollRef} onLoadMore={onLoadMore!} />}
            {isLoadingMore && (
              <div className='flex items-center justify-center py-8px'>
                <div className='w-16px h-16px border-2 border-[color:var(--border-base)] border-t-[color:var(--brand)] rounded-full loading' />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const ActivityBoardLayout: React.FC<Props> = ({
  items,
  lanes,
  identity,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}) => {
  const emptyLabel = t('board.noActivity');

  const itemsByLane = useMemo(() => {
    const map = new Map<string, ActivityItem[]>();
    for (const lane of lanes) map.set(lane.slotId, []);
    for (const item of items) {
      const bucket = map.get(item.laneSlotId);
      if (bucket) bucket.push(item);
    }
    return map;
  }, [items, lanes]);

  if (lanes.length === 0) return null;

  return (
    <div className='flex h-full gap-8px overflow-auto p-8px' data-testid='activity-board'>
      {lanes.map((lane) => (
        <BoardColumn
          key={lane.slotId}
          lane={lane}
          laneItems={itemsByLane.get(lane.slotId) ?? []}
          identity={identity}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
          emptyLabel={emptyLabel}
        />
      ))}
    </div>
  );
};

export default ActivityBoardLayout;
