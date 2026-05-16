"use client";

/**
 * 카드 footer 버튼 행 — 좋아요 · 댓글 · 저장 (좌측) + 공유 (우측) (Phase 4-9 추출).
 *
 * v5.1+:
 *  - 좋아요: ♥ Heart + accent coral (#FF6B81)
 *  - 저장(북마크): 따뜻한 호박색 (#F59E0B amber-500, 톤앤매너)
 *  - 공유: 우측 정렬 (ml-auto)
 */
import type { CardEngagement } from "@/components/card/hooks/useCardEngagement";

type Props = {
  engagement: CardEngagement;
  commentCount: number;
  onToggleComments: () => void;
};

export default function CardActions({
  engagement,
  commentCount,
  onToggleComments,
}: Props) {
  const { like, save, share } = engagement;
  return (
    <div className="flex items-center gap-4 pt-3 text-[14px] text-[var(--text-secondary)]">
      <button
        type="button"
        onClick={like.toggle}
        aria-label={like.active ? "좋아요 취소" : "좋아요"}
        aria-pressed={like.active}
        className={
          "flex cursor-pointer items-center gap-1 transition-colors " +
          (like.active
            ? "text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:text-[var(--accent)]")
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill={like.active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={
            "h-[22px] w-[22px] transition-transform " +
            (like.active ? "like-pulse" : "")
          }
          aria-hidden
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        {like.count > 0 && <span>{like.count}</span>}
      </button>

      <button
        type="button"
        onClick={onToggleComments}
        className="flex cursor-pointer items-center gap-1 transition-colors hover:text-[var(--primary)]"
        aria-label="댓글"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[22px] w-[22px]"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {commentCount > 0 && <span>{commentCount}</span>}
      </button>

      {/* 저장(북마크) — 따뜻한 호박색 (amber-500 #F59E0B). 좌측 묶음 */}
      <button
        type="button"
        onClick={save.toggle}
        aria-label={save.active ? "저장 취소" : "저장"}
        aria-pressed={save.active}
        className={
          "flex cursor-pointer items-center gap-1 transition-colors " +
          (save.active
            ? "text-[#F59E0B]"
            : "text-[var(--text-secondary)] hover:text-[#F59E0B]")
        }
        title={save.active ? "저장 취소" : "저장"}
      >
        <svg
          viewBox="0 0 24 24"
          fill={save.active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[22px] w-[22px]"
          aria-hidden
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {save.count > 0 && <span>{save.count}</span>}
      </button>

      {/* 공유 — 우측 정렬 (ml-auto) */}
      <button
        type="button"
        onClick={() => void share.share()}
        className="ml-auto flex cursor-pointer items-center gap-1 transition-colors hover:text-[var(--primary)]"
        aria-label="공유"
        title="공유"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[22px] w-[22px]"
          aria-hidden
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        {share.count > 0 && <span>{share.count}</span>}
      </button>
    </div>
  );
}
