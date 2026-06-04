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
import { getProcedureReport } from "@/lib/procedure-report";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 30;

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
  const { data: tax } = await supabase
    .from("procedure_taxonomy")
    .select("ko, en")
    .or(`en.eq.${raw.toLowerCase()},ko.eq.${raw}`)
    .eq("active", true)
    .maybeSingle<{ ko: string; en: string }>();
  if (!tax) return NextResponse.json({ reviews: [], reviewLiked: {} });
  const ko = tax.ko;

  // 후기 페이지 — 기존 페이지들과 동일 쿼리 + range 페이징.
  const { data: reviewData } = await supabase
    .from("cards")
    .select(CARD_LIST_SELECT)
    .eq("category", "review")
    .eq("status", "published")
    .is("deleted_at", null)
    .contains("keywords", [ko])
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
    .returns<CardData[]>();
  const reviews = reviewData ?? [];

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
