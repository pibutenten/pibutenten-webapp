/**
 * 시술후기 단일선택 옵션 — 저장 슬러그 ↔ 표시 라벨 SSOT.
 *
 * 폼(ReviewForm)·리포트(procedure-report / ProcedureReportCard) 양쪽이 여기서 import.
 * 슬러그는 DB CHECK(0213 procedure_reviews_downtime_chk / _effect_onset_chk)와 정확히 일치.
 * (CLAUDE.md §5 동기화 페어: zod enum ↔ DB CHECK ↔ 본 상수)
 */
export type ReviewChoice = { value: string; label: string };

/** 다운타임 — 일상 복귀 소요. (E: 첫 라벨 "바로 가능"→"없음", slug same_day 불변) */
export const DOWNTIME_OPTIONS: ReviewChoice[] = [
  { value: "same_day", label: "없음" },
  { value: "days_1_2", label: "1~2일" },
  { value: "days_3_5", label: "3~5일" },
  { value: "week_1", label: "약 1주" },
  { value: "weeks_2_plus", label: "2주 이상" },
];

/**
 * 다운타임 구간별 대표 일수 — 평균 계산용 day 코딩 SSOT (C-1, DOWNTIME_OPTIONS 순서 정렬).
 *   없음 0 / 1~2일 1.5 / 3~5일 4 / 약 1주 7 / 2주 이상 16.
 * 평균일 = Σ(dist[i] × DOWNTIME_DAYS[i]) / answered.
 */
export const DOWNTIME_DAYS = [0, 1.5, 4, 7, 16];

/** 효과시기 — 효과를 가장 크게 느낀 시점. */
export const EFFECT_ONSET_OPTIONS: ReviewChoice[] = [
  { value: "immediate", label: "시술 직후" },
  { value: "weeks_1_2", label: "1~2주 후" },
  { value: "month_1", label: "한 달쯤 후" },
  { value: "months_2_3", label: "두세 달 후" },
  { value: "still_watching", label: "효과 못 느낌" },
];

/** 효과 칩의 '효과 없음' 라벨 — 리포트에서 일반 효과 목록과 분리. */
export const EFFECT_NONE_LABEL = "없음";

/** 시술 직후 반응(reactions) 멀티칩. 한글 라벨 그대로 저장(effect_areas 규약, CHECK 없음). */
export const REACTION_OPTIONS = ["부기", "멍", "딱지", "붉어짐·홍조", "화끈거림·열감", "멍울·뭉침"] as const;
export const REACTION_NONE_LABEL = "없음";
/** 칩 렌더·zod enum 용 전체(6 + 없음). */
export const REACTION_ALL = [...REACTION_OPTIONS, REACTION_NONE_LABEL] as const;
/** REACTION_OPTIONS 인덱스 매칭 칩 색(6색). 없음은 회색 별도. */
export const REACTION_COLORS = ["#F4B8A0", "#B0A0DE", "#E0C088", "#F2A9C0", "#FFAF97", "#8FD4C8"];
