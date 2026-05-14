/**
 * POST /api/notifications/read
 *
 * - body 없음 또는 {ids: null}: 본인 미확인 알림 모두 읽음 (ask 본인 미답 알림 제외 — migration 0080)
 * - body {ids: [1,2,3]}: 명시한 알림 ID만 읽음 (제외 정책 없이 즉시 read)
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // body 없을 수도 있음 (이전 호출 방식) — 안전하게 파싱
  let ids: number[] | null = null;
  try {
    const text = await req.text();
    if (text) {
      const body = JSON.parse(text) as { ids?: unknown };
      if (Array.isArray(body.ids)) {
        ids = body.ids
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
          .map((v) => Math.floor(v));
        if (ids.length === 0) ids = null;
      }
    }
  } catch {
    // 무시 — body 없는 호출로 처리
  }

  // ids가 있으면 명시 read (제외 없음). 없으면 mark_my_notifications_read (정책 적용)
  if (ids) {
    const { error } = await supabase.rpc("mark_notifications_read", {
      p_ids: ids,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.rpc("mark_my_notifications_read");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
