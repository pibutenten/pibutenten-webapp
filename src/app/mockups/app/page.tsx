import type { Metadata } from "next";
import AppShellMockup, { type FeedPost } from "./AppShellMockup";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData, ReviewSummaryData } from "@/lib/types/card";

/**
 * 피부텐텐 앱/웹 통합 정보구조(IA) — 검토용 셸 목업.
 * "새 옷(새 디자인)"에 실제 운영 DB 데이터(feed_cards_scored)를 끼워 렌더한다.
 * 상단 토글로 모바일/앱(하단 5탭)·데스크탑 웹(상단 내비)을 모두 미리 본다.
 * noindex — URL 아는 사람만 검토.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "앱/웹 통합 구조 목업 (검토용)",
  robots: { index: false, follow: false },
};

function plain(s: string | null | undefined, n = 90): string {
  if (!s) return "";
  const t = s.replace(/<[^>]*>/g, " ").replace(/[#*_>`~]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}
function rel(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return `${d}일 전`;
  if (h >= 1) return `${h}시간 전`;
  if (m >= 1) return `${m}분 전`;
  return "방금";
}
function firstReview(pr: CardData["procedure_review"]): ReviewSummaryData | null {
  if (!pr) return null;
  return Array.isArray(pr) ? (pr[0] ?? null) : pr;
}
function mapCard(c: CardData): FeedPost {
  const rev = firstReview(c.procedure_review);
  return {
    id: c.id,
    kind: c.type ?? "post",
    title: c.title ?? "",
    excerpt: plain(c.body),
    author: c.doctor?.name ?? c.author?.display_name ?? "익명",
    time: rel(c.created_at ?? c.reviewed_at),
    likes: c.like_count ?? 0,
    comments: c.comment_count ?? 0,
    tags: (c.keywords ?? []).slice(0, 3),
    rating: rev ? rev.satisfaction : null,
  };
}

export default async function AppShellMockupPage() {
  const sb = await createSupabaseServerClient();

  // 홈과 동일한 실제 피드 RPC.
  let cards: CardData[] = [];
  try {
    const r = await sb.rpc("feed_cards_scored", { p_limit: 60, p_offset: 0, p_half_life_days: 14, p_jitter_amp: 0.35 });
    cards = (r.data ?? []) as CardData[];
  } catch { /* 실패 시 빈 피드 — 셸 디자인은 그대로 확인 가능 */ }

  // 리포트(시술 리포트) 카드 — 별도 조회.
  let reportCards: CardData[] = [];
  try {
    const rr = await sb.from("cards").select(CARD_LIST_SELECT).eq("type", "review_summary").order("created_at", { ascending: false }).limit(10);
    reportCards = (rr.data ?? []) as unknown as CardData[];
  } catch { /* noop */ }

  const posts = cards.map(mapCard);
  let reports = reportCards.map(mapCard);
  if (reports.length === 0) reports = posts.filter((p) => p.kind === "review_summary");

  return <AppShellMockup posts={posts} reports={reports} />;
}
