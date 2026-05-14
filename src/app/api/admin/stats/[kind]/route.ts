import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";

export const dynamic = "force-dynamic";

const KIND_RPCS: Record<string, string> = {
  visitors: "get_top_visitors",
  views: "get_top_qas_by_views",
  comments: "get_top_qas_by_comments",
  likes: "get_top_qas_by_likes",
  saves: "get_top_qas_by_saves",
  shares: "get_top_qas_by_shares",
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

  // comments kind: 각 qa의 기간 내 댓글(대댓글 포함) 본문도 함께 fetch
  if (kind === "comments" && rows.length > 0) {
    const since =
      days === 0
        ? "1970-01-01T00:00:00Z"
        : new Date(Date.now() - days * 86400_000).toISOString();
    const qaIds = rows
      .map((r) => r.card_id as number)
      .filter((id) => typeof id === "number");
    if (qaIds.length > 0) {
      const { data: comments } = await supabase
        .from("comments")
        .select(
          "id, card_id, body, created_at, parent_id, author_id, author:profiles!comments_author_id_fkey(display_name, handle)",
        )
        .in("card_id", qaIds)
        .eq("status", "visible")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      const byQa = new Map<number, unknown[]>();
      for (const c of comments ?? []) {
        const qaId = (c as { card_id: number }).card_id;
        if (!byQa.has(qaId)) byQa.set(qaId, []);
        byQa.get(qaId)!.push(c);
      }
      rows = rows.map((r) => ({
        ...r,
        comments: byQa.get(r.card_id as number) ?? [],
      }));
    }
  }

  return NextResponse.json({ rows, hasMore });
}
