/**
 * 신고 사유 SSOT (2026-06-26) — 신고 폼(/report)·앱 신고 모달·관리자 큐·서버 zod 검증이 **모두 이 파일을 참조**.
 *
 * 이전엔 같은 9종 사유가 4곳에 따로 정의되어 한글 라벨이 제각각이었다
 *   (예: harassment 가 "욕설·괴롭힘·혐오 표현" / "괴롭힘·욕설·혐오" / "욕설/괴롭힘" 3가지).
 * 사유 추가·문구 변경은 이제 본 파일만 고치면 전 화면·API 검증에 일관 반영된다.
 *
 * - value : DB content_reports.reason / API reason enum 과 1:1 (절대 변경 금지 — 데이터 정합).
 * - label : 전 화면 공통 표준 한글 라벨.
 * - hint  : 상세 신고 폼(/report)에서 부가 설명으로 노출(선택).
 */

export const REPORT_REASONS = [
  { value: "spam", label: "스팸·도배" },
  { value: "harassment", label: "욕설·괴롭힘·혐오 표현" },
  {
    value: "medical_ad",
    label: "의료광고 위반",
    hint: "치료경험담·비포애프터·비교광고·부작용 누락·사전심의 미통과",
  },
  { value: "false_info", label: "허위·과장 의료 정보" },
  { value: "personal_info", label: "개인정보 노출" },
  { value: "csam", label: "아동 성착취 콘텐츠", hint: "즉시 처리 대상" },
  { value: "self_harm", label: "자해·자살 조장 콘텐츠" },
  { value: "copyright", label: "저작권·초상권 침해" },
  { value: "other", label: "기타" },
] as const satisfies readonly { value: string; label: string; hint?: string }[];

/** 신고 사유 값 유니온 (DB·API 정합). */
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

/** zod `z.enum` 등 value 검증용 튜플 (REPORT_REASONS 에서 파생 — 단일 출처). */
export const REPORT_REASON_VALUES = REPORT_REASONS.map((r) => r.value) as [
  ReportReason,
  ...ReportReason[],
];

/** value → 표준 라벨 (관리자 큐 등 라벨만 필요한 곳). */
export const REPORT_REASON_LABEL = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
) as Record<ReportReason, string>;
