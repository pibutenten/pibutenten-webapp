"use client";

/**
 * ReportReviewItem — 시술 리포트 카드의 개별 후기 한 줄(미니).
 *
 * 좋아요는 단독 글 페이지와 **같은 card_likes 행**을 쓰도록 useCardEngagement
 * (toggle_card_like RPC)을 그대로 재사용한다. 저장/공유는 사용하지 않음(noopShare).
 *   - (a) 작성자 행(닉네임·별점·상대시간) = 단독 글 URL 로 이동하는 <Link>.
 *   - (b) 좋아요 버튼 = Link 밖, stopPropagation 으로 네비/본문펼침과 분리.
 *   - (c) 본문 = onClick 으로 인라인 펼침 토글(부모 state). Link 아님.
 *
 * liked 초기값은 부모가 fetchViewerStates 로 미리 받은 값을 prefetch 로 전달 →
 * 훅이 per-row 자체 조회(N쿼리)를 하지 않는다.
 */
import Link from "next/link";
import type { CardData } from "@/components/Card";
import type { ReviewSummaryData } from "@/lib/types/card";
import { getQaUrl } from "@/lib/card-url";
import RelativeTime from "@/components/RelativeTime";
import {
  useCardEngagement,
  type EngagementMe,
} from "@/components/card/hooks/useCardEngagement";

function reviewOf(card: CardData): ReviewSummaryData | null {
  const pr = card.procedure_review;
  const r = Array.isArray(pr) ? pr[0] : pr;
  return r ?? null;
}

// 저장/공유 미사용 — 좋아요 전용. 훅 시그니처 충족용 no-op.
const noopShare = async (): Promise<null> => null;

export default function ReportReviewItem({
  card,
  liked,
  me,
  onLoginRequired,
  expanded,
  onToggleBody,
}: {
  card: CardData;
  /** 초기 좋아요 여부(부모 prefetch). */
  liked: boolean;
  me: EngagementMe;
  onLoginRequired: (reason: string) => void;
  /** 본문 인라인 펼침 여부(부모 state). */
  expanded: boolean;
  onToggleBody: () => void;
}) {
  // 단독 카드와 동일한 좋아요 토글(toggle_card_like) 재사용. save/share 는 무시.
  const eng = useCardEngagement(card, { liked }, me, onLoginRequired, noopShare);

  const author = Array.isArray(card.author) ? card.author[0] : card.author;
  const name = author?.display_name || author?.handle || "익명";
  const review = reviewOf(card);
  const body = (card.body ?? "").trim();

  return (
    <li className="py-3 first:pt-0">
      {/* 작성자 행 — 좌: Link(닉네임·별점·상대시간) / 우: 좋아요(Link 밖) */}
      <div className="mb-1 flex items-center justify-between gap-2 text-[11.5px] text-[var(--text-muted)]">
        <Link href={getQaUrl(card)} className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold text-[var(--text-secondary)]">{name}</span>
          {review && (
            <span
              className="shrink-0 text-[11px] leading-none tracking-[0.5px]"
              aria-label={`만족도 ${review.satisfaction}점`}
            >
              {[1, 2, 3, 4, 5].map((s) => (
                <span
                  key={s}
                  aria-hidden
                  style={{ color: s <= (review.satisfaction || 0) ? "var(--accent-save)" : "#DDE2E7" }}
                >
                  ★
                </span>
              ))}
            </span>
          )}
          <RelativeTime iso={card.created_at} className="ml-0.5 shrink-0" />
        </Link>

        {/* 좋아요 — CardActions 하트와 동일 스타일을 작게(h-[18px]) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            eng.like.toggle();
          }}
          aria-label={eng.like.active ? "좋아요 취소" : "좋아요"}
          aria-pressed={eng.like.active}
          className={
            "flex shrink-0 cursor-pointer items-center gap-1 transition-colors " +
            (eng.like.active
              ? "text-[var(--accent)]"
              : "text-[var(--text-icon)] hover:text-[var(--accent)]")
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill={eng.like.active ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {eng.like.count > 0 && <span className="text-[11px]">{eng.like.count}</span>}
        </button>
      </div>

      {/* 본문 — 클릭 시 인라인 펼침 토글(Link 아님) */}
      {body && (
        <p
          onClick={onToggleBody}
          className={
            "cursor-pointer whitespace-pre-wrap text-[13px] leading-[1.55] text-[var(--text)]" +
            (expanded ? "" : " line-clamp-2")
          }
        >
          {body}
        </p>
      )}
    </li>
  );
}
