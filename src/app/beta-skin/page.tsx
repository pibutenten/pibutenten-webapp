import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CardData } from "@/lib/types/card";
import BetaSkinFeed from "./BetaSkinFeed";

/**
 * /beta-skin — 신규 디자인 컨셉으로 리스킨한 홈 피드 프리뷰.
 *
 * 운영과 격리:
 *   - 운영 파일 무수정. 이 라우트(app/beta-skin/*)만 신규 생성.
 *   - 데이터는 홈 피드(app/page.tsx)와 동일하게 feed_cards_scored RPC 사용.
 *   - 시각적 격리는 클라이언트(BetaSkinFeed)가 position:fixed 풀뷰포트로 처리.
 *   - 검색엔진 노출 차단(robots noindex,nofollow) — 어디까지나 미리보기.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기",
  robots: { index: false, follow: false },
};

// 무한스크롤용 풀 크기 — 프리뷰라 한 번에 충분히 받아 클라에서 점진 노출.
const POOL = 80;

export default async function BetaSkinPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("feed_cards_scored", {
    p_limit: POOL,
    p_offset: 0,
    p_half_life_days: 14,
    p_jitter_amp: 0.35,
  });

  // 풀 전체를 클라이언트로 전달 → IntersectionObserver 무한스크롤로 14장씩 reveal.
  const pool = (data ?? []) as CardData[];

  return <BetaSkinFeed initialPool={pool} />;
}
