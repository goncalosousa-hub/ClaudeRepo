import { useEffect, useState, type RefObject } from 'react';
import type { CursorState } from '../../shared/types';
import { useRoom } from './RoomContext';

interface Seen extends CursorState {
  t: number;
}

/**
 * Other people's mouse pointers on the tier list. Positions are sent relative to a tier row
 * ("zone"), so they land in the right place even when screens have different sizes.
 */
export function RemoteCursors({ boardId, containerRef }: { boardId: string; containerRef: RefObject<HTMLDivElement | null> }) {
  const { client, room } = useRoom();
  const [cursors, setCursors] = useState<Record<string, Seen>>({});

  useEffect(
    () =>
      client.onCursor((userId, cursor) =>
        setCursors((prev) => {
          const next = { ...prev };
          if (cursor) next[userId] = { ...cursor, t: Date.now() };
          else delete next[userId];
          return next;
        }),
      ),
    [client],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const limit = Date.now() - 8000;
      setCursors((prev) => {
        const stale = Object.entries(prev).filter(([, c]) => c.t < limit);
        if (!stale.length) return prev;
        const next = { ...prev };
        for (const [id] of stale) delete next[id];
        return next;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const container = containerRef.current;
  if (!container) return null;
  const box = container.getBoundingClientRect();

  return (
    <>
      {Object.entries(cursors).map(([userId, c]) => {
        const member = room.members[userId];
        if (!member || c.board !== boardId) return null;
        const zone = container.querySelector<HTMLElement>(`[data-zone="${CSS.escape(c.zone)}"]`);
        if (!zone) return null;
        const r = zone.getBoundingClientRect();
        const x = r.left - box.left + c.fx * r.width;
        const y = r.top - box.top + c.fy * r.height;
        return (
          <div
            key={userId}
            className="pointer-events-none absolute top-0 left-0 z-30 transition-transform duration-100 ease-linear"
            style={{ transform: `translate(${x}px, ${y}px)` }}
            data-testid="remote-cursor"
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              <path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.5 10 L13 10 Z" fill={member.color} stroke="white" strokeWidth="1.2" />
            </svg>
            <span
              className="absolute top-4 left-3 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow"
              style={{ background: member.color }}
            >
              {member.name}
            </span>
          </div>
        );
      })}
    </>
  );
}
