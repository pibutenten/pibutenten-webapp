import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/comments?before={ISO timestamp}&limit={N}
 *
 * /admin/comments 무한 스크롤 페이지네이션용.
 * - admin 권한만 접근
 * - before(default = now), limit(default 50, max 100)
 */
export async function GET(request: NextRequest) {
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
  const before = url.searchParams.get("before") ?? new Date().toISOString();
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 50;

  const { data, error } = await supabase
    .from("comments")
    .select(
      `id, body, created_at, card_id,
       card:cards(question, shortcode),
       author:profiles!comments_author_id_fkey(handle, display_name)`,
    )
    .eq("status", "visible")
    .lt("created_at", before)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  return NextResponse.json({
    rows: rows.slice(0, limit),
    hasMore,
  });
}
