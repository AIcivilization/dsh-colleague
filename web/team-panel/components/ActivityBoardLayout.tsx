/**
 * ActivityBoardLayout — 看板列布局
 * 每列对应一个成员或 fallback 列
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
  return <div ref={ref} data-testid='activity-load-sentinel' className='cp-load-sentinel' />;
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
      className='cp-board-column'
      data-testid='activity-board-column'
      data-lane-id={lane.slotId}
    >
      <div className='cp-board-col-header'>
        {lane.isFallback || !lane.backend ? (
          <>
            <span className='cp-card-owner-dot' style={{ backgroundColor: lane.color }} />
            <span className='truncate' style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-1)' }} title={lane.name}>
              {lane.name}
            </span>
          </>
        ) : (
          <div className='flex items-center min-w-0 flex-1' style={{ gap: '6px' }}>
            <span className='cp-board-col-avatar' style={{ color: lane.color }}>
              {lane.name.slice(0, 2).toUpperCase()}
            </span>
            <span className='truncate' style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-1)' }} title={lane.name}>
              {lane.name}
            </span>
          </div>
        )}
        <span className='cp-board-col-count'>{laneItems.length}</span>
      </div>
      <div ref={scrollRef} className='cp-board-col-body'>
        {laneItems.length === 0 ? (
          <div className='cp-board-col-empty'>{emptyLabel}</div>
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
              <div className='cp-col-loading'>
                <div className='cp-col-loading-spinner loading' />
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
    <div className='cp-board' data-testid='activity-board'>
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
