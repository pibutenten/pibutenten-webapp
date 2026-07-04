/**
 * 홈 피드 뒤로가기 복원 (R5-3, 2026-07-04) — 트리거 판정 + 스냅샷 저장/로드.
 *
 * 배경: 앱 셸(AppShell .root)은 fixed 오버레이 "내부 스크롤"이라 window.scrollY 기반
 * ScrollManager 복원이 무동작이고, 뒤로가기로 홈에 오면 피드 풀이 초기 20장으로 리셋돼
 * 복원 지점까지의 높이 자체가 없다 → 풀(pool)과 scrollTop 을 한 스냅샷으로 저장·복원한다.
 *
 * 복원 트리거는 두 경로 (둘 다 "뒤로/앞으로" 만, 새 진입·새로고침·PTR·push 전환은 제외):
 *   (a) 문서 전체 back_forward 로드 — 카드 제목이 플레인 <a> 라 상세 진입이 풀 내비게이션이고,
 *       홈은 force-dynamic(Cache-Control: no-store)이라 Chrome bfcache 미적용 → 브라우저 뒤로가기가
 *       홈 문서를 새로 로드한다. PerformanceNavigationTiming.type === "back_forward" 로 판정하되,
 *       그 문서의 랜딩 URL(nav.name)과 현재 URL 이 같을 때만(상세로 back_forward 진입 후 탭 클릭으로
 *       홈에 push 이동한 경우를 오탐하지 않도록) + 문서당 1회 소진.
 *   (b) SPA popstate — 같은 문서 안 back/forward(예: /?q= 검색 push 후 브라우저 뒤로).
 *       ScrollManager 의 popstate 리스너가 markPopNavigation() 으로 도착 URL 을 마크하고,
 *       FeedView 마운트가 현재 URL 과 일치할 때만 1회 소진.
 *
 * 스냅샷 매체: sessionStorage(safe-storage 경유 — R2-3 규약). 탭 단위·새로고침 생존이지만
 * 새로고침은 트리거 (a)(b) 모두 아님(type=reload) → 복원되지 않는다(요구 사양).
 * Safari 등 bfcache 가 실제 동작하는 환경에선 문서가 통째로 동결·복원되므로 이 모듈은 아무 것도
 * 하지 않는다(네이티브 보존이 우선, 충돌 없음).
 */

import { ssGet, ssRemove, ssSet } from "@/lib/safe-storage";
import type { CardData } from "@/lib/types/card";

const KEY = "pbtt:feedRestore";
/** 스냅샷 유효기간 — 상세에서 장시간 체류 후 복귀 시 지나치게 낡은 피드를 되살리지 않는 상한. */
const TTL_MS = 30 * 60 * 1000;

export type FeedSnapshot = {
  v: 1;
  /** 서버 해석과 동일한 확정 검색어(trim 済). 비검색은 "". */
  q: string;
  /** 검증된 카테고리 슬러그(parseFeedCat 통과값). 전체는 "". */
  cat: string;
  /** 이탈 시점의 누적 풀 전체 — id 목록+재조회가 아니라 전체 직렬화(복원 즉시성·오프라인 내성). */
  pool: CardData[];
  /** 앱 셸 스크롤러(.root)의 scrollTop. */
  scrollTop: number;
  savedAt: number;
};

/* ── (b) SPA popstate 마크 — ScrollManager 의 popstate 핸들러가 호출 ── */
// ⚠ 모듈 스코프 상태 — 운영(단일 번들 로드)에서만 유효한 가정. dev HMR 은 모듈 재평가로
//   consumed 플래그가 리셋될 수 있음(운영 재현 불가 — 검수 기록 2026-07-04).
let popTargetUrl: string | null = null;

/** popstate 발생 시 도착 URL(pathname+search) 기록. popstate 시점엔 location 이 이미 도착지다. */
export function markPopNavigation(): void {
  if (typeof window === "undefined") return;
  popTargetUrl = window.location.pathname + window.location.search;
}

/* ── (a) 문서 단위 back_forward — 문서 수명당 1회만 검사 ── */
let docNavConsumed = false;

/**
 * 이번 FeedView 마운트가 "뒤로/앞으로 복귀"인지 판정한다. 소진형(consume-once):
 * 같은 마크·같은 문서 플래그로 두 번 복원되지 않는다(dev StrictMode 이중 실행에도 안전).
 */
export function consumeFeedRestoreTrigger(): boolean {
  if (typeof window === "undefined") return false;
  const here = window.location.pathname + window.location.search;

  // (b) SPA popstate — 마크가 있고 도착 URL 이 현재 렌더 중인 피드 URL 과 일치할 때만.
  //     (상세 간 POP 등 비-피드 마크는 URL 불일치로 무시되고, 읽는 즉시 소진된다.)
  if (popTargetUrl !== null) {
    const matched = popTargetUrl === here;
    popTargetUrl = null;
    if (matched) return true;
  }

  // (a) 문서 전체 back_forward 로드 — 문서당 1회. 랜딩 URL === 현재 URL 조건으로
  //     "back_forward 문서에서 나중에 push 로 피드 진입" 오탐 차단.
  if (!docNavConsumed) {
    docNavConsumed = true;
    try {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (nav?.type === "back_forward" && nav.name === window.location.href) {
        return true;
      }
    } catch {
      /* Performance API 미지원 — 복원 생략(degrade) */
    }
  }
  return false;
}

/** 이탈 시점 스냅샷 저장. 실패(quota 등) 시 기존 낡은 스냅샷이 남아 오복원되지 않도록 先제거. */
export function saveFeedSnapshot(
  s: Omit<FeedSnapshot, "v" | "savedAt">,
): void {
  if (s.pool.length === 0) return;
  let raw: string;
  try {
    raw = JSON.stringify({ ...s, v: 1, savedAt: Date.now() } satisfies FeedSnapshot);
  } catch {
    return; // 직렬화 실패(이론상 없음) — no-op
  }
  ssRemove(KEY);
  ssSet(KEY, raw);
}

/** 현재 URL 의 (q, cat) 과 일치하고 TTL 이내인 스냅샷만 반환. 불일치·만료·손상은 null. */
export function loadFeedSnapshot(q: string, cat: string): FeedSnapshot | null {
  const raw = ssGet(KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as FeedSnapshot;
    if (s?.v !== 1 || !Array.isArray(s.pool) || typeof s.scrollTop !== "number") {
      return null;
    }
    if (s.q !== q || s.cat !== cat) return null;
    if (Date.now() - s.savedAt > TTL_MS) {
      ssRemove(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}
