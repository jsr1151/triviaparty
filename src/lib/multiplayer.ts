export type RoomPlayer = {
  id: string;
  name: string;
  userId?: string;
  team?: string;
  isHost?: boolean;
  joinedAt: string;
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoomCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export function parsePlayers(value: unknown): RoomPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object' && typeof (item as RoomPlayer).name === 'string') as RoomPlayer[];
}
