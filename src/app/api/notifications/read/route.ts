/**
 * POST /api/notifications/read
 *
 * 두 RPC 분기 (명명이 헷갈리니 주의):
 *  - `mark_my_notifications_read()` — body 없음/{ids:null} 시 호출. 본인 미확인 알림 전체를 read.
 *    단, **ask 카테고리에 본인이 아직 답변 안 한 알림은 제외** (지속형 알림 정책, migration 0080).
 *    "내" 알림이라는 의미라 my 접두사.
 *  - `mark_notifications_read(p_ids[])` — body {ids:[...]} 시 호출. 명시한 ID만 즉시 read.
 *    제외 정책 없음 (사용자가 종 dropdown 에서 개별 클릭하는 흐름).
 *
 * 즉, my 버전 = 일괄 + ask 제외, ids 버전 = 명시 + 즉시. 향후 RPC 통합 시 함수명 통일 필요.
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
