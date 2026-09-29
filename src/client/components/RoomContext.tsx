import { createContext, useContext } from 'react';
import type { ReviewSummary } from '../../shared/stats';
import type { AnimeMeta, Member, Op, RoomKind, RoomState, RoomTab } from '../../shared/types';
import type { LocalUser } from '../lib/identity';
import type { Noun, Place } from '../lib/words';
import type { Prefs } from '../lib/prefs';
import type { RoomClient, RoomSnapshot } from '../lib/room-client';

export interface RoomContextValue {
  client: RoomClient;
  snap: RoomSnapshot;
  room: RoomState;
  /** What the room is about, and the word for its titles ("animes", "séries", "filmes", "títulos") */
  kind: RoomKind;
  noun: Noun;
  /** "sala" or "comunidade" (the community space), with the words around it */
  place: Place;
  me: string;
  user: LocalUser;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  summaries: Record<string, ReviewSummary>;
  /** Applies an op (optimistically). Shows a toast and returns false when it is refused. */
  dispatch: (op: Op) => boolean;
  openAnime: (target: string | AnimeMeta) => void;
  titleOf: (a: Pick<AnimeMeta, 'title' | 'titleEnglish'>) => string;
  isOnline: (userId: string) => boolean;
  memberName: (userId: string) => string;
  member: (userId: string) => Member | undefined;
  tab: RoomTab;
  setTab: (tab: RoomTab) => void;
  board: string;
  setBoard: (board: string) => void;
  /** Keys of MAL ids already in the room (to spot the same anime coming from another source). */
  inRoom: (a: Pick<AnimeMeta, 'key' | 'idMal'>) => string | null;
}

export const RoomContext = createContext<RoomContextValue | null>(null);

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside a room');
  return ctx;
}
