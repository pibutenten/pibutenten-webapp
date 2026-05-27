import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";

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
    return errorResponse(null, "unauthorized", "[admin/comments GET] auth required", 401);
  }
  // 권한 좁히기 (2026-05-16): super admin 만 전체 댓글 조회 가능.
  // doctor admin 은 본인 doctor 글 댓글만 보면 되므로 본인 글 페이지에서 확인.
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active || !idCtx.isSuperAdmin) {
    return errorResponse(null, "forbidden", "[admin/comments GET] super admin required", 403);
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
    return errorResponse(error, "generic", "[admin/comments GET] query failed", 500, undefined, { userMessage: "댓글 조회에 실패했습니다." });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  return NextResponse.json({
    rows: rows.slice(0, limit),
    hasMore,
  });
}
