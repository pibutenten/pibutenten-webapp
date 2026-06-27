/**
 * record-data — "내 노트"(/record) 공용 데이터 로직 (SSOT).
 *
 * 운영 record/page.tsx 내부에 비-export 로 흩어져 있던 조회 SELECT·매핑·enrich 함수를
 * 한 곳으로 추출(중복 제거 + 동작 일치). UI(스킨)는 각 페이지가 다르게 그리되, 데이터·로직은
 * 본 모듈을 단일 출처로 재사용한다. (구 app skin record 프리뷰 페이지는 폐기.)
 *
 * 서버 전용 — 호출부에서 SupabaseServerClient 를 주입한다(本 모듈은 클라이언트를 만들지 않음).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRelativeTime } from "@/lib/relative-time";
import type { KeywordPost } from "@/app/today/KeywordCarousel";
import type { SummaryGroup, SummaryItem } from "@/components/skin/record/SkinDiaryForms";

/** 관심 키워드 카드(컴팩트) 조회 행. */
export type KeywordCardRow = {
  id: number;
  title: string | null;
  created_at: string | null;
  keywords: string[] | null;
  post_year: number | null;
  post_slug: string | null;
  shortcode: string | null;
  doctor: { slug: string | null; name: string | null; photo_url: string | null } | null;
  author: { handle: string | null; display_name: string | null; avatar_url: string | null } | null;
};

/** 관심 키워드 새 글(컴팩트) 조회용 SELECT 절. */
export const KEYWORD_SELECT =
  "id, title, created_at, keywords, post_year, post_slug, shortcode, doctor:doctors(slug, name, photo_url), author:profiles!cards_author_id_profiles_fkey(handle, display_name, avatar_url)";

/** diaries(부모) + diary_procedures(자식 N) 조인 행. RLS 가 active 명함 소유분만 반환.
 *  visited_on 은 nullable — precision='unknown'("날짜 잘 기억 안 나요") 일기는 NULL (마이그 0302). */
export type DiaryRow = {
  id: number;
  visited_on: string | null; // "YYYY-MM-DD" 또는 NULL(날짜 미상)
  clinic_name: string | null;
  clinic_tel: string | null;
  doctor_name: string | null;
  manager_name: string | null;
  diary_body: string | null;
  diary_procedures: { procedure_ko: string; unit_text: string | null; price: number | null; sort_order: number }[];
};

/** diaries 조회 SELECT 절. */
export const DIARY_SELECT =
  "id, visited_on, clinic_name, clinic_tel, doctor_name, manager_name, diary_body, diary_procedures(procedure_ko, unit_text, price, sort_order)";

/** get_top_cards_by_views 반환 행(0280 으로 회원도 사이트 전체 호출 가능). */
export type TopCardRow = {
  card_id: number;
  title: string | null;
  author_name: string | null;
  cnt: number;
  deleted_at: string | null;
};

const DAY_MS = 86_400_000;

/** 카드 → 상세 링크(원장 글: keyword slug / 회원 글: handle+shortcode).
 *  ui.tsx 의 cardHref(CardData → getQaUrl 위임, review_summary 포함)와 이름이 같지만 별개다:
 *  이쪽은 record 도메인의 좁은 SELECT row(nullable slug/post_year 등, review_summary 미포함)를
 *  받는 독립 함수라 통합하지 않고 record 전용 이름으로 구분한다. */
export function cardHrefFromRecord(c: {
  doctor?: { slug: string | null } | null;
  post_year: number | null;
  post_slug: string | null;
  shortcode: string | null;
  author?: { handle: string | null } | null;
}): string {
  if (c.doctor?.slug && c.post_year && c.post_slug) return `/doctors/${c.doctor.slug}/${c.post_year}/${c.post_slug}`;
  if (c.shortcode && c.author?.handle) return `/${c.author.handle}/${c.shortcode}`;
  return "/";
}

/** 날짜 미상(visited_on=NULL) 일기를 모으는 sentinel 연도. year 내림차순 정렬에서 항상 맨 끝.
 *  소비측(RecordNotesPanel)은 year===UNKNOWN_YEAR 를 "날짜 미상"으로 분기 처리한다. */
export const UNKNOWN_YEAR = 0;

/** diaries 행 → 내 노트 패널이 쓰는 SummaryGroup[](연도 내림차순, 같은 해는 최신 방문순).
 *  visited_on=NULL(precision='unknown', 마이그 0302) 일기는 UNKNOWN_YEAR 그룹(date="")으로 분리 —
 *  날짜 split/포맷 크래시 방지 + 정렬상 맨 끝(별도 묶음). */
export function toSummaryGroups(rows: DiaryRow[]): SummaryGroup[] {
  const byYear = new Map<number, SummaryItem[]>();
  for (const r of rows) {
    // visited_on 이 NULL("날짜 잘 기억 안 나요")이면 split 하지 않고 UNKNOWN_YEAR·date="" 로 처리.
    const hasDate = !!r.visited_on;
    const [, m, d] = hasDate ? r.visited_on!.split("-") : [undefined, undefined, undefined];
    const year = hasDate ? Number(r.visited_on!.slice(0, 4)) : UNKNOWN_YEAR;
    const procs = [...r.diary_procedures].sort((a, b) => a.sort_order - b.sort_order);
    const items = procs.map((p) => ({ name: p.procedure_ko, unit: p.unit_text ?? "" }));
    const totalPrice = procs.reduce((s, p) => s + (p.price ?? 0), 0);
    const hasPrice = procs.some((p) => p.price != null);
    const item: SummaryItem = {
      id: String(r.id),
      date: hasDate ? `${m}.${d}` : "", // 날짜 미상이면 빈 문자열(소비측이 "날짜 미상"으로 표시)
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
    .sort((a, b) => b[0] - a[0]) // 연도 내림차순 → UNKNOWN_YEAR(0) 은 자동으로 맨 끝
    .map(([year, items]) => ({ year, items: [...items].sort((a, b) => b.date.localeCompare(a.date)) }));
}

/** KeywordCardRow → KeywordPost. matchedKeywords = 칩(관심/인기) ∩ 카드 keywords (필터용). */
export function toKeywordPost(c: KeywordCardRow, chipSet: Set<string>, now: number): KeywordPost {
  const matched = (c.keywords ?? []).filter((k) => chipSet.has(k));
  return {
    id: c.id,
    title: c.title ?? "",
    type: "qa",
    authorName: c.doctor?.name ?? c.author?.display_name ?? "회원",
    // 원장 글은 피드와 동일한 아바타 보정(getDoctorPhoto/theme)을 위해 slug 전달. 회원 글은 avatar_url.
    doctorSlug: c.doctor?.slug ?? null,
    avatarUrl: c.doctor ? null : c.author?.avatar_url ?? null,
    isNew: c.created_at ? now - new Date(c.created_at).getTime() < DAY_MS : false,
    timeAgo: c.created_at ? formatRelativeTime(c.created_at) : "",
    keyword: matched[0] ?? (c.keywords?.[0] ?? ""),
    matchedKeywords: matched.length > 0 ? matched : (c.keywords ?? []),
    href: cardHrefFromRecord(c),
  };
}

/** 인기글 한 건(순위·제목·작성자·타입·조회수·링크). */
export type PopularItem = {
  rank: number;
  title: string;
  authorName: string;
  type: string; // cards.category
  views: number;
  href: string;
};
export type PopularData = { d7: PopularItem[]; d30: PopularItem[]; d90: PopularItem[] };

/**
 * 인기글 3기간(7/30/90일) RPC 결과를 카드 enrich(공개 카드만, deleted 제외) 후 PopularData 로.
 *
 * 운영 record/page.tsx 의 인기글 가공(254-285줄)을 그대로 추출 — 동작 동일.
 *   - 각 기간 행에서 deleted_at 제거
 *   - 공개(published) 카드만 in() 으로 enrich → href·type 결정
 *   - enrich 안 된(비공개·삭제) 행은 제외, 남은 행에 1부터 순위 재부여
 */
export async function buildPopularData(
  supabase: SupabaseClient,
  top7: TopCardRow[],
  top30: TopCardRow[],
  top90: TopCardRow[],
): Promise<PopularData> {
  const periods: [keyof PopularData, TopCardRow[]][] = [
    ["d7", top7.filter((r) => !r.deleted_at)],
    ["d30", top30.filter((r) => !r.deleted_at)],
    ["d90", top90.filter((r) => !r.deleted_at)],
  ];
  const allIds = Array.from(new Set(periods.flatMap(([, rs]) => rs.map((r) => r.card_id))));
  const enrichMap = new Map<number, { href: string; type: string }>();
  if (allIds.length > 0) {
    const { data: enrichRows } = await supabase
      .from("cards")
      .select(
        "id, category, post_year, post_slug, shortcode, doctor:doctors(slug), author:profiles!cards_author_id_profiles_fkey(handle)",
      )
      .in("id", allIds)
      .eq("status", "published")
      .is("deleted_at", null)
      .returns<
        {
          id: number;
          category: string | null;
          post_year: number | null;
          post_slug: string | null;
          shortcode: string | null;
          doctor: { slug: string | null } | null;
          author: { handle: string | null } | null;
        }[]
      >();
    for (const e of enrichRows ?? []) enrichMap.set(e.id, { href: cardHrefFromRecord(e), type: e.category ?? "" });
  }
  return Object.fromEntries(
    periods.map(([key, rs]) => [
      key,
      rs
        .filter((r) => enrichMap.has(r.card_id))
        .map(
          (r, i): PopularItem => ({
            rank: i + 1,
            title: r.title ?? "",
            authorName: r.author_name ?? "회원",
            type: enrichMap.get(r.card_id)?.type ?? "",
            views: Number(r.cnt) || 0,
            href: enrichMap.get(r.card_id)?.href ?? "/",
          }),
        ),
    ]),
  ) as PopularData;
}
