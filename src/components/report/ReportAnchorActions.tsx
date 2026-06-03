"use client";

/**
 * ReportAnchorActions — 시술 리포트 카드 헤더 우상단의 저장·공유 버튼.
 *
 * 대상은 해당 시술의 review_summary 앵커 카드(card_id). 단독 글과 **동일한**
 * useCardEngagement(toggle_card_save RPC · card_shares insert)를 재사용 →
 * 저장/공유가 일반 카드와 같은 테이블·카운트를 공유한다.
 *   - 좋아요·조회수는 노출하지 않음(데이터만, C 결정). 저장·공유 버튼만 렌더.
 *   - 좋아요 상태는 viewer prefetch 미전달 시 훅이 자체 조회(여기선 save 만 사용).
 * 아이콘·색은 CardActions 의 저장(amber #F59E0B)·공유와 동일 톤(크기만 약간 축소).
 */
import type { CardData } from "@/components/Card";
import {
  useCardEngagement,
  type EngagementMe,
} from "@/components/card/hooks/useCardEngagement";
import { shareCard } from "@/components/card/utils/card-share";

export default function ReportAnchorActions({
  anchor,
  me,
  onLoginRequired,
}: {
  anchor: CardData;
  me: EngagementMe;
  onLoginRequired: (reason: string) => void;
}) {
  const eng = useCardEngagement(anchor, {}, me, onLoginRequired, shareCard);
  return (
    <div className="flex items-center gap-3 text-[var(--text-icon)]">
      {/* 저장(북마크) — amber, CardActions 와 동일 */}
      <button
        type="button"
        onClick={eng.save.toggle}
        aria-label={eng.save.active ? "저장 취소" : "저장"}
        aria-pressed={eng.save.active}
        title={eng.save.active ? "저장 취소" : "저장"}
        className={
          "flex cursor-pointer items-center gap-1 transition-colors " +
          (eng.save.active
            ? "text-[#F59E0B]"
            : "text-[var(--text-icon)] hover:text-[#F59E0B]")
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill={eng.save.active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[20px] w-[20px]"
          aria-hidden
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        {eng.save.count > 0 && <span className="text-[12px]">{eng.save.count}</span>}
      </button>

      {/* 공유 */}
      <button
        type="button"
        onClick={() => void eng.share.share()}
        aria-label="공유"
        title="공유"
        className="flex cursor-pointer items-center gap-1 transition-colors hover:text-[var(--primary)]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[20px] w-[20px]"
          aria-hidden
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        {eng.share.count > 0 && <span className="text-[12px]">{eng.share.count}</span>}
      </button>
    </div>
  );
}
