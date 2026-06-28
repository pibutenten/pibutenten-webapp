"use client";

/**
 * ReportsNewReviewCard — v11 시술 리포트 상세의 "따옴표 후기 카드"(.rev).
 *
 * ReportReviewItem 의 좋아요 로직을 그대로 차용한다(같은 card_likes 행 공유,
 * toggle_card_like RPC). 디자인은 v11-detail.html 의 .rev 박스로 재현:
 *   - 작성자 행(아바타 이니셜·이름·별점·상대시간) = 단독 글 URL 로 가는 <Link>.
 *   - 큰 따옴표 글리프(Georgia serif, theme.color, opacity .35).
 *   - 본문(card.body, 줄바꿈은 공백으로 병합).
 *   - 푸터(좋아요 / 댓글 / 공유) — 좋아요·공유 버튼은 stopPropagation 으로 네비와 분리.
 *
 * liked 초기값은 부모 prefetch — 훅이 per-row 자체 조회(N쿼리)를 하지 않는다.
 */
import Link from "next/link";
import type { CardData } from "@/components/Card";
import type { ReviewSummaryData } from "@/lib/types/card";
import { getQaUrl } from "@/lib/card-url";
import { showToast } from "@/lib/toast";
import RelativeTime from "@/components/RelativeTime";
import { categoryTheme } from "@/lib/procedure-theme";
import type { ProcedureCategory } from "@/lib/procedure-report";
import {
  useCardEngagement,
  type EngagementMe,
} from "@/components/card/hooks/useCardEngagement";

function reviewOf(card: CardData): ReviewSummaryData | null {
  const pr = card.procedure_review;
  const r = Array.isArray(pr) ? pr[0] : pr;
  return r ?? null;
}

// 공유는 이 카드에서 직접 처리(navigator.share / 클립보드) → 훅 share 경로 미사용. no-op.
const noopShare = async (): Promise<null> => null;

export default function ReportsNewReviewCard({
  card,
  liked,
  me,
  onLoginRequired,
}: {
  card: CardData;
  /** 초기 좋아요 여부(부모 prefetch). */
  liked: boolean;
  me: EngagementMe;
  onLoginRequired: (reason: string) => void;
}) {
  // 단독 카드와 동일한 좋아요 토글(toggle_card_like) 재사용. save/share 는 무시.
  const eng = useCardEngagement(card, { liked }, me, onLoginRequired, noopShare);

  const theme = categoryTheme(card.category as ProcedureCategory | null);
  const author = Array.isArray(card.author) ? card.author[0] : card.author;
  const name = author?.display_name || author?.handle || "익명";
  const initial = name.trim().charAt(0) || "익";
  const review = reviewOf(card);
  const satisfaction = review?.satisfaction ?? 0;
  // 줄바꿈(\n)을 단일 공백으로 합쳐 한 문단처럼 컴팩트하게.
  const body = (card.body ?? "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  const href = getQaUrl(card);

  // 공유 — navigator.share 가능 시 사용, 아니면 클립보드 복사 + toast.
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const url =
      typeof window !== "undefined"
        ? new URL(href, window.location.origin).toString()
        : href;
    try {
      const nav =
        typeof navigator !== "undefined"
          ? (navigator as Navigator & {
              share?: (d: { title?: string; url?: string }) => Promise<void>;
            })
          : null;
      if (nav?.share) {
        await nav.share({ title: card.title ?? name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast("링크를 복사했어요");
    } catch {
      // 사용자가 공유 시트를 닫은 경우(AbortError) 등 — 조용히 무시.
    }
  };

  return (
    <div
      className="rounded-2xl bg-[var(--surface,#fff)] p-[18px]"
      style={{ wordBreak: "keep-all" }}
    >
      {/* 작성자 행 — 단독 글로 가는 Link(아바타·이름·별점·상대시간) */}
      <Link href={href} className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[12px] font-extrabold"
          style={{ background: theme.soft, color: theme.color }}
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-bold text-[var(--text)]">
            {name}
          </span>
          <span className="mt-px flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            {review && (
              <span
                className="leading-none tracking-[0.5px] text-[var(--accent-save)]"
                aria-label={`만족도 ${satisfaction}점`}
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <span
                    key={s}
                    aria-hidden
                    style={{ color: s <= satisfaction ? "var(--accent-save)" : "#E9E3E6" }}
                  >
                    ★
                  </span>
                ))}
              </span>
            )}
            <RelativeTime iso={card.created_at} className="shrink-0" />
          </span>
        </span>
      </Link>

      {/* 큰 따옴표 글리프 */}
      <span
        aria-hidden
        className="mt-3 mb-1.5 block h-5 font-serif text-[40px] leading-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: theme.color, opacity: 0.35 }}
      >
        &ldquo;
      </span>

      {/* 본문 */}
      {body && (
        <p className="text-[14px] font-medium leading-[1.6] text-[var(--text)]">
          {body}
        </p>
      )}

      {/* 푸터 — 좋아요 / 댓글 / 공유 */}
      <div className="mt-3.5 flex items-center gap-[18px] text-[12px] font-semibold text-[var(--text-muted)]">
        {/* 좋아요 — Link 밖, stopPropagation */}
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
            "flex cursor-pointer items-center gap-[5px] transition-colors " +
            (eng.like.active ? "text-[#FF6B81]" : "hover:text-[var(--accent)]")
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill={eng.like.active ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[17px] w-[17px]"
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {eng.like.count > 0 && <span>{eng.like.count}</span>}
        </button>

        {/* 댓글 — 단독 글로 이동 */}
        <Link
          href={href}
          className="flex items-center gap-[5px] transition-colors hover:text-[var(--accent)]"
          aria-label="댓글"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[17px] w-[17px]"
            aria-hidden
          >
            <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5Z" />
          </svg>
          {(card.comment_count ?? 0) > 0 && <span>{card.comment_count}</span>}
        </Link>

        {/* 공유 — 우측 정렬, stopPropagation */}
        <button
          type="button"
          onClick={handleShare}
          aria-label="공유"
          className="ml-auto flex cursor-pointer items-center transition-colors hover:text-[var(--accent)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[17px] w-[17px]"
            aria-hidden
          >
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
          </svg>
        </button>
      </div>
    </div>
  );
}
