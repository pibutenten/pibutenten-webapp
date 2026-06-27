/**
 * 시계열 체크인 딥링크 폼 공유 상수·타입 (isomorphic — server page + client form).
 *
 * 시점(timepoint) 값은 DB CHECK(review_checkin.timepoint / scheduled_notification.timepoint)
 *   와 정확히 일치한다. day0 는 통합 작성 시 즉시 입력되므로 딥링크(예약 알림) 대상이 아니다
 *   → 딥링크 폼은 week1 / month1 / month4 만 다룬다(0296 scheduled_notification CHECK 와 동일).
 *
 * next/headers 등 server 전용 API 를 쓰지 않으므로 client 에서도 안전하게 import 가능.
 */

/** 딥링크로 진입 가능한 시점 — day0 제외(즉시 입력이라 예약 알림 없음). */
export const CHECKIN_TIMEPOINTS = ["week1", "month1", "month4"] as const;
export type CheckinTimepoint = (typeof CHECKIN_TIMEPOINTS)[number];

/** 시점별 맥락 문구 — "○주/○달 지난 지금 어떠세요?" 톤. */
export const TIMEPOINT_LABELS: Record<CheckinTimepoint, { short: string; elapsed: string }> = {
  week1: { short: "1주 후", elapsed: "1주" },
  month1: { short: "1달 후", elapsed: "1달" },
  month4: { short: "4달 후", elapsed: "4달" },
};

/** 서버 page → 클라이언트 폼 prefill(이미 입력한 시점이면 기존 값). */
export type CheckinPrefill = {
  satisfaction: number | null;
  pain: number | null;
  changedPoints: string[];
};
