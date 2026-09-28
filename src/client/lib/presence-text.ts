import { CONSENSUS_BOARD, GROUP_BOARD, type AnimeMeta, type PresenceState, type RoomState } from '../../shared/types';

/** Human name of a board, e.g. "do Grupo", "da Ana". */
export function boardName(board: string, room: RoomState, me: string): string {
  if (board === GROUP_BOARD) return 'do Grupo';
  if (board === CONSENSUS_BOARD) return 'da Média';
  if (board === me) return 'tua';
  return `de ${room.members[board]?.name ?? '?'}`;
}

/** What someone is doing right now, e.g. "A mover Frieren". */
export function describePresence(
  p: PresenceState,
  room: RoomState,
  me: string,
  titleOf: (a: AnimeMeta) => string,
): string {
  const t = (key: string) => (room.anime[key] ? titleOf(room.anime[key]) : 'um anime');
  if (p.dragging) return `A mover ${t(p.dragging.key)}`;
  if (p.typing === 'chat') return 'A escrever no chat…';
  if (p.typing) return `A escrever sobre ${t(p.typing)}`;
  if (p.viewing) return `A ver ${t(p.viewing)}`;
  switch (p.tab) {
    case 'explore':
      return 'A explorar animes';
    case 'ranking':
      return 'A ver o ranking';
    case 'members':
      return 'A ver os membros';
    case 'chat':
      return 'No chat';
    case 'tierlist':
      if (!p.board || p.board === GROUP_BOARD) return 'Na tierlist do Grupo';
      if (p.board === CONSENSUS_BOARD) return 'Na tierlist da Média';
      if (p.board === p.userId) return 'Na tierlist pessoal';
      if (p.board === me) return 'A espreitar a tua tierlist 👀';
      return `A espreitar a tierlist de ${room.members[p.board]?.name ?? '?'}`;
    default:
      return 'Online';
  }
}
