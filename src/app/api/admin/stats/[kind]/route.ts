import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

const KIND_RPCS: Record<string, string> = {
  visitors: "get_top_visitors",
  "new-members": "get_top_new_members",
  views: "get_top_cards_by_views",
  "new-cards": "get_top_new_cards",
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
    return errorResponse(null, "invalid_input", `[admin/stats/${kind}] invalid kind`, 400, undefined, { userMessage: "invalid kind" });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(null, "unauthorized", `[admin/stats/${kind}] auth required`, 401);
  }
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active || (!idCtx.isSuperAdmin && !idCtx.isDoctorAdmin)) {
    return errorResponse(null, "forbidden", `[admin/stats/${kind}] admin/doctor required`, 403);
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

  // 2026-05-22: active doctor 면 본인 글 한정 RPC 호출 (views/likes/saves/shares/comments).
  const isActiveDoctor =
    idCtx.active.role === "doctor" && !!idCtx.activeDoctorId;
  const DOCTOR_FILTER_KINDS = new Set([
    "views",
    "likes",
    "saves",
    "shares",
    "comments",
  ]);
  const useDoctorFilter =
    isActiveDoctor && DOCTOR_FILTER_KINDS.has(kind);

  const rpcArgs: Record<string, unknown> = {
    p_days: days,
    p_limit: limit + 1,
    p_offset: offset,
  };
  if (useDoctorFilter) {
    rpcArgs.p_doctor_id = idCtx.activeDoctorId;
    rpcArgs.p_author_profile_id = idCtx.active.profileId ?? null;
  }
  const result = await supabase.rpc(rpc, rpcArgs);
  if (result.error) {
    return errorResponse(result.error, "generic", `[admin/stats/${kind}] rpc`, 500);
  }
  const data = (result.data ?? []) as unknown[];
  const hasMore = data.length > limit;
  let rows = data.slice(0, limit) as Record<string, unknown>[];

  // 카드 메타 fetch — publicCardUrl 정책 분기 (의사 Q&A 만 doctor route, 그 외 회원 route).
  // visitors / new-members 는 카드 없음. new-cards 도 author 정보 RPC 에 있으나
  // doctor route 분기 위해 category/post_year/post_slug/doctor_slug 보강 필요.
  const needsCardMeta =
    kind !== "visitors" && kind !== "new-members" && rows.length > 0;
  if (needsCardMeta) {
    const cardIds = rows
      .map((r) => r.card_id as number)
      .filter((id) => typeof id === "number");
    if (cardIds.length > 0) {
      const { data: cards } = await supabase
        .from("cards")
        .select("id, category, post_year, post_slug, doctor:doctors(slug)")
        .in("id", cardIds);
      type CardJoinRow = {
        id: number;
        category: string | null;
        post_year: number | null;
        post_slug: string | null;
        doctor: { slug: string } | { slug: string }[] | null;
      };
      const byCard = new Map<
        number,
        {
          category: string | null;
          doctor_slug: string | null;
          post_year: number | null;
          post_slug: string | null;
        }
      >();
      for (const c of (cards ?? []) as CardJoinRow[]) {
        const doc = Array.isArray(c.doctor) ? c.doctor[0] ?? null : c.doctor;
        byCard.set(c.id, {
          category: c.category ?? null,
          doctor_slug: doc?.slug ?? null,
          post_year: c.post_year ?? null,
          post_slug: c.post_slug ?? null,
        });
      }
      rows = rows.map((r) => ({ ...r, ...(byCard.get(r.card_id as number) ?? {}) }));
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
