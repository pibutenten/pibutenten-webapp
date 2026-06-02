"use client";

/**
 * ProcedureReviewStream — 리포트 카드 아래 개별 후기를 "컴팩트 목록"으로 나열.
 *
 *   - 풀 카드(좋아요·댓글·공유)가 아니라, 읽기 위주의 컴팩트 항목.
 *   - 각 항목: 작성자 · 날짜 / 정량 요약 한 줄(ReviewSummary 재사용) / 본문.
 *   - Q&A 카드처럼 접힘: 앞 3개 노출 + "후기 N개 더보기".
 *   - 데이터는 후기 카드 그대로 재사용(중복 없음). 항목 클릭 시 원문으로 이동.
 */
import { useState } from "react";
import Link from "next/link";
import type { CardData } from "@/components/Card";
import type { ReviewSummaryData } from "@/lib/types/card";
import ReviewSummary from "@/components/card/ReviewSummary";
import { getQaUrl } from "@/lib/card-url";

const COLLAPSED_COUNT = 3;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function reviewOf(card: CardData): ReviewSummaryData | null {
  const pr = card.procedure_review;
  const r = Array.isArray(pr) ? pr[0] : pr;
  return r ?? null;
}

function CompactReviewItem({ card }: { card: CardData }) {
  const author = Array.isArray(card.author) ? card.author[0] : card.author;
  const name = author?.display_name || author?.handle || "익명";
  const review = reviewOf(card);
  const body = (card.body ?? "").trim();

  return (
    <Link
      href={getQaUrl(card)}
      className="block rounded-xl border border-[var(--border)] bg-white px-4 py-3 transition-colors hover:bg-[var(--bg-soft)]"
    >
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="font-semibold text-[var(--text)]">{name}</span>
        <span className="text-[var(--text-muted)]">{fmtDate(card.created_at)}</span>
      </div>
      {review && <ReviewSummary review={review} />}
      {body && (
        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[13.5px] leading-[1.6] text-[var(--text)]">
          {body}
        </p>
      )}
    </Link>
  );
}

export default function ProcedureReviewStream({
  reviews,
}: {
  reviews: CardData[];
}) {
  const [expanded, setExpanded] = useState(false);
  const total = reviews.length;
  const visible = expanded ? reviews : reviews.slice(0, COLLAPSED_COUNT);
  const hiddenCount = total - visible.length;

  if (total === 0) return null;

  return (
    <div className="mt-4">
      <h2 className="mb-2 px-1 text-[14px] font-bold text-[var(--text)]">
        후기 {total}개
      </h2>
      <div className="flex flex-col gap-2">
        {visible.map((card) => (
          <CompactReviewItem key={card.id} card={card} />
        ))}
      </div>

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2.5 w-full cursor-pointer rounded-[var(--radius)] border border-[var(--border)] bg-white py-3 text-sm font-semibold text-[var(--primary-dark)] transition-colors hover:bg-[var(--bg-soft)]"
        >
          후기 {hiddenCount}개 더보기
        </button>
      )}
    </div>
  );
}
