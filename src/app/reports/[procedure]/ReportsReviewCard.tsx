"use client";

/**
 * ReportsReviewCard — v11 시술 리포트 상세의 "따옴표 후기 카드".
 *
 * 레이아웃(오너 지정): 따옴표+본문(크게, 진하지 않게)이 위 → 그 아래 계정 정보(아바타·이름·작성시점)
 *   → 만족도(별점)는 우측 → 좋아요/댓글/공유 푸터.
 * 좋아요는 ReportReviewItem 과 동일하게 useCardEngagement(toggle_card_like)로 같은 card_likes 공유.
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

// 공유는 이 카드에서 직접 처리(navigator.share / 클립보드) → 훅 share 경로 미사용.
const noopShare = async (): Promise<null> => null;

export default function ReportsReviewCard({
  card,
  category,
  liked,
  demo,
  me,
  onLoginRequired,
}: {
  card: CardData;
  /** 시술 분류(테마 색 결정용 — card.category 는 글 분류라 항상 'review'). */
  category: ProcedureCategory | null;
  /** 초기 좋아요 여부(부모 prefetch). */
  liked: boolean;
  /** 작성자 나이대·성별(서버 prefetch). */
  demo?: { gender: string | null; ageDecade: number | null };
  me: EngagementMe;
  onLoginRequired: (reason: string) => void;
}) {
  const eng = useCardEngagement(card, { liked }, me, onLoginRequired, noopShare);

  const theme = categoryTheme(category);
  const author = Array.isArray(card.author) ? card.author[0] : card.author;
  const name = author?.display_name || author?.handle || "익명";
  const initial = name.trim().charAt(0) || "익";
  const avatarUrl = author?.avatar_url ?? null;
  const review = reviewOf(card);
  const satisfaction = review?.satisfaction ?? 0;
  // 줄바꿈(\n)을 단일 공백으로 합쳐 한 문단처럼 컴팩트하게.
  const body = (card.body ?? "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  const href = getQaUrl(card);

  const ageLabel = demo?.ageDecade ? (demo.ageDecade >= 50 ? "50대+" : `${demo.ageDecade}대`) : null;
  const genderLabel = demo?.gender === "female" ? "여성" : demo?.gender === "male" ? "남성" : null;
  const demoText = [ageLabel, genderLabel].filter(Boolean).join(" · ");

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
      // 공유 시트 취소(AbortError) 등 — 조용히 무시.
    }
  };

  return (
    <div className="rounded-2xl bg-[var(--surface,#fff)] p-5" style={{ wordBreak: "keep-all" }}>
      {/* 따옴표 */}
      <span
        aria-hidden
        className="block h-5 leading-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 42, color: theme.color, opacity: 0.3 }}
      >
        &ldquo;
      </span>

      {/* 본문 — 크게, 진하지 않게 */}
      {body && (
        <p className="mt-1.5 text-[15.5px] font-normal leading-[1.7] text-[var(--text)]">
          {body}
        </p>
      )}

      {/* 계정 정보(아래) + 만족도(우측) */}
      <div className="mt-4 flex items-center gap-2.5">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-[30px] w-[30px] flex-none rounded-full bg-[var(--bg-soft)] object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[12px] font-extrabold"
              style={{ background: theme.soft, color: theme.color }}
            >
              {initial}
            </span>
          )}
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[12.5px] font-bold text-[var(--text)]">{name}</span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-muted)]">
              {demoText && (
                <>
                  <span>{demoText}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <RelativeTime iso={card.created_at} />
            </span>
          </span>
        </Link>
        {review && (
          <span
            className="shrink-0 text-[13px] leading-none tracking-[1px] text-[var(--accent-save)]"
            aria-label={`만족도 ${satisfaction}점`}
          >
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} aria-hidden style={{ color: s <= satisfaction ? "var(--accent-save)" : "#E2E7EC" }}>
                ★
              </span>
            ))}
          </span>
        )}
      </div>

      {/* 푸터 — 좋아요 / 댓글 / 공유 */}
      <div className="mt-3.5 flex items-center gap-[18px] text-[12px] font-semibold text-[var(--text-muted)]">
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
