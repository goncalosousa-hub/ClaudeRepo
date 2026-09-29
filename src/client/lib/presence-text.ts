import { mediaTypeOf, roomKind } from '../../shared/media';
import { CONSENSUS_BOARD, GROUP_BOARD, type AnimeMeta, type PresenceState, type RoomState } from '../../shared/types';
import { an, kindNoun, mediaNoun } from './words';

/** Human name of a board, e.g. "do Grupo", "da Ana". */
export function boardName(board: string, room: RoomState, me: string): string {
  if (board === GROUP_BOARD) return 'do Grupo';
  if (board === CONSENSUS_BOARD) return room.global ? 'da Comunidade' : 'da Média';
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
  const t = (key: string) => {
    if (room.anime[key]) return titleOf(room.anime[key]);
    const noun = mediaNoun(mediaTypeOf(key));
    return `${an(noun)} ${noun.one}`;
  };
  if (p.dragging) return `A mover ${t(p.dragging.key)}`;
  if (p.typing === 'chat') return 'A escrever no chat…';
  if (p.typing) return `A escrever sobre ${t(p.typing)}`;
  if (p.viewing) return `A ver ${t(p.viewing)}`;
  switch (p.tab) {
    case 'home':
      return 'Nas recomendações';
    case 'explore':
      return `A procurar ${kindNoun(roomKind(room)).many}`;
    case 'ranking':
      return 'A ver o ranking';
    case 'members':
      return 'A ver as pessoas';
    case 'chat':
      return 'No chat';
    case 'tierlist':
      if (!p.board || p.board === GROUP_BOARD) return 'Na tierlist do Grupo';
      if (p.board === CONSENSUS_BOARD) return room.global ? 'Na tierlist da Comunidade' : 'Na tierlist da Média';
      if (p.board === p.userId) return 'Na tierlist pessoal';
      if (p.board === me) return 'A espreitar a tua tierlist 👀';
      return `A espreitar a tierlist de ${room.members[p.board]?.name ?? '?'}`;
    default:
      return 'Online';
  }
}
