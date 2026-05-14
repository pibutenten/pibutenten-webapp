/**
 * GET /api/notifications?limit=20
 * 본인 알림 최근 N개 + 미확인 수.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 50)
    : 20;

  const [items, unread] = await Promise.all([
    supabase.rpc("get_my_notifications", { p_limit: limit }),
    supabase.rpc("get_my_unread_count"),
  ]);
  if (items.error) {
    return NextResponse.json({ error: items.error.message }, { status: 500 });
  }
  return NextResponse.json(
    {
      items: items.data ?? [],
      unread: Number(unread.data ?? 0),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
