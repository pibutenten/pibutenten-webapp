/**
 * 비로그인 사용자 흥미 점수 누적 시스템 (2026-05-21 신설, 2026-05-22 v2 개선, 2026-05-23 v3 조정).
 *
 * 정책:
 *   - 비로그인 사용자가 사이트와 인터랙션할수록 점수 누적 (sessionStorage).
 *   - 임계점(THRESHOLD) 도달 시 한 번만 회원가입 권유 모달 트리거 (custom event emit).
 *   - 닫음 → localStorage 에 {at, days} 저장 → 기간 경과 후 재노출.
 *     v5(2026-07-03): 닫기 종류별 분리 — "나중에 할게요"=3일 / 바깥클릭·ESC·CTA 이동=1일.
 *     (구 v4 는 어떤 닫기든 7일 — 실수성 닫힘에 과한 잠금이라 소프트월이 죽은 것처럼 보였음.)
 *   - 로그인 사용자에게는 no-op (점수 누적 자체 안 함).
 *   - custom event detail 에 reason 동봉 → 모달이 reason 별 카피 선택 가능.
 *
 * 점수표 변천:
 *   - Phase 2 (초기): 임계점 10
 *   - v2 (2026-05-22): 10 → 6 (사용자: "한참 읽었는데 안 뜸")
 *   - v3 (2026-05-23): 6 → 15 (사용자: "조금 빠른듯. 충분히 경험한 다음에 요청하는게 수락 가능성↑")
 *   - v4 (2026-06-30): 피드/리포트 분리 (콘텐츠 모델이 피드·리포트로 분기됨에 따라).
 *       리포트(review_summary, 시술 리포트)는 정보 밀도가 높은 핵심 콘텐츠 →
 *       1건당 +8 (리포트 2건 = 16 ≥ 15 → 트리거). 일반 피드 카드는 +2 유지.
 *
 *   리포트 view 1개 (시술 리포트)           — +8  (핵심 콘텐츠, 높은 정보 밀도)
 *   일반 피드 카드 view 1개 (Q&A·후기 등)    — +2
 *   카드 펼침 (더보기 클릭)                — +2  (깊이 읽음)
 *   영상 보러가기 클릭                     — +3  (외부 의도)
 *   검색 1회                              — +3  (명확한 의도 — AppShell 헤더 제출 배선, v5)
 *   카테고리 chip 클릭                     — +1  (탐색)
 *   태그 클릭                             — +2  (깊은 탐색)
 *   페이지 navigate                       — +1
 *   2분 이상 (visible 누적)                — +3
 *   5분 이상 (visible 누적)                — +4
 *   10분 이상 (visible 누적)               — +5
 *
 * 임계점: 누적 ≥ 15점 → 모달 트리거 (한 세션 1회).
 *   대표 도달 경로:
 *     - 리포트 2건 깊이 read(+16) = 16
 *     - 리포트 1건(+8) + 검색 1번(+3) + 피드 카드 2개(+4) = 15
 *     - 5분 머묾(+4) + 피드 카드 3개 view(+6) + 영상(+3) + 펼침(+2) = 15
 *
 * 좋아요/저장/공유/댓글 시도 시 = 이미 LoginPromptDialog 가 자체 트리거 (별도 처리).
 */

import { lsGet, lsRemove, ssGet, ssSet } from "@/lib/safe-storage";

export type EngagementReason =
  | "report-view"
  | "card-view"
  | "card-expand"
  | "video-click"
  | "search"
  | "chip-click"
  | "tag-click"
  | "navigate"
  | "dwell-2min"
  | "dwell-5min"
  | "dwell-10min";

export const SCORE_TABLE: Record<EngagementReason, number> = {
  "report-view": 8,
  "card-view": 2,
  "card-expand": 2,
  "video-click": 3,
  "search": 3,
  "chip-click": 1,
  "tag-click": 2,
  "navigate": 1,
  "dwell-2min": 3,
  "dwell-5min": 4,
  "dwell-10min": 5,
};

export const THRESHOLD = 15;
const SS_SCORE_KEY = "pibutenten:engagement-score";
const SS_TRIGGERED_KEY = "pibutenten:engagement-triggered";
const LS_DISMISSED_KEY = "pibutenten:engagement-dismissed-at";
const LEGACY_RESET_DAYS = 7; // 구(v4) 단일 7일 — 옛 localStorage 숫자값 호환 전용
const EVENT_NAME = "pibutenten:engagement-threshold";

export type EngagementEventDetail = {
  score: number;
  reason: EngagementReason;
};

/**
 * 비로그인 사용자 흥미 신호 누적.
 * @param reason 신호 종류 (SCORE_TABLE key)
 * @returns 누적 후 새 점수 (또는 -1 if SSR / already triggered / dismissed)
 */
export function addEngagement(reason: EngagementReason): number {
  if (typeof window === "undefined") return -1;

  // 이미 본 세션에서 모달 트리거됐으면 점수 누적 안 함.
  // safe-storage (R2-3): 인앱 브라우저 sandbox 에서 storage 가 throw 해도 크래시 없이
  //   점수 누적만 조용히 무력화 (소프트월 미발동 — UX 무해).
  if (ssGet(SS_TRIGGERED_KEY)) return -1;

  // 잠금기간(닫기 종류별 — v5) 안이면 점수 누적 안 함.
  const dismissed = (() => {
    try {
      const raw = lsGet(LS_DISMISSED_KEY);
      if (!raw) return null;
      // v5: JSON {at, days}. v4 이하: 숫자 문자열(단일 7일) 호환.
      if (raw.startsWith("{")) {
        const p = JSON.parse(raw) as { at?: number; days?: number };
        if (typeof p?.at !== "number" || !Number.isFinite(p.at)) return null;
        return { at: p.at, days: typeof p.days === "number" ? p.days : 1 };
      }
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? { at: n, days: LEGACY_RESET_DAYS } : null;
    } catch {
      return null;
    }
  })();
  if (dismissed) {
    const ageDays = (Date.now() - dismissed.at) / (1000 * 60 * 60 * 24);
    if (ageDays < dismissed.days) return -1;
    // 기간 경과 — 잠금 해제
    lsRemove(LS_DISMISSED_KEY);
  }

  const cur = Number(ssGet(SS_SCORE_KEY) ?? 0);
  const next = cur + (SCORE_TABLE[reason] ?? 0);
  ssSet(SS_SCORE_KEY, String(next));

  if (next >= THRESHOLD) {
    ssSet(SS_TRIGGERED_KEY, "1");
    window.dispatchEvent(
      new CustomEvent<EngagementEventDetail>(EVENT_NAME, {
        detail: { score: next, reason },
      }),
    );
  }
  return next;
}

/**
 * 모달 닫힘 시 호출 — days 후 재노출 (v5: 닫기 종류별).
 *   "나중에 할게요"(명시 거절)=3 / 바깥클릭·ESC·CTA 이동(실수성·이동성)=1.
 */
export function dismissEngagementPrompt(days: number = 1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LS_DISMISSED_KEY,
      JSON.stringify({ at: Date.now(), days }),
    );
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
