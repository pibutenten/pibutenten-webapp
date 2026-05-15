import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";

export const dynamic = "force-dynamic";

const KIND_RPCS: Record<string, string> = {
  visitors: "get_top_visitors",
  views: "get_top_cards_by_views",
  comments: "get_top_cards_by_comments",
  likes: "get_top_cards_by_likes",
  saves: "get_top_cards_by_saves",
  shares: "get_top_cards_by_shares",
};

const ALLOWED_DAYS = new Set([1, 7, 30, 90, 365, 0]);

/**
 * GET /api/admin/stats/{kind}?days=N&offset=N&limit=N
 *
 * 무한 스크롤 + 기간 전환용. admin 권한만.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  const rpc = KIND_RPCS[kind];
  if (!rpc) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active || (!idCtx.isSuperAdmin && !idCtx.isDoctorAdmin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = request.nextUrl;
  const daysRaw = parseInt(url.searchParams.get("days") ?? "7", 10);
  const days = ALLOWED_DAYS.has(daysRaw) ? daysRaw : 7;
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 50;

  const result = await supabase.rpc(rpc, {
    p_days: days,
    p_limit: limit + 1,
    p_offset: offset,
  });
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }
  const data = (result.data ?? []) as unknown[];
  const hasMore = data.length > limit;
  let rows = data.slice(0, limit) as Record<string, unknown>[];

  // visitors 외 모든 card 종류: 카드별 doctor_slug + post_year 추가 fetch
  // → 의사 글 canonical URL /doctors/{slug}/{year}/{shortcode} 구성에 사용
  // (RPC 가 author_handle/shortcode 만 반환하므로 회원 글 fallback 만 가능했던 한계 해소)
  if (kind !== "visitors" && rows.length > 0) {
    const cardIds = rows
      .map((r) => r.card_id as number)
      .filter((id) => typeof id === "number");
    if (cardIds.length > 0) {
      const { data: cards } = await supabase
        .from("cards")
        .select("id, post_year, doctor:doctors(slug)")
        .in("id", cardIds);
      type CardJoinRow = {
        id: number;
        post_year: number | null;
        doctor: { slug: string } | { slug: string }[] | null;
      };
      const byCard = new Map<number, { doctor_slug: string | null; post_year: number | null }>();
      for (const c of (cards ?? []) as CardJoinRow[]) {
        const doc = Array.isArray(c.doctor) ? c.doctor[0] ?? null : c.doctor;
        byCard.set(c.id, {
          doctor_slug: doc?.slug ?? null,
          post_year: c.post_year ?? null,
        });
      }
      rows = rows.map((r) => {
        const extra = byCard.get(r.card_id as number);
        return {
          ...r,
          doctor_slug: extra?.doctor_slug ?? null,
          post_year: extra?.post_year ?? null,
        };
      });
    }
  }

  // comments kind: 각 qa의 기간 내 댓글(대댓글 포함) 본문도 함께 fetch
  if (kind === "comments" && rows.length > 0) {
    const since =
      days === 0
        ? "1970-01-01T00:00:00Z"
        : new Date(Date.now() - days * 86400_000).toISOString();
    const cardIds = rows
      .map((r) => r.card_id as number)
      .filter((id) => typeof id === "number");
    if (cardIds.length > 0) {
      const { data: comments } = await supabase
        .from("comments")
        .select(
          "id, card_id, body, created_at, parent_id, author_id, author:profiles!comments_author_id_fkey(display_name, handle)",
        )
        .in("card_id", cardIds)
        .eq("status", "visible")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      const byCard = new Map<number, unknown[]>();
      for (const c of comments ?? []) {
        const cardId = (c as { card_id: number }).card_id;
        if (!byCard.has(cardId)) byCard.set(cardId, []);
        byCard.get(cardId)!.push(c);
      }
      rows = rows.map((r) => ({
        ...r,
        comments: byCard.get(r.card_id as number) ?? [],
      }));
    }
  }

  return NextResponse.json({ rows, hasMore });
}
