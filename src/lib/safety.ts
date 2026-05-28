/**
 * 안전(자살·자해) 신호 검출 SSOT — 보안 2.5차 L3 + 댓글 검수 후속 (2026-05-28).
 *
 * 키워드 사전은 `lib/content-screening-dict.ts::SUICIDE_SELF_HARM_KEYWORDS` 에 단일 출처.
 * 사용처: CardEditor / WriteClient / CommentForm — 모두 본 헬퍼만 import.
 *
 * 정책: 차단이 아닌 안내. 사용자에게 109 / 1577-0199 / 1388 안내 모달 1회 노출.
 */

import { SUICIDE_SELF_HARM_KEYWORDS } from "./content-screening-dict";

/**
 * 자살·자해 신호 검출 — 한 번 호출.
 *
 * 키워드는 모두 한국어라 `toLowerCase` 가 사실상 no-op 이지만, 향후 영문 키워드 추가
 * 가능성에 대비해 양쪽 모두 lower 처리.
 */
export function detectSuicideRisk(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SUICIDE_SELF_HARM_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/** 안전 메시지 모달 본문 — 모든 호출처가 동일 문구 사용. */
export const SAFETY_DIALOG_TITLE = "혹시 도움이 필요하신가요?";
export const SAFETY_DIALOG_DESCRIPTION =
  "입력하신 내용 중 어려운 시간을 보내고 계신 것 같은 표현이 보였어요.\n\n" +
  "도움을 받으실 수 있는 곳:\n" +
  "• 자살예방상담전화 109 (24시간)\n" +
  "• 정신건강위기상담 1577-0199\n" +
  "• 청소년상담 1388\n\n" +
  "그대로 작성을 계속하실 수 있고, 잠시 멈추고 도움받기를 선택하실 수도 있어요.";
