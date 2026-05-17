import { createClient } from '@supabase/supabase-js';
import type { Match, GroupAssignmentHistory, MatchAssignment } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseEnabled = Boolean(url && key);

export const supabase = supabaseEnabled ? createClient(url as string, key as string) : null;

// Cho phép nhiều "phòng" (?room=teamA) để các nhóm chia sẻ riêng nếu muốn.
// Mặc định: 'default' — mọi máy mở link sẽ chung một bộ dữ liệu.
export const ROOM_ID =
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('room')) ||
  'default';

// ID duy nhất cho mỗi tab/máy — dùng để bỏ qua chính event của mình khi nhận realtime.
export const CLIENT_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export type AppSnapshot = {
  matches: Pick<Match, 'id' | 'score1' | 'score2' | 'status'>[];
  players: string[];
  groupAssignments: Record<string, { group1: string[]; group2: string[] }>;
  matchAssignments?: Record<string, MatchAssignment>;
  penalties: { win: number; draw: number; loss: number };
  assignmentHistories: GroupAssignmentHistory[];
};

const TABLE = 'app_state';

export async function loadSnapshot(): Promise<AppSnapshot | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('data')
    .eq('room_id', ROOM_ID)
    .maybeSingle();
  if (error) {
    console.warn('[supabase] load error', error.message);
    return null;
  }
  return (data?.data as AppSnapshot) ?? null;
}

export async function saveSnapshot(snapshot: AppSnapshot): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).upsert(
    {
      room_id: ROOM_ID,
      data: snapshot,
      updated_by: CLIENT_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_id' }
  );
  if (error) console.warn('[supabase] save error', error.message);
}

export async function clearSnapshot(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).delete().eq('room_id', ROOM_ID);
  if (error) console.warn('[supabase] clear error', error.message);
}

export function subscribeSnapshot(onChange: (snap: AppSnapshot) => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`app_state_${ROOM_ID}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `room_id=eq.${ROOM_ID}` },
      (payload) => {
        const row = (payload.new ?? {}) as { updated_by?: string; data?: AppSnapshot };
        if (!row.data) return;
        if (row.updated_by === CLIENT_ID) return; // bỏ qua event do chính mình tạo
        onChange(row.data);
      }
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
