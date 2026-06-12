import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import RecordTab, { type QaItem } from "./RecordTab";
import type { SummaryGroup, SummaryItem } from "../mockups/skin-diary/SkinDiaryMockup";

// 관심 키워드 매칭 Q&A 카드 조회용 행.
type QaCardRow = {
  id: number;
  title: string | null;
  body: string | null;
  post_year: number | null;
  post_slug: string | null;
  shortcode: string | null;
  keywords: string[] | null;
  doctor: { slug: string | null; name: string | null } | null;
  author: { handle: string | null; display_name: string | null } | null;
};

/** Q&A 카드 → 카드 상세 링크(원장 글: keyword slug / 회원 글: handle+shortcode). */
function qaCardHref(c: QaCardRow): string {
  if (c.doctor?.slug && c.post_year && c.post_slug)
    return `/doctors/${c.doctor.slug}/${c.post_year}/${c.post_slug}`;
  if (c.shortcode && c.author?.handle) return `/${c.author.handle}/${c.shortcode}`;
  return "/";
}

/** 본문에서 태그 제거 후 짧은 미리보기. */
function snippet(body: string | null, n = 70): string {
  if (!body) return "";
  const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > n ? text.slice(0, n) + "…" : text;
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
  diary_procedures: {
    procedure_ko: string;
    unit_text: string | null;
    price: number | null;
    sort_order: number;
  }[];
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
  // 연도 내림차순 + 같은 해는 날짜("MM.DD") 내림차순 명시 정렬(쿼리 order 의존 제거).
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({
      year,
      items: [...items].sort((a, b) => b.date.localeCompare(a.date)),
    }));
}

// /record — 내 일기(비공개). 로그인 필수. 서버에서 active 명함 diaries 를 조회·변환해 전달.
export default async function RecordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 인사용 이름 + 관심 키워드(온보딩) — active 명함 기준.
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

  const { data } = await supabase
    .from("diaries")
    .select(
      "id, visited_on, clinic_name, clinic_tel, doctor_name, manager_name, diary_body, diary_procedures(procedure_ko, unit_text, price, sort_order)",
    )
    .order("visited_on", { ascending: false })
    .returns<DiaryRow[]>();

  const rows = data ?? [];
  // 상태 문구 계산용 — 가장 최근 방문의 첫 시술명 + 방문일 + 그 시술 누적 횟수('N회차').
  const latestRow = rows[0];
  const latestName =
    latestRow &&
    ([...latestRow.diary_procedures].sort((a, b) => a.sort_order - b.sort_order)[0]?.procedure_ko ??
      "시술");
  const latest = latestRow
    ? {
        name: latestName as string,
        visitedOn: latestRow.visited_on,
        count: rows.filter((r) => r.diary_procedures.some((p) => p.procedure_ko === latestName))
          .length,
      }
    : null;

  // 관심 키워드 새 글 — 회원 관심사에 매칭되는 최근 공개 Q&A(키워드 배열 overlap).
  let qa: QaItem[] = [];
  if (interests.length > 0) {
    const { data: qaRows } = await supabase
      .from("cards")
      .select(
        "id, title, body, post_year, post_slug, shortcode, keywords, doctor:doctors(slug, name), author:profiles!cards_author_id_profiles_fkey(handle, display_name)",
      )
      .eq("category", "qa")
      .eq("status", "published")
      .is("deleted_at", null)
      .overlaps("keywords", interests)
      .order("reviewed_at", { ascending: false })
      .limit(8)
      .returns<QaCardRow[]>();
    const interestSet = new Set(interests);
    qa = (qaRows ?? []).map((c) => ({
      id: c.id,
      title: c.title ?? "",
      snippet: snippet(c.body),
      keyword: (c.keywords ?? []).find((k) => interestSet.has(k)) ?? (c.keywords?.[0] ?? ""),
      doctorName: c.doctor?.name ? `${c.doctor.name} 원장` : c.author?.display_name ?? "",
      href: qaCardHref(c),
    }));
  }

  return <RecordTab summary={toSummaryGroups(rows)} userName={userName} latest={latest} qa={qa} />;
}
