/**
 * 의사 본인 대시보드용 데이터 헬퍼 (2026-05-22 복원).
 *
 * 배경: 2026-05-17 Phase 8-extra v3 에서 `/doctors/[slug]` 의 dashboard 분기를 통째 폐기.
 * 정책상 "/{handle} 가 dashboard 역할 담당" 이지만 실제 위젯이 옮겨지지 않은 회귀 누락.
 * 본 헬퍼로 다시 채움.
 *
 * 의사 본인이 본인 handle 페이지 진입 시 호출.
 * 반환: status 별 카드 카운트 + 검수 대기 N건 + 최근 7일 활동 합계.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DoctorDashboardData = {
  // status 별 카드 갯수
  statusCounts: {
    published: number;
    pending_review: number;
    draft: number;
    deleted: number;
    total: number;
  };
  // 최근 7일 본인 글에 누적된 인터랙션 (가벼운 read)
  recent7d: {
    views: number;
    likes: number;
    saves: number;
    comments: number;
  };
  // 검수 대기 카드 첫 5건
  pendingPreview: Array<{
    id: number;
    question: string | null;
    shortcode: string | null;
    created_at: string;
  }>;
};

/**
 * 의사 본인 카드 통계.
 * @param supabase 서버 client
 * @param doctorId doctors.id (doctor_accounts 매핑 기준) — 없으면 author_id 만으로 카운트
 * @param profileId profiles.id — author_id 매칭용 (둘 다 조회해서 합산)
 */
export async function getDoctorDashboardData(
  supabase: SupabaseClient,
  doctorId: string | null,
  profileId: string,
): Promise<DoctorDashboardData> {
  // status 별 카운트 — doctor_id 매칭 또는 author_id 매칭
  // PostgREST 의 or 필터: 컬럼이 NULL 일 수 있으니 두 쿼리 합산 후 dedup 한다 (RPC 가 없어서 client side).
  const idsByStatus: Record<string, Set<number>> = {
    published: new Set(),
    pending_review: new Set(),
    draft: new Set(),
    deleted: new Set(),
  };

  // 두 갈래로 fetch — author_id 매칭 / doctor_id 매칭 (deleted 포함)
  const baseSelect = "id, status, deleted_at";

  const { data: byAuthor } = await supabase
    .from("cards")
    .select(baseSelect)
    .eq("author_id", profileId);

  type Row = { id: number; status: string; deleted_at: string | null };
  for (const r of (byAuthor as Row[] | null) ?? []) {
    if (r.deleted_at) idsByStatus.deleted.add(r.id);
    else if (idsByStatus[r.status]) idsByStatus[r.status].add(r.id);
  }

  if (doctorId) {
    const { data: byDoctor } = await supabase
      .from("cards")
      .select(baseSelect)
      .eq("doctor_id", doctorId);
    for (const r of (byDoctor as Row[] | null) ?? []) {
      if (r.deleted_at) idsByStatus.deleted.add(r.id);
      else if (idsByStatus[r.status]) idsByStatus[r.status].add(r.id);
    }
  }

  const statusCounts = {
    published: idsByStatus.published.size,
    pending_review: idsByStatus.pending_review.size,
    draft: idsByStatus.draft.size,
    deleted: idsByStatus.deleted.size,
    total:
      idsByStatus.published.size +
      idsByStatus.pending_review.size +
      idsByStatus.draft.size,
  };

  // 검수 대기 카드 5건
  const pendingIds = Array.from(idsByStatus.pending_review).slice(0, 50);
  let pendingPreview: DoctorDashboardData["pendingPreview"] = [];
  if (pendingIds.length > 0) {
    const { data: pp } = await supabase
      .from("cards")
      .select("id, question, shortcode, created_at")
      .in("id", pendingIds)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<DoctorDashboardData["pendingPreview"]>();
    pendingPreview = pp ?? [];
  }

  // 최근 7일 인터랙션 — 본인 글의 합산
  const publishedIds = Array.from(idsByStatus.published);
  const recent7d = { views: 0, likes: 0, saves: 0, comments: 0 };
  if (publishedIds.length > 0) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [viewsRes, likesRes, savesRes, commentsRes] = await Promise.all([
      supabase
        .from("card_views")
        .select("card_id", { count: "exact", head: true })
        .in("card_id", publishedIds)
        .gte("created_at", since),
      supabase
        .from("card_likes")
        .select("card_id", { count: "exact", head: true })
        .in("card_id", publishedIds)
        .gte("created_at", since),
      supabase
        .from("card_saves")
        .select("card_id", { count: "exact", head: true })
        .in("card_id", publishedIds)
        .gte("created_at", since),
      supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .in("card_id", publishedIds)
        .gte("created_at", since)
        .eq("status", "visible"),
    ]);
    recent7d.views = viewsRes.count ?? 0;
    recent7d.likes = likesRes.count ?? 0;
    recent7d.saves = savesRes.count ?? 0;
    recent7d.comments = commentsRes.count ?? 0;
  }

  return { statusCounts, recent7d, pendingPreview };
}
