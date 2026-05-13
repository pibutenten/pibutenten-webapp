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
  return NextResponse.json({
    rows: data.slice(0, limit),
    hasMore,
  });
}
