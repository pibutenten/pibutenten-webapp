"use client";

/**
 * ProcedureReviewStream — 리포트 카드 아래 개별 후기 스트림(접힘/더보기).
 *
 * Q&A 카드가 본문을 접듯, 여기선 개별 후기 목록을 접는다.
 *   - 기본: 앞 2개만 노출 + "후기 N개 모두 보기" 버튼.
 *   - 펼치면 전체 노출. (데이터는 후기 카드 그대로 재사용 — 중복 없음)
 */
import { useState } from "react";
import Card, { type CardData } from "@/components/Card";

const COLLAPSED_COUNT = 2;

export default function ProcedureReviewStream({
  reviews,
  viewerStates,
  hotIds,
}: {
  reviews: CardData[];
  viewerStates?: Record<number, { liked?: boolean; saved?: boolean }>;
  hotIds?: number[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hotSet = new Set(hotIds ?? []);
  const total = reviews.length;
  const visible = expanded ? reviews : reviews.slice(0, COLLAPSED_COUNT);
  const hiddenCount = total - visible.length;

  if (total === 0) return null;

  return (
    <div className="mt-3">
      <h2 className="mb-2 px-1 text-[13px] font-bold text-[var(--text-secondary)]">
        후기 {total}개
      </h2>
      <div className="flex flex-col gap-3">
        {visible.map((card) => {
          const vs = viewerStates?.[card.id];
          return (
            <Card
              key={card.id}
              card={card}
              isHot={hotSet.has(card.id)}
              viewerLiked={vs?.liked}
              viewerSaved={vs?.saved}
            />
          );
        })}
      </div>

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 w-full cursor-pointer rounded-[var(--radius)] border border-[var(--border)] bg-white py-3 text-sm font-semibold text-[var(--primary-dark)] transition-colors hover:bg-[var(--bg-soft)]"
        >
          후기 {hiddenCount}개 더보기
        </button>
      )}
    </div>
  );
}
