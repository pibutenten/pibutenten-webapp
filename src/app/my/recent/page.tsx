import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { ROLES } from "@/lib/identity-shared";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import type { CardData } from "@/lib/types/card";
import RecentViewsView from "@/components/skin/mypage/RecentViewsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "최근 본 글",
  robots: { index: false, follow: false },
};

const RECENT_LIMIT = 30;

/**
 * /my/recent — "최근 본 글" 목록(회원 전용).
 *
 *   - DB 에이전트 RPC get_my_recent_views(p_profile_id, p_limit) 가 card_id 를 last_viewed_at DESC
 *     순서로 반환. 그 순서를 보존하며 cards 를 CARD_LIST_SELECT 로 로드(published·미삭제만 RLS 통과).
 *   - 비로그인 → /login?next=/my/recent
 *   - admin/doctor → 마이 메인과 동일하게 각 대시보드로(허브 일관성).
 *
 * RPC 호출은 auth.uid() 필요 → my/page 의 likes/saves 와 동일한 user 인증 서버 클라이언트 사용.
 * AppShell 직접 렌더(GlobalChrome APP_SHELL_PREFIX 에 "/my/" 포함).
 */
export default async function RecentViewsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my/recent");

  const idCtx = await getIdentityContext(supabase);
  const active = idCtx?.active;
  if (active?.role === ROLES.ADMIN) redirect("/admin");
  if (active?.role === ROLES.DOCTOR) redirect("/doctor");

  // active 명함(getIdentityContext SSOT) 기준. 없으면 base profile fallback.
  const activeId = active?.profileId ?? user.id;

  // 최근 본 카드 id — last_viewed_at DESC 순서로. RPC 실패 시 빈 목록(빈 화면).
  const { data: recentRows } = await supabase.rpc("get_my_recent_views", {
    p_profile_id: activeId,
    p_limit: RECENT_LIMIT,
  });
  const orderedIds: number[] = Array.isArray(recentRows)
    ? (recentRows as { card_id: number }[])
        .map((r) => r.card_id)
        .filter((id): id is number => typeof id === "number")
    : [];

  let cards: CardData[] = [];
  if (orderedIds.length > 0) {
    // cards 로드 — RLS 가 비공개·삭제 카드를 자동 제외(일부 id 는 누락될 수 있음).
    //   SELECT 결과는 순서 보장이 없으므로 RPC 의 last_viewed_at DESC 순서로 재정렬.
    const { data } = await supabase
      .from("cards")
      .select(CARD_LIST_SELECT)
      .in("id", orderedIds)
      .returns<CardData[]>();
    const byId = new Map<number, CardData>(
      (data ?? []).map((c) => [c.id, c]),
    );
    cards = orderedIds
      .map((id) => byId.get(id))
      .filter((c): c is CardData => !!c);
  }

  // viewer prefetch — 좋아요/저장 상태(카드 첫 렌더 정합).
  //   ADR 0012: 다른 페이지(피드·프로필·리포트)와 동일하게 active 명함(activeId) 기준.
  const viewerStates = await fetchViewerStatesRecord(
    supabase,
    activeId,
    cards.map((c) => c.id),
  );

  return <RecentViewsView cards={cards} viewerStates={viewerStates} />;
}
