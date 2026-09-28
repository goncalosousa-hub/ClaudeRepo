// Who owns a room: whoever created it. Only the owner renames the room or hands it to another
// member; a room whose owner has been away for a week can be taken over by any member, so it never
// gets stuck with an owner who lost their profile.
import type { RoomState } from './types';

export const OWNER_AWAY_MS = 7 * 24 * 60 * 60_000;

/** True when the owner is no longer a member, or has not been in the room for a week. */
export function ownerAway(s: RoomState, lastSeen: Record<string, number>, ownerOnline: boolean, now = Date.now()): boolean {
  const owner = s.createdBy ? s.members[s.createdBy] : undefined;
  if (!owner) return true;
  if (ownerOnline) return false;
  return now - (lastSeen[owner.id] ?? owner.joinedAt) >= OWNER_AWAY_MS;
}
