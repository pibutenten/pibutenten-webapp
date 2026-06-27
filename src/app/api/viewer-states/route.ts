/**
 * GET /api/viewer-states?cardIds=1,2,3
 *
 * 피드 viewer 좋아요/저장 배치 조회 — 카드 묶음에 대해 현재 로그인 사용자의
 * 좋아요/저장 상태를 **한 번에** 반환. 홈 피드가 매 SSR 마다 서버에서 viewer
 * 좋아요/저장을 prefetch 하던 것을, 클라가 마운트 후 1회 배치 조회하도록 대체.
 *
 *   응답: { viewerStates: { [cardId]: { liked?: true; saved?: true } } }
 *   (좋아요·저장 둘 다 없는 카드는 키 자체를 넣지 않음 — sparse)
 *
 * 비로그인(anon)이면 좋아요/저장이 없으므로 즉시 빈 객체 반환(불필요 쿼리 회피).
 *
 * 좋아요/저장 조회는 `@/lib/viewer-states.ts` 의 fetchViewerStatesRecord(SSOT) 재사용
 *   — active 명함 변환(readTargetProfileId) + `.eq(profile_id)` 본인 한정 필터가 그 안에 있음.
 * 보안 주의: card_saves 는 RLS 가 본인만 SELECT 허용하나, **card_likes 는 SELECT 가 공개**(qual=true)라
 *   RLS 안전망이 없다. fetchViewerStates 내부의 `.eq("profile_id", activeId)` 가 본인 한정의 유일 방어선
 *   이므로(코드가 항상 본인 명함으로만 조회), 이 헬퍼를 우회해 직접 card_likes 를 SELECT 하면 안 된다.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/error-response";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";

export const dynamic = "force-dynamic";

/** 한 번에 조회할 카드 수 상한(피드 한 페이지 ~20장 + 여유). */
const MAX_CARDS = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("cardIds") ?? "";
    const cardIds = Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ).slice(0, MAX_CARDS);

    if (cardIds.length === 0) {
      return NextResponse.json(
        { viewerStates: {} },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();

    // 비로그인이면 좋아요/저장이 없음 — 불필요한 쿼리 회피.
    if (!viewer) {
      return NextResponse.json(
        { viewerStates: {} },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // SSOT 재사용 — active 명함 변환 + sparse Record(좋아요/저장 둘 다 없는 카드는 키 미포함).
    const viewerStates = await fetchViewerStatesRecord(supabase, viewer.id, cardIds);

    return NextResponse.json(
      { viewerStates },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "generic", "[viewer-states]", 500);
  }
}
