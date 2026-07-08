"use client";

/**
 * ReportsReviewCard — 시술 리포트 상세의 "따옴표 후기 카드".
 *
 * 2026-07-08 UI 개편 Phase 2-2 (시안 2d-리포트-2): 큰 인용부호(#B8D4E8) + 본문 →
 * 프로필 줄(사진 44px·이름 볼드 / 아래 나이대·성별·상대시각 회색) ‖ 우측 별점(#FFC93C) →
 * 하단 좋아요·댓글 수(회색). 공유 없음(시안대로). 카드 라운드 16px(명세)·흰 배경.
 *
 * 배선(보존): 좋아요 useCardEngagement(toggle_card_like — 같은 card_likes 공유, liked 초기값
 * 부모 prefetch) / 인라인 CommentsBlock 토글 / 프로필 줄 → getQaUrl 원문 링크.
 * 댓글 수(D6): card.comment_count 는 서버(page.tsx·/api/reports/../reviews)가 comments
 * visible GROUP BY 집계를 병합한 실값 — 초기 commentCount 로 주입, 이후 CommentsBlock
 * onCountChange 가 실시간 갱신.
 */
import { useState } from "react";
import Link from "next/link";
import type { CardData } from "@/components/Card";
import type { ReviewSummaryData } from "@/lib/types/card";
import { getQaUrl } from "@/lib/card-url";
import CommentsBlock from "@/components/comments/CommentsBlock";
import RelativeTime from "@/components/RelativeTime";
import { categoryTheme } from "@/lib/procedure-theme";
import type { ProcedureCategory } from "@/lib/procedure-report";
import { IconStar } from "@/components/icons";
import {
  useCardEngagement,
  type EngagementMe,
} from "@/components/card/hooks/useCardEngagement";

function reviewOf(card: CardData): ReviewSummaryData | null {
  const pr = card.procedure_review;
  const r = Array.isArray(pr) ? pr[0] : pr;
  return r ?? null;
}

// 공유는 이 카드에 없음(시안) → 훅 share 경로 미사용.
const noopShare = async (): Promise<null> => null;

// 명세 색 — 인용부호 연한 하늘색 / 별점 노랑 / 본문·이름 진회색 / 보조 회색.
const QUOTE_COLOR = "#B8D4E8";
const STAR_ON = "#FFC93C";
const STAR_OFF = "#E8EDF1";

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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(card.comment_count ?? 0);

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

  return (
    <div className="rounded-[16px] bg-white p-5" style={{ wordBreak: "keep-all" }}>
      {/* 큰 인용부호 — 연한 하늘색(명세 #B8D4E8) */}
      <span
        aria-hidden
        className="block h-6 leading-none"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 48, color: QUOTE_COLOR }}
      >
        &ldquo;
      </span>

      {/* 본문 — 크게, 진하지 않게 */}
      {body && (
        <p className="mt-2 text-[15.5px] font-normal leading-[1.7] text-[#3A3C41]">
          {body}
        </p>
      )}

      {/* 프로필 줄(사진·이름 / 나이대·성별·상대시각) + 우측 별점 */}
      <div className="mt-5 flex items-center gap-3">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-[42px] w-[42px] flex-none rounded-full bg-[var(--bg-soft)] object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-[15px] font-extrabold"
              style={{ background: theme.soft, color: theme.color }}
            >
              {initial}
            </span>
          )}
          <span className="flex min-w-0 flex-col gap-[2px]">
            <span className="truncate text-[14px] font-bold text-[#3A3C41]">{name}</span>
            <span className="flex items-center gap-1 text-[12px] text-[#8A939B]">
              {demoText && (
                <>
                  <span className="whitespace-nowrap">{demoText}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <RelativeTime iso={card.created_at} />
            </span>
          </span>
        </Link>
        {review && (
          <span className="flex shrink-0 gap-[2px]" aria-label={`만족도 ${satisfaction}점`}>
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} aria-hidden style={{ color: s <= satisfaction ? STAR_ON : STAR_OFF }}>
                <IconStar size={16} />
              </span>
            ))}
          </span>
        )}
      </div>

      {/* 푸터 — 좋아요 / 댓글 수(D6) */}
      <div className="mt-4 flex items-center gap-[18px] text-[12.5px] font-semibold text-[#8A939B]">
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

        <button
          type="button"
          onClick={() => setCommentsOpen((o) => !o)}
          aria-expanded={commentsOpen}
          aria-label="댓글"
          className="flex cursor-pointer items-center gap-[5px] transition-colors hover:text-[var(--accent)]"
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
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>
      </div>

      {commentsOpen && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <CommentsBlock
            cardId={card.id}
            doctorSlug={null}
            cardDoctorId={null}
            isPublishedQa={true}
            showInput={true}
            onCountChange={setCommentCount}
          />
        </div>
      )}
    </div>
  );
}
