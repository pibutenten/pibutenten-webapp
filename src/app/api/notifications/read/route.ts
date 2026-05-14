/**
 * POST /api/notifications/read
 * 본인 미확인 알림 모두 읽음 처리.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { error } = await supabase.rpc("mark_my_notifications_read");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
