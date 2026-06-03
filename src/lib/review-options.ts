/**
 * 시술후기 단일선택 옵션 — 저장 슬러그 ↔ 표시 라벨 SSOT.
 *
 * 폼(ReviewForm)·리포트(procedure-report / ProcedureReportCard) 양쪽이 여기서 import.
 * 슬러그는 DB CHECK(0213 procedure_reviews_downtime_chk / _effect_onset_chk)와 정확히 일치.
 * (CLAUDE.md §5 동기화 페어: zod enum ↔ DB CHECK ↔ 본 상수)
 */
export type ReviewChoice = { value: string; label: string };

/** 다운타임 — 일상 복귀 소요. */
export const DOWNTIME_OPTIONS: ReviewChoice[] = [
  { value: "same_day", label: "바로 가능" },
  { value: "days_1_2", label: "1~2일" },
  { value: "days_3_5", label: "3~5일" },
  { value: "week_1", label: "약 1주" },
  { value: "weeks_2_plus", label: "2주 이상" },
];

/** 효과시기 — 효과를 가장 크게 느낀 시점. */
export const EFFECT_ONSET_OPTIONS: ReviewChoice[] = [
  { value: "immediate", label: "시술 직후" },
  { value: "weeks_1_2", label: "1~2주 후" },
  { value: "month_1", label: "한 달쯤" },
  { value: "months_2_3", label: "2~3달 후" },
  { value: "still_watching", label: "아직 지켜보는 중" },
];

/** 효과 칩의 '효과 없음' 라벨 — 리포트에서 일반 효과 목록과 분리. */
export const EFFECT_NONE_LABEL = "없음";
