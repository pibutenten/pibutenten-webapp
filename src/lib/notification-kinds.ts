/**
 * 알림 kind 단일 source — NotificationsBell, NotificationsClient, NotificationPreferences 공통.
 *
 * DB notifications.kind 컬럼 enum 과 일치해야 함.
 * 추가 시: 여기 + DB enum + 알림 트리거(0086~) 모두 수정 필요.
 */

export type NotificationKind =
  | "comment"
  | "reply"
  | "like"
  | "new_ask"
  | "review_request"
  | "published";

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "comment",
  "reply",
  "like",
  "new_ask",
  "review_request",
  "published",
];

/** 종 dropdown (NotificationsBell) — 이모지 + 한 단어. 짧고 시각적. */
export const KIND_SHORT_LABEL: Record<NotificationKind, string> = {
  comment: "💬 댓글",
  reply: "↳ 답글",
  like: "❤ 좋아요",
  new_ask: "❓ 새 궁금해요",
  review_request: "🩺 검수 요청",
  published: "🚀 발행됨",
};

/** /notifications 페이지 (NotificationsClient) — 한 문장 풀 설명. */
export const KIND_LONG_LABEL: Record<NotificationKind, string> = {
  comment: "내 글에 댓글을 남겼어요",
  reply: "내 댓글에 답글을 남겼어요",
  like: "내 글에 좋아요를 눌렀어요",
  new_ask: "새 궁금해요 글이 올라왔어요",
  review_request: "새 검수 요청이 도착했어요",
  published: "내 글이 발행되었어요",
};

/** 아이콘만 따로 — NotificationsClient timeline. */
export const KIND_ICON: Record<NotificationKind, string> = {
  comment: "💬",
  reply: "↳",
  like: "❤",
  new_ask: "❓",
  review_request: "🩺",
  published: "🚀",
};
