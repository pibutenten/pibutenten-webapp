/**
 * card_impressions 배치 큐.
 *
 * 동기:
 *  - 홈 1로드에 21장 카드가 마운트 → 기존엔 카드별 1건씩 21회 INSERT.
 *  - 모듈 단위 큐로 모은 뒤 800ms 디바운스 + visibilitychange flush 로 한 번에 INSERT.
 *
 * 정책:
 *  - dedup: 같은 card_id가 짧은 시간 내 2번 enqueue 되면 1번만 전송.
 *  - user/session: 한 번 결정되면 페이지 lifetime 동안 캐시.
 *  - 실패: silent (UX 영향 없음).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { ssGet, ssSet } from "@/lib/safe-storage";

const FLUSH_DELAY_MS = 800;

let pending: Set<number> = new Set();
let timer: ReturnType<typeof setTimeout> | null = null;
let userIdResolved = false;
let userId: string | null = null;
let sessionId: string | null = null;
let flushing = false;
let attached = false;

function getOrCreateSessionId(): string {
  if (sessionId) return sessionId;
  if (typeof window === "undefined") return "";
  // safe-storage (R2-3): 인앱 브라우저 sandbox 에서 storage 가 throw 해도 크래시 없이
  //   sid 생성으로 진행 — 모듈 변수(sessionId)가 페이지 lifetime 동안 캐시하므로 안정 유지.
  let sid = ssGet("pibutenten:sid");
  if (!sid) {
    sid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    ssSet("pibutenten:sid", sid);
  }
  sessionId = sid;
  return sid;
}

// 모듈 외부에서 같은 session id 가 필요할 때 (예: card_shares INSERT 시 session-dedup).
// sessionStorage 키 SSOT 유지 — 호출자가 직접 read 하지 않도록.
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const sid = getOrCreateSessionId();
  return sid || null;
}

async function resolveUserId(): Promise<string | null> {
  if (userIdResolved) return userId;
  try {
    const sb = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const activeId = getActiveIdentityId();
    userId = user ? (activeId ?? user.id) : null;
  } catch {
    userId = null;
  } finally {
    userIdResolved = true;
  }
  return userId;
}

async function flush(): Promise<void> {
  if (flushing) return;
  if (pending.size === 0) return;
  flushing = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // 스냅샷 — 이번 flush 분량만 처리. 이후 enqueue는 다음 cycle.
  const cardIds = Array.from(pending);
  pending = new Set<number>();
  try {
    const uid = await resolveUserId();
    const sid = getOrCreateSessionId();
    // ADR 0014 Phase 2 (마이그 0186): card_impressions.user_id → profile_id RENAME.
    const rows = cardIds.map((card_id) => ({
      card_id,
      profile_id: uid,
      session_id: sid,
    }));
    const sb = createSupabaseBrowserClient();
    // UNIQUE(card_id, session_id) 충돌 시 409 무시 — 같은 세션 같은 카드는 1회만.
    //   2026-05-16 회귀 fix: 옛 onConflict "user_id,card_id" 는 실제 UNIQUE 인덱스
    //   (card_id, session_id) 와 매칭 안 되어 INSERT 전부 실패하던 회귀.
    //   결과: 24시간 방문자 통계 = 0 (실측 통해 발견).
    await sb
      .from("card_impressions")
      .upsert(rows, {
        onConflict: "card_id,session_id",
        ignoreDuplicates: true,
      });
  } catch (e) {
    // UX 영향 X 이지만 운영 가시성 위해 콘솔 로그 (대량 실패 시 즉시 발견)
    console.error("[card_impressions] flush failed:", e);
  } finally {
    flushing = false;
    if (pending.size > 0) {
      // flush 도중 새로 enqueue 된 항목이 있으면 다시 예약
      schedule();
    }
  }
}

function schedule(): void {
  if (typeof window === "undefined") return;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

function attachLifecycleListeners(): void {
  if (attached) return;
  if (typeof window === "undefined") return;
  attached = true;
  // 페이지 이탈 시 강제 flush — keepalive fetch는 supabase-js가 자체 처리.
  const onHide = () => {
    if (pending.size > 0) void flush();
  };
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHide();
  });
}

/**
 * Card.tsx 마운트 시 호출. session 1회 dedup은 호출자 측 책임 (sessionStorage).
 */
export function enqueueImpression(cardId: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(cardId)) return;
  attachLifecycleListeners();
  pending.add(cardId);
  schedule();
}
