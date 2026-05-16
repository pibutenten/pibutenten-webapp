"use client";

/**
 * 카드 간 broadcast 이벤트 훅 — Phase 4-2 추출.
 *
 * Card.tsx 곳곳에 산재해 있던 3개 window event 패턴을 단일 훅으로 통합.
 *
 *  1) pibutenten:comments-opened  — 모바일에서 다른 카드 댓글창 열림 알림
 *     - 수신: 본 카드가 listen 해서 자신의 댓글창 닫음 (focus single)
 *     - 발사: 본 카드 댓글 열 때 (모바일 768 이하에서만)
 *
 *  2) pibutenten:card-deleted     — 본 카드 삭제 알림
 *     - 수신: Feed.tsx (피드에서 즉시 제거)
 *     - 발사: 본 카드 삭제 완료 시 (Phase 2에서 'qa-deleted' 오타 수정됨)
 *
 *  3) pibutenten:card-viewed      — 본 카드 조회 알림
 *     - 수신: InstallPrompt.tsx (5회 이상 시 PWA 설치 안내)
 *     - 발사: card_views INSERT 성공 시
 *
 * cardId 의존성: 다른 카드와 본 카드를 구분하기 위해 사용 (#1).
 */
import { useCallback, useEffect } from "react";

type CommentsOpenedDetail = { cardId: number };
type CardDeletedDetail = { id: number };

export const CARD_BUS_EVENTS = {
  COMMENTS_OPENED: "pibutenten:comments-opened",
  CARD_DELETED: "pibutenten:card-deleted",
  CARD_VIEWED: "pibutenten:card-viewed",
} as const;

const MOBILE_BREAKPOINT = 768;

export type CardBusOptions = {
  /**
   * 다른 카드(cardId 不一致)가 댓글창을 열었을 때 호출됨.
   * 본 카드 댓글창을 닫는 핸들러 등록 — Card.tsx에서 setCommentsOpen(false) 호출.
   */
  onOtherCommentsOpened?: () => void;
};

export type CardBusEmitters = {
  /**
   * 본 카드가 댓글창을 막 열었음을 알린다 — 모바일에서만 broadcast.
   * 데스크탑(>768px)은 병렬 편집을 허용하므로 발사 X.
   */
  emitCommentsOpened: () => void;
  /** 본 카드 삭제 완료 — Feed.tsx 가 listen 해서 목록에서 제거. */
  emitCardDeleted: () => void;
  /** 본 카드 조회 완료 — InstallPrompt 가 listen. */
  emitCardViewed: () => void;
};

export function useCardBus(
  cardId: number,
  options: CardBusOptions = {},
): CardBusEmitters {
  const { onOtherCommentsOpened } = options;

  // 1) 다른 카드 comments-opened 수신
  useEffect(() => {
    if (!onOtherCommentsOpened) return;
    function handler(e: Event) {
      const detail = (e as CustomEvent<CommentsOpenedDetail>).detail;
      if (detail && detail.cardId !== cardId) {
        onOtherCommentsOpened!();
      }
    }
    window.addEventListener(CARD_BUS_EVENTS.COMMENTS_OPENED, handler);
    return () =>
      window.removeEventListener(CARD_BUS_EVENTS.COMMENTS_OPENED, handler);
  }, [cardId, onOtherCommentsOpened]);

  const emitCommentsOpened = useCallback(() => {
    if (typeof window === "undefined") return;
    // 모바일에서만 broadcast — 데스크탑은 병렬 열기 허용
    if (window.innerWidth > MOBILE_BREAKPOINT) return;
    window.dispatchEvent(
      new CustomEvent<CommentsOpenedDetail>(CARD_BUS_EVENTS.COMMENTS_OPENED, {
        detail: { cardId },
      }),
    );
  }, [cardId]);

  const emitCardDeleted = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent<CardDeletedDetail>(CARD_BUS_EVENTS.CARD_DELETED, {
        detail: { id: cardId },
      }),
    );
  }, [cardId]);

  const emitCardViewed = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(CARD_BUS_EVENTS.CARD_VIEWED));
  }, []);

  return { emitCommentsOpened, emitCardDeleted, emitCardViewed };
}
