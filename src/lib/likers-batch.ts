/**
 * RecentLikers batch loader.
 *
 * 동기:
 *  - 카드 N개가 마운트되면 카드별로 get_recent_card_likers RPC가 N+ 회 호출됨.
 *  - 모듈 단위 큐로 cardId를 모은 뒤 80ms 디바운스 1회 batch RPC 로 전송.
 *
 * 사용:
 *  fetchRecentLikersBatch(cardId, limit).then(setLikers);
 *
 * 정책:
 *  - 같은 cardId+limit 조합 동시 요청은 단일 promise 공유.
 *  - 결과는 캐시하지 않음 — refetch 호출 (예: likeCount 변화 시) 그대로 batch 처리.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type Liker = {
  user_id: string;
  persona: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
  created_at: string;
};

const FLUSH_DELAY_MS = 80;

type Pending = {
  resolve: (rows: Liker[]) => void;
  reject: (e: unknown) => void;
};

type Bucket = {
  limit: number;
  // cardId → 대기 중인 resolver 목록
  waiters: Map<number, Pending[]>;
  timer: ReturnType<typeof setTimeout> | null;
};

const buckets: Map<number, Bucket> = new Map();

function ensureBucket(limit: number): Bucket {
  let b = buckets.get(limit);
  if (!b) {
    b = { limit, waiters: new Map(), timer: null };
    buckets.set(limit, b);
  }
  return b;
}

async function flushBucket(limit: number): Promise<void> {
  const b = buckets.get(limit);
  if (!b) return;
  const ids = Array.from(b.waiters.keys());
  if (ids.length === 0) return;
  const waitersSnapshot = b.waiters;
  // 새 큐 시작 — flush 중에 들어오는 enqueue 는 다음 cycle 로
  b.waiters = new Map();
  b.timer = null;
  try {
    const sb = createSupabaseBrowserClient();
    const { data, error } = await sb.rpc("get_recent_card_likers_batch", {
      p_card_ids: ids,
      p_limit_per_card: limit,
    });
    if (error || !data) {
      for (const list of waitersSnapshot.values()) {
        for (const w of list) w.resolve([]);
      }
      return;
    }
    // 결과를 cardId 별로 분류
    const byCard: Map<number, Liker[]> = new Map();
    for (const row of data as (Liker & { card_id: number })[]) {
      const cid = row.card_id;
      let list = byCard.get(cid);
      if (!list) {
        list = [];
        byCard.set(cid, list);
      }
      list.push({
        user_id: row.user_id,
        persona: row.persona,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        handle: row.handle,
        created_at: row.created_at,
      });
    }
    for (const [cid, waiters] of waitersSnapshot.entries()) {
      const rows = byCard.get(cid) ?? [];
      for (const w of waiters) w.resolve(rows);
    }
  } catch (e) {
    for (const list of waitersSnapshot.values()) {
      for (const w of list) w.reject(e);
    }
  }
}

export function fetchRecentLikersBatch(
  cardId: number,
  limit = 3,
): Promise<Liker[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (!Number.isFinite(cardId)) return Promise.resolve([]);
  const b = ensureBucket(limit);
  return new Promise<Liker[]>((resolve, reject) => {
    const list = b.waiters.get(cardId) ?? [];
    list.push({ resolve, reject });
    b.waiters.set(cardId, list);
    if (!b.timer) {
      b.timer = setTimeout(() => {
        void flushBucket(limit);
      }, FLUSH_DELAY_MS);
    }
  });
}
