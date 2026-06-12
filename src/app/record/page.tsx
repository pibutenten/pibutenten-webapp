import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import { fetchViewerStatesRecord } from "@/lib/viewer-states";
import type { CardData } from "@/components/Card";
import RecordTab, { type PopularData, type PopularItem } from "./RecordTab";
import type { SummaryGroup, SummaryItem } from "../mockups/skin-diary/SkinDiaryMockup";

/** 카드 → 상세 링크(원장 글: keyword slug / 회원 글: handle+shortcode). */
function cardHref(c: { doctor?: { slug: string | null } | null; post_year: number | null; post_slug: string | null; shortcode: string | null; author?: { handle: string | null } | null }): string {
  if (c.doctor?.slug && c.post_year && c.post_slug) return `/doctors/${c.doctor.slug}/${c.post_year}/${c.post_slug}`;
  if (c.shortcode && c.author?.handle) return `/${c.author.handle}/${c.shortcode}`;
  return "/";
}

// BetaNav 가 useSearchParams 사용 → 정적 프리렌더 회피(동적 렌더).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 일기",
  robots: { index: false, follow: false },
};

// diaries(부모) + diary_procedures(자식 N) 조인 행. RLS 가 active 명함 소유분만 반환.
type DiaryRow = {
  id: number;
  visited_on: string; // "YYYY-MM-DD"
  clinic_name: string | null;
  clinic_tel: string | null;
  doctor_name: string | null;
  manager_name: string | null;
  diary_body: string | null;
  diary_procedures: { procedure_ko: string; unit_text: string | null; price: number | null; sort_order: number }[];
};

// diaries 행 → 내 일기 패널이 쓰는 SummaryGroup[](연도 내림차순, 같은 해는 최신 방문순).
function toSummaryGroups(rows: DiaryRow[]): SummaryGroup[] {
  const byYear = new Map<number, SummaryItem[]>();
  for (const r of rows) {
    const [y, m, d] = r.visited_on.split("-");
    const year = Number(y);
    const procs = [...r.diary_procedures].sort((a, b) => a.sort_order - b.sort_order);
    const items = procs.map((p) => ({ name: p.procedure_ko, unit: p.unit_text ?? "" }));
    const totalPrice = procs.reduce((s, p) => s + (p.price ?? 0), 0);
    const hasPrice = procs.some((p) => p.price != null);
    const item: SummaryItem = {
      id: String(r.id),
      date: `${m}.${d}`,
      proc: items.map((i) => i.name).join(" · "),
      hospital: r.clinic_name ?? "병원 미입력",
      doctor: r.doctor_name ?? "",
      manager: r.manager_name ?? undefined,
      tel: r.clinic_tel ?? "",
      price: hasPrice ? `${totalPrice.toLocaleString("ko-KR")}원` : "",
      memo: r.diary_body ?? "",
      items,
    };
    byYear.set(year, [...(byYear.get(year) ?? []), item]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, items: [...items].sort((a, b) => b.date.localeCompare(a.date)) }));
}

// get_top_cards_by_views 반환 행(0280 으로 회원도 사이트 전체 호출 가능).
type TopCardRow = {
  card_id: number;
  title: string | null;
  author_name: string | null;
  cnt: number;
  deleted_at: string | null;
};

// /record — 내 일기(비공개). 로그인 필수. active 명함 기준 조회·집계.
export default async function RecordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const idCtx = await getIdentityContext(supabase);
  const activeId = idCtx?.active?.profileId ?? user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, interested_procedures, skin_concerns, skin_type")
    .eq("id", activeId)
    .maybeSingle()
    .returns<{
      display_name: string | null;
      interested_procedures: string[] | null;
      skin_concerns: string[] | null;
      skin_type: string | null;
    }>();
  const userName = prof?.display_name?.trim() || "회원";

  // 관심 키워드 합집합(관심시술 + 피부고민 + 피부타입). 카드 keywords 와 같은 한글 키(0262).
  const interests = Array.from(
    new Set([
      ...(prof?.interested_procedures ?? []),
      ...(prof?.skin_concerns ?? []),
      ...(prof?.skin_type ? [prof.skin_type] : []),
    ]),
  );

  // 병렬: 일기 / 내가 쓴 후기 수 / 인기글 3기간(TOP10) / 관심 키워드 새 Q&A.
  const [diariesRes, reviewCntRes, top7Res, top30Res, top90Res, kwRes] = await Promise.all([
    supabase
      .from("diaries")
      .select("id, visited_on, clinic_name, clinic_tel, doctor_name, manager_name, diary_body, diary_procedures(procedure_ko, unit_text, price, sort_order)")
      .order("visited_on", { ascending: false })
      .returns<DiaryRow[]>(),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("author_id", activeId)
      .eq("category", "review")
      .eq("status", "published"),
    supabase.rpc("get_top_cards_by_views", { p_days: 7, p_limit: 10 }),
    supabase.rpc("get_top_cards_by_views", { p_days: 30, p_limit: 10 }),
    supabase.rpc("get_top_cards_by_views", { p_days: 90, p_limit: 10 }),
    // 관심 키워드 새 Q&A — 관심사 매칭 공개 Q&A 최신순(검수 기준 reviewed_at). 표준 Card 로 렌더.
    interests.length > 0
      ? supabase
          .from("cards")
          .select(CARD_LIST_SELECT)
          .eq("category", "qa")
          .eq("status", "published")
          .is("deleted_at", null)
          .overlaps("keywords", interests)
          .order("reviewed_at", { ascending: false, nullsFirst: false })
          .limit(6)
          .returns<CardData[]>()
      : Promise.resolve({ data: [] as CardData[] }),
  ]);

  const rows = diariesRes.data ?? [];
  const reviewsCount = reviewCntRes.count ?? 0;
  const keywordCards = (kwRes.data ?? []) as CardData[];

  // 상태 문구 계산용 — 가장 최근 방문의 첫 시술명 + 방문일 + 그 시술 누적 횟수('N회차').
  const latestRow = rows[0];
  const latestName =
    latestRow && ([...latestRow.diary_procedures].sort((a, b) => a.sort_order - b.sort_order)[0]?.procedure_ko ?? "시술");
  const latest = latestRow
    ? {
        name: latestName as string,
        visitedOn: latestRow.visited_on,
        count: rows.filter((r) => r.diary_procedures.some((p) => p.procedure_ko === latestName)).length,
      }
    : null;

  // 인기글 — 3기간 RPC 결과 + 카드 enrich(공개 카드만, 링크·타입). deleted 제외.
  const periods: [keyof PopularData, TopCardRow[]][] = [
    ["d7", ((top7Res.data ?? []) as TopCardRow[]).filter((r) => !r.deleted_at)],
    ["d30", ((top30Res.data ?? []) as TopCardRow[]).filter((r) => !r.deleted_at)],
    ["d90", ((top90Res.data ?? []) as TopCardRow[]).filter((r) => !r.deleted_at)],
  ];
  const allIds = Array.from(new Set(periods.flatMap(([, rs]) => rs.map((r) => r.card_id))));
  const enrichMap = new Map<number, { href: string; type: string }>();
  if (allIds.length > 0) {
    const { data: enrichRows } = await supabase
      .from("cards")
      .select("id, category, post_year, post_slug, shortcode, doctor:doctors(slug), author:profiles!cards_author_id_profiles_fkey(handle)")
      .in("id", allIds)
      .eq("status", "published")
      .is("deleted_at", null)
      .returns<{ id: number; category: string | null; post_year: number | null; post_slug: string | null; shortcode: string | null; doctor: { slug: string | null } | null; author: { handle: string | null } | null }[]>();
    for (const e of enrichRows ?? []) enrichMap.set(e.id, { href: cardHref(e), type: e.category ?? "" });
  }
  const popular = Object.fromEntries(
    periods.map(([key, rs]) => [
      key,
      // enrich(공개) 에 없는(=비공개/삭제) 카드는 제외 후 순위 재부여.
      rs
        .filter((r) => enrichMap.has(r.card_id))
        .map((r, i): PopularItem => ({
          rank: i + 1,
          title: r.title ?? "",
          authorName: r.author_name ?? "회원",
          type: enrichMap.get(r.card_id)?.type ?? "",
          href: enrichMap.get(r.card_id)?.href ?? "/",
        })),
    ]),
  ) as PopularData;

  // 관심 키워드 카드의 viewer 좋아요/저장 prefetch.
  const viewerStates = await fetchViewerStatesRecord(supabase, user.id, keywordCards.map((c) => c.id));

  return (
    <RecordTab
      summary={toSummaryGroups(rows)}
      userName={userName}
      latest={latest}
      diaryCount={rows.length}
      reviewsCount={reviewsCount}
      keywordCards={keywordCards}
      viewerStates={viewerStates}
      popular={popular}
      myKeywords={interests}
    />
  );
}
