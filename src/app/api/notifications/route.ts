/**
 * GET /api/notifications
 *
 *   배지 모드:             ?countOnly=1       → { items: [], unread } (items RPC 생략 — 미읽음 수만)
 *   기본 (dropdown 모드): ?limit=N            → { items, unread }
 *   페이지 모드:           ?offset=N&limit=N  → { items, unread } (items 는 get_notifications 의 풀 페이로드)
 *
 * 모든 조회는 **active profile 한 장** 기준 (CLAUDE.md 원칙 #1, 마이그레이션 0168).
 * 호출자의 active profileId 를 RPC 에 명시 전달 — 묶음 다른 신분의 알림 누설 차단.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx || !idCtx.active) {
    return errorResponse(null, "unauthorized", "[notifications GET] auth required", 401);
  }
  const activeProfileId = idCtx.active.profileId;

  const url = new URL(req.url);

  // 배지 모드 — items RPC 생략, 미읽음 카운트만 (AppShell 60초 폴링 경량화).
  //   응답 형태는 기존 소비자와 호환되게 items 를 빈 배열로 유지.
  if (url.searchParams.get("countOnly") === "1") {
    const unread = await supabase.rpc("get_my_unread_count", {
      p_active_profile_id: activeProfileId,
    });
    // RPC 에러를 0 으로 오표시하지 않음 — 배지 클라(AppShell)는 !res.ok 시 이전 값 유지.
    if (unread.error) {
      return errorResponse(unread.error, "generic", "[notifications GET] get_my_unread_count (countOnly)", 500);
    }
    return NextResponse.json(
      {
        items: [],
        unread: Number(unread.data ?? 0),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 50)
    : 20;

  const offsetParam = url.searchParams.get("offset");
  const usePageMode = offsetParam !== null;
  const offsetRaw = parseInt(offsetParam ?? "0", 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  if (usePageMode) {
    // 페이지 모드 — get_notifications (avatar/card_question 등 풀 페이로드)
    const [items, unread] = await Promise.all([
      supabase.rpc("get_notifications", {
        p_active_profile_id: activeProfileId,
        p_offset: offset,
        p_limit: limit,
      }),
      supabase.rpc("get_my_unread_count", {
        p_active_profile_id: activeProfileId,
      }),
    ]);
    if (items.error) {
      return errorResponse(items.error, "generic", "[notifications GET] get_notifications", 500);
    }
    if (unread.error) {
      return errorResponse(unread.error, "generic", "[notifications GET] get_my_unread_count (page)", 500);
    }
    return NextResponse.json(
      {
        items: items.data ?? [],
        unread: Number(unread.data ?? 0),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // dropdown 모드 — get_my_notifications (메시지 단문 페이로드)
  const [items, unread] = await Promise.all([
    supabase.rpc("get_my_notifications", {
      p_active_profile_id: activeProfileId,
      p_limit: limit,
    }),
    supabase.rpc("get_my_unread_count", {
      p_active_profile_id: activeProfileId,
    }),
  ]);
  if (items.error) {
    return errorResponse(items.error, "generic", "[notifications GET] get_my_notifications", 500);
  }
  if (unread.error) {
    return errorResponse(unread.error, "generic", "[notifications GET] get_my_unread_count (dropdown)", 500);
  }
  return NextResponse.json(
    {
      items: items.data ?? [],
      unread: Number(unread.data ?? 0),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
