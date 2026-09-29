import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, MessagesSquare, Search, ThumbsUp, Users, WifiOff } from 'lucide-react';
import { summarizeAll } from '../../shared/stats';
import { CONSENSUS_BOARD, GROUP_BOARD, type AnimeMeta, type Op, type RoomTab } from '../../shared/types';
import { APP_NAME } from '../../shared/brand';
import { roomKind } from '../../shared/media';
import { displayTitle } from '../lib/anime-api';
import { kindNoun, placeWords } from '../lib/words';
import { errorMessage } from '../lib/format';
import type { LocalUser } from '../lib/identity';
import { usePrefs } from '../lib/prefs';
import { rememberRoom } from '../lib/recent-rooms';
import type { RoomClient, RoomSnapshot } from '../lib/room-client';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { AnimeDialog } from './AnimeDialog';
import { ExploreTab } from './ExploreTab';
import { MembersTab } from './MembersTab';
import { ProfileDialog } from './ProfileDialog';
import { RoomKindDialog } from './RoomKindDialog';
import { PhotosContext } from './Cover';
import { RoomContext, useRoom, type RoomContextValue } from './RoomContext';
import { RoomHeader } from './RoomHeader';
import { ShareDialog } from './ShareDialog';
import { Sidebar, type SidebarPanel } from './Sidebar';
import { TierlistTab } from './TierlistTab';
import { RecommendationsTab } from './RecommendationsTab';
import { useToast } from './Toasts';
import { Avatar, cn } from './ui';

type TabInfo = { id: RoomTab; label: string; icon: typeof LayoutGrid };
const HOME: TabInfo = { id: 'home', label: 'Recomendações', icon: ThumbsUp };
const TIERLIST: TabInfo = { id: 'tierlist', label: 'Tierlist', icon: LayoutGrid };
const EXPLORE: TabInfo = { id: 'explore', label: 'Procurar', icon: Search };
const PEOPLE: TabInfo = { id: 'members', label: 'Pessoas', icon: Users };

/** The community is recommendations only; rooms can also use a tier list. */
const tabsOf = (global: boolean): TabInfo[] => (global ? [HOME, EXPLORE, PEOPLE] : [HOME, TIERLIST, EXPLORE, PEOPLE]);

function readTab(roomId: string, global: boolean): RoomTab {
  try {
    const t = sessionStorage.getItem(`atl:tab:${roomId}`);
    if (t === 'chat' || tabsOf(global).some((x) => x.id === t)) return t as RoomTab;
  } catch {
    /* ignore */
  }
  return 'home';
}

export function RoomView({
  client,
  snap,
  user,
  setUser,
}: {
  client: RoomClient;
  snap: RoomSnapshot;
  user: LocalUser;
  setUser: (u: LocalUser) => void;
}) {
  const room = snap.room!;
  const me = user.id;
  const [prefs, setPrefs] = usePrefs();
  const toast = useToast();
  const isDesktop = useIsDesktop();
  const [tab, setTabState] = useState<RoomTab>(() => readTab(room.id, !!room.global));
  // The community space has no shared board: its tier list is everyone's average.
  const [board, setBoard] = useState<string>(room.global ? CONSENSUS_BOARD : GROUP_BOARD);
  const [dialog, setDialog] = useState<{ key: string; meta: AnimeMeta } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [panel, setPanel] = useState<SidebarPanel>('chat');

  const setTab = useCallback(
    (t: RoomTab) => {
      setTabState(t);
      try {
        sessionStorage.setItem(`atl:tab:${room.id}`, t);
      } catch {
        /* ignore */
      }
      window.scrollTo({ top: 0 });
    },
    [room.id],
  );

  // On desktop the chat lives in the sidebar.
  const visibleTab: RoomTab = isDesktop && tab === 'chat' ? 'home' : tab;

  useEffect(() => {
    client.setPresence({ tab: visibleTab, board: visibleTab === 'tierlist' ? board : null });
  }, [client, visibleTab, board]);

  useEffect(() => client.onError((code) => toast(errorMessage(code), 'error')), [client, toast]);

  useEffect(() => {
    if (!room.global) rememberRoom(room.id, room.name);
  }, [room.id, room.name, room.global]);

  // Unread counters for chat / activity.
  const chatVisible = (isDesktop && panel === 'chat') || tab === 'chat';
  const activityVisible = isDesktop && panel === 'activity';
  const [chatSeen, setChatSeen] = useState(() => room.chat.length ? room.chat[room.chat.length - 1].id : '');
  const [activitySeen, setActivitySeen] = useState(() => room.activity.length ? room.activity[room.activity.length - 1].id : '');
  const lastChat = room.chat.length ? room.chat[room.chat.length - 1].id : '';
  const lastActivity = room.activity.length ? room.activity[room.activity.length - 1].id : '';
  useEffect(() => {
    if (chatVisible) setChatSeen(lastChat);
  }, [chatVisible, lastChat]);
  useEffect(() => {
    if (activityVisible) setActivitySeen(lastActivity);
  }, [activityVisible, lastActivity]);
  const unreadChat = useMemo(() => countAfter(room.chat, chatSeen, me), [room.chat, chatSeen, me]);
  const unreadActivity = useMemo(() => countAfter(room.activity, activitySeen, me), [room.activity, activitySeen, me]);

  useEffect(() => {
    document.title = `${unreadChat ? `(${unreadChat}) ` : ''}${room.name} · ${APP_NAME}`;
  }, [room.name, unreadChat]);

  const summaries = useMemo(
    () => summarizeAll(room),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.reviews, room.anime, room.members],
  );
  const malIndex = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of Object.values(room.anime)) if (a.idMal != null) m.set(a.idMal, a.key);
    return m;
  }, [room.anime]);

  const dispatch = useCallback(
    (op: Op) => {
      const err = client.dispatch(op);
      if (err) {
        toast(errorMessage(err), 'error');
        return false;
      }
      return true;
    },
    [client, toast],
  );

  const roomAnime = useRef(room.anime);
  roomAnime.current = room.anime;
  const openAnime = useCallback((target: string | AnimeMeta) => {
    const meta = typeof target === 'string' ? roomAnime.current[target] : target;
    if (meta) setDialog({ key: meta.key, meta });
  }, []);

  const ctx = useMemo<RoomContextValue>(
    () => ({
      client,
      snap,
      room,
      kind: roomKind(room),
      noun: kindNoun(roomKind(room)),
      place: placeWords(!!room.global),
      me,
      user,
      prefs,
      setPrefs,
      summaries,
      dispatch,
      openAnime,
      titleOf: (a) => displayTitle(a, prefs.titles),
      isOnline: (id) => id === me || !!snap.presence[id],
      memberName: (id) => (id === me ? 'Tu' : (room.members[id]?.name ?? 'Alguém')),
      member: (id) => room.members[id],
      tab: visibleTab,
      setTab,
      board,
      setBoard,
      openKindDialog: () => setKindOpen(true),
      inRoom: (a) => (room.anime[a.key] ? a.key : a.idMal != null ? (malIndex.get(a.idMal) ?? null) : null),
    }),
    [client, snap, room, me, user, prefs, setPrefs, summaries, dispatch, openAnime, visibleTab, setTab, board, malIndex],
  );

  return (
    <RoomContext.Provider value={ctx}>
      <PhotosContext.Provider value={room.photos}>
        <div className="flex min-h-dvh flex-col">
          <RoomHeader onShare={() => setShareOpen(true)} onProfile={() => setProfileOpen(true)} />
          {snap.status !== 'joined' && (
            <div className="flex items-center justify-center gap-2 bg-warn/10 px-4 py-1.5 text-xs font-medium text-warn">
              <WifiOff size={14} /> Sem ligação ao servidor — a tentar religar… As tuas alterações serão enviadas quando voltar.
            </div>
          )}
          <div className="mx-auto flex w-full max-w-[1680px] flex-1 gap-5 px-3 sm:px-5">
            <main className="min-w-0 flex-1 pt-3 pb-28 lg:pb-10">
              <TabBar />
              <div className="mt-3">
                {visibleTab === 'home' && <RecommendationsTab />}
                {visibleTab === 'tierlist' && !room.global && <TierlistTab onShare={() => setShareOpen(true)} />}
                {visibleTab === 'explore' && <ExploreTab />}
                {visibleTab === 'members' && <MembersTab />}
                {visibleTab === 'chat' && (
                  <div className="h-[calc(100dvh-190px)] min-h-[420px]">
                    <Sidebar panel={panel} setPanel={setPanel} unreadChat={0} unreadActivity={unreadActivity} />
                  </div>
                )}
              </div>
            </main>
            {isDesktop && (
              <aside
                className={cn(
                  'sticky w-[340px] shrink-0 py-3 xl:w-[370px]',
                  // The community header has a second row with the sections.
                  room.global ? 'top-[100px] h-[calc(100dvh-100px)]' : 'top-[60px] h-[calc(100dvh-60px)]',
                )}
              >
                <Sidebar panel={panel} setPanel={setPanel} unreadChat={unreadChat} unreadActivity={unreadActivity} />
              </aside>
            )}
          </div>
          <BottomNav unreadChat={unreadChat} />
        </div>
        <AnimeDialog target={dialog} onClose={() => setDialog(null)} />
        <ProfileDialog open={profileOpen} user={user} onSave={setUser} onClose={() => setProfileOpen(false)} />
        <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
        {!room.global && <RoomKindDialog open={kindOpen} onClose={() => setKindOpen(false)} />}
      </PhotosContext.Provider>
    </RoomContext.Provider>
  );
}

function countAfter(list: { id: string; by: string }[], seenId: string, me: string) {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].id === seenId) break;
    if (list[i].by !== me) n++;
  }
  return n;
}

function TabBar() {
  const { tab, setTab, snap, room } = useRoomTabs();
  return (
    <nav className="hidden items-center gap-1 border-b border-line lg:flex" aria-label="Secções">
      {tabsOf(!!room.global).map((t) => {
        const viewers = Object.values(snap.presence).filter((p) => p.tab === t.id && room.members[p.userId]);
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            <t.icon size={16} />
            {t.label}
            {viewers.length > 0 && (
              <span className="flex -space-x-1.5">
                {viewers.slice(0, 3).map((p) => (
                  <Avatar key={p.userId} member={room.members[p.userId]} size={18} />
                ))}
              </span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-accent to-accent-2" />}
          </button>
        );
      })}
    </nav>
  );
}

function BottomNav({ unreadChat }: { unreadChat: number }) {
  const { tab, setTab, room } = useRoomTabs();
  const items = [...tabsOf(!!room.global), { id: 'chat' as RoomTab, label: 'Chat', icon: MessagesSquare }];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Secções"
    >
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={cn(
            'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
            tab === t.id ? 'text-fg' : 'text-faint',
          )}
        >
          <t.icon size={20} className={tab === t.id ? 'text-accent' : undefined} />
          {t.label}
          {t.id === 'chat' && unreadChat > 0 && (
            <span className="absolute top-1 right-[calc(50%-18px)] min-w-4 rounded-full bg-accent-2 px-1 text-[10px] leading-4 font-bold text-white">
              {unreadChat > 9 ? '9+' : unreadChat}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

// Small helper so the nav components only depend on what they use.
function useRoomTabs() {
  const { tab, setTab, snap, room } = useRoom();
  return { tab, setTab, snap, room };
}
