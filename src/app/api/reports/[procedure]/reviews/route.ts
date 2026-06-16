/**
 * GET /api/reports/[procedure]/reviews?offset=&limit=&include_report=
 *
 * 시술 리포트 카드/페이지의 후기 지연 로딩·페이징용 read-only 엔드포인트 (작업 A).
 *
 *  - param `procedure` : taxonomy.en(소문자) 또는 ko(한글) 둘 다 허용 (reports 페이지와 동일 resolve).
 *  - offset / limit     : 후기 페이징 (limit 기본 10, 최대 30).
 *  - include_report=1   : getProcedureReport 집계 동봉 (피드 카드 펼침 시 1회 fetch 용).
 *
 * 정렬·필터는 /reports·/search·/topics 의 후기 쿼리와 동일 (created_at desc, category=review,
 * published, deleted_at NULL, keywords ∋ ko) — 순서 의미 불변.
 *
 * 새 데이터/마이그 없음. 기존 테이블·집계 RPC 만 읽음.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/components/Card";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import { getProcedureReport, getFamilyReviewCardIds } from "@/lib/procedure-report";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 30;

// PostgREST `.or()` 는 문자열 파서라 `,` `.` `()` 등 메타문자로 필터 구조 조작 표면이 있다.
//   `.or()` 보간 직전 입력 화이트리스트 게이트 — reports/[procedure]/page.tsx 와 동일.
//   시술명은 한글이므로 한글·영문소문자대문자·숫자·공백·하이픈·가운뎃점만 허용(한글 정식 URL 비파괴).
const PROCEDURE_SLUG_RE = /^[가-힣a-zA-Z0-9 ·-]+$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ procedure: string }> },
) {
  const { procedure } = await params;
  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "10", 10) || 10;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));
  const includeReport = url.searchParams.get("include_report") === "1";

  const supabase = await createSupabaseServerClient();

  // procedure(en|ko) → ko 해소. reports/[procedure]/page.tsx resolveProcedure 와 동일 규칙.
  const raw = decodeURIComponent(procedure).trim();
  if (!raw) return NextResponse.json({ reviews: [], reviewLiked: {} });
  // 화이트리스트 미충족(메타문자 포함 등) → 잘못된 슬러그로 400 거부(.or() 보간 차단).
  if (!PROCEDURE_SLUG_RE.test(raw)) {
    return NextResponse.json({ error: "invalid procedure" }, { status: 400 });
  }
  const { data: tax } = await supabase
    .from("tag_dictionary")
    .select("ko, en")
    .or(`en.eq.${raw.toLowerCase()},ko.eq.${raw}`)
    .eq("is_procedure", true)
    .maybeSingle<{ ko: string; en: string }>();
  if (!tax) return NextResponse.json({ reviews: [], reviewLiked: {} });
  const ko = tax.ko;

  // 후기 페이지 — 작업 D 롤업: 집계와 동일한 procedure_ko family 기준(카드 id IN) + range 페이징.
  const cardIds = await getFamilyReviewCardIds(supabase, ko);
  const reviews: CardData[] =
    cardIds.length > 0
      ? ((
          await supabase
            .from("cards")
            .select(CARD_LIST_SELECT)
            .in("id", cardIds)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1)
            .returns<CardData[]>()
        ).data ?? [])
      : [];

  // viewer 좋아요 여부 — 단독 글과 같은 card_likes 행.
  const reviewLiked: Record<number, boolean> = {};
  if (reviews.length > 0) {
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
    const st = await fetchViewerStatesRecord(
      supabase,
      viewer?.id ?? null,
      reviews.map((r) => r.id),
    );
    for (const r of reviews) reviewLiked[r.id] = !!st[r.id]?.liked;
  }

  // 피드 카드 펼침용 — 집계 동봉 (include_report=1). count = 전체 후기 수.
  const report = includeReport ? await getProcedureReport(supabase, ko) : null;

  return NextResponse.json({ reviews, reviewLiked, report });
}
