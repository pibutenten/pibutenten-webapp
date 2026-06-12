import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPopularByCategory } from "@/lib/popular-keywords";
import type { CardData } from "@/lib/types/card";
import RecordView from "./RecordView";

/**
 * /beta-skin/record — 신규 스킨 "내 노트" 프리뷰 (index.html 컨셉).
 *
 * 격리: 운영 파일 무수정. BetaSkinShell(fixed z-100 오버레이)로 글로벌 크롬을 덮음.
 * 데이터:
 *   - 관심 키워드 칩: getPopularByCategory() 실데이터(상위 일부) → 없으면 샘플.
 *   - 관심 키워드 새 글 카드: feed_cards_scored 의 qa 카드 실데이터 → 없으면 샘플.
 *   - 인사 카드 / 시술 타임라인 / 사이드바: 로그인 필요 데이터라 샘플(예시).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 내 노트",
  robots: { index: false, follow: false },
};

export default async function BetaSkinRecordPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: feedData }, popular] = await Promise.all([
    supabase.rpc("feed_cards_scored", {
      p_limit: 12,
      p_offset: 0,
      p_half_life_days: 14,
      p_jitter_amp: 0.35,
    }),
    getPopularByCategory().catch(() => null),
  ]);

  const cards = (feedData ?? []) as CardData[];
  // 관심 키워드 새 글: 의사 Q&A 우선, 부족하면 일반 카드로 채움
  const qaCards = cards.filter((c) => (c.category ?? c.type) === "qa");
  const kwCards = (qaCards.length >= 2 ? qaCards : cards).slice(0, 4);

  // 관심 키워드 칩: 카테고리별 인기 키워드 1~2개씩 모아 5개
  const keywordChips: string[] = [];
  if (popular) {
    for (const list of [
      popular.lifting,
      popular.injectables,
      popular.concerns,
      popular.homecare,
      popular.knowledge,
    ]) {
      const k = list?.[0];
      if (k && !keywordChips.includes(k)) keywordChips.push(k);
    }
  }

  return <RecordView kwCards={kwCards} keywordChips={keywordChips} />;
}
