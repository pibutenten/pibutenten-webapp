/**
 * 비로그인 사용자 흥미 점수 누적 시스템 (2026-05-21).
 *
 * 정책:
 *   - 비로그인 사용자가 사이트와 인터랙션할수록 점수 누적 (sessionStorage).
 *   - 임계점(THRESHOLD) 도달 시 한 번만 회원가입 권유 모달 트리거 (custom event emit).
 *   - "나중에" 닫음 → localStorage 에 dismiss timestamp 저장 → 일주일 후 재노출 가능.
 *   - 로그인 사용자에게는 no-op (점수 누적 자체 안 함).
 *
 * 점수표 (Phase 2):
 *   카드 view 1개 (4초 이상 머묾 또는 펼침) — +1  (기본)
 *   카드 펼침 (더보기 클릭)                — +2  (깊이 읽음)
 *   영상 보러가기 클릭                     — +3  (외부 의도)
 *   검색 1회 (q 입력 후 결과 본 경우)       — +3  (명확한 의도)
 *   카테고리 chip 클릭                     — +1  (탐색)
 *   태그 클릭 (/topics/{tag})              — +2  (깊은 탐색)
 *   페이지 navigate 1회                    — +1  (다회 페이지)
 *   5분 이상 사이트 머묾                    — +5  (강한 시간 신호)
 *   10분 이상 머묾 (5분과 별개로 추가)      — +5  (매우 강한 신호)
 *
 * 임계점: 누적 ≥ 10점 → 모달 트리거 (한 세션 1회).
 *
 * 좋아요/저장/공유/댓글 시도 시 = 이미 LoginPromptDialog 가 자체 트리거 (별도 처리).
 */

export type EngagementReason =
  | "card-view"
  | "card-expand"
  | "video-click"
  | "search"
  | "chip-click"
  | "tag-click"
  | "navigate"
  | "dwell-5min"
  | "dwell-10min";

export const SCORE_TABLE: Record<EngagementReason, number> = {
  "card-view": 1,
  "card-expand": 2,
  "video-click": 3,
  "search": 3,
  "chip-click": 1,
  "tag-click": 2,
  "navigate": 1,
  "dwell-5min": 5,
  "dwell-10min": 5,
};

export const THRESHOLD = 10;
const SS_SCORE_KEY = "pibutenten:engagement-score";
const SS_TRIGGERED_KEY = "pibutenten:engagement-triggered";
const LS_DISMISSED_KEY = "pibutenten:engagement-dismissed-at";
const RESET_AFTER_DAYS = 7;
const EVENT_NAME = "pibutenten:engagement-threshold";

/**
 * 비로그인 사용자 흥미 신호 누적.
 * @param reason 신호 종류 (SCORE_TABLE key)
 * @returns 누적 후 새 점수 (또는 -1 if SSR / already triggered / dismissed)
 */
export function addEngagement(reason: EngagementReason): number {
  if (typeof window === "undefined") return -1;

  // 이미 본 세션에서 모달 트리거됐으면 점수 누적 안 함.
  if (sessionStorage.getItem(SS_TRIGGERED_KEY)) return -1;

  // 일주일 안에 dismiss 했으면 점수 누적 안 함.
  const dismissedAt = (() => {
    try {
      const raw = localStorage.getItem(LS_DISMISSED_KEY);
      return raw ? Number(raw) : 0;
    } catch {
      return 0;
    }
  })();
  if (dismissedAt > 0) {
    const ageDays = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    if (ageDays < RESET_AFTER_DAYS) return -1;
    // 일주일 지났으면 dismiss 해제
    try {
      localStorage.removeItem(LS_DISMISSED_KEY);
    } catch {
      /* ignore */
    }
  }

  const cur = Number(sessionStorage.getItem(SS_SCORE_KEY) ?? 0);
  const next = cur + (SCORE_TABLE[reason] ?? 0);
  sessionStorage.setItem(SS_SCORE_KEY, String(next));

  if (next >= THRESHOLD) {
    sessionStorage.setItem(SS_TRIGGERED_KEY, "1");
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { score: next } }));
  }
  return next;
}

/** "나중에" 버튼 클릭 시 호출 — 일주일 후 재노출. */
export function dismissEngagementPrompt(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_DISMISSED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** 회원가입/로그인 성공 후 점수 리셋 (선택 — session 단위라 거의 무관). */
export function resetEngagement(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SS_SCORE_KEY);
    sessionStorage.removeItem(SS_TRIGGERED_KEY);
    localStorage.removeItem(LS_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
}

export const ENGAGEMENT_EVENT = EVENT_NAME;
