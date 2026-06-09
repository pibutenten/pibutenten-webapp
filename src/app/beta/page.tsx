import type { Metadata } from "next";
import BetaApp, { type FeedPost } from "./BetaApp";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData, ReviewSummaryData } from "@/lib/types/card";

/**
 * 피부텐텐 베타 — 새 앱/웹 통합 구조를 실제처럼 체험하는 화면.
 * 같은 호스트(pibutenten.kr/beta)라 로그인 상태가 그대로 유지된다.
 * 피드는 실제 운영 DB(feed_cards_scored). noindex.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "피부텐텐 베타 (검토용)",
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

export default async function BetaPage() {
  const sb = await createSupabaseServerClient();

  let cards: CardData[] = [];
  try {
    const r = await sb.rpc("feed_cards_scored", { p_limit: 60, p_offset: 0, p_half_life_days: 14, p_jitter_amp: 0.35 });
    cards = (r.data ?? []) as CardData[];
  } catch { /* 빈 피드여도 셸은 동작 */ }

  let reportCards: CardData[] = [];
  try {
    const rr = await sb.from("cards").select(CARD_LIST_SELECT).eq("type", "review_summary").order("created_at", { ascending: false }).limit(10);
    reportCards = (rr.data ?? []) as unknown as CardData[];
  } catch { /* noop */ }

  const { data: { user } } = await sb.auth.getUser();

  const posts = cards.map(mapCard);
  let reports = reportCards.map(mapCard);
  if (reports.length === 0) reports = posts.filter((p) => p.kind === "review_summary");

  return <BetaApp posts={posts} reports={reports} isLoggedIn={!!user} />;
}
