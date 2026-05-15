import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import StatsListClient, {
  type Kind,
  type VisitorRow,
  type CardRow,
} from "./StatsListClient";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "활동 통계",
  robots: { index: false, follow: false },
};

const KIND_TITLES: Record<Kind, string> = {
  visitors: "방문자",
  views: "조회된 글",
  comments: "댓글 많은 글",
  likes: "좋아요 많은 글",
  saves: "저장 많은 글",
  shares: "공유 많은 글",
};

const KIND_RPCS: Record<Kind, string> = {
  visitors: "get_top_visitors",
  views: "get_top_cards_by_views",
  comments: "get_top_cards_by_comments",
  likes: "get_top_cards_by_likes",
  saves: "get_top_cards_by_saves",
  shares: "get_top_cards_by_shares",
};

const ALLOWED_KINDS: Kind[] = [
  "visitors",
  "views",
  "comments",
  "likes",
  "saves",
  "shares",
];

const FIRST_PAGE_SIZE = 50;
const DEFAULT_DAYS = 7;

type Props = {
  params: Promise<{ kind: string }>;
  searchParams?: Promise<{ days?: string }>;
};

/**
 * /admin/stats/{kind} — 활동 통계 TOP 리스트.
 *
 * 6개 KPI(방문자/조회/댓글/좋아요/저장/공유)에 공통 패턴 — RPC + StatsListClient.
 * 무한 스크롤 + 기간 토글 6종 통일.
 */
export default async function StatsKindPage({ params, searchParams }: Props) {
  const { kind: kindRaw } = await params;
  const kind = ALLOWED_KINDS.includes(kindRaw as Kind) ? (kindRaw as Kind) : null;
  if (!kind) notFound();

  // PRD §C — 묶음 OR 가드 (admin or doctor admin)
  await requireAdminPage(`/admin/stats/${kind}`);
  const supabase = await createSupabaseServerClient();

  const sp = (await searchParams) ?? {};
  const daysRaw = parseInt(sp.days ?? String(DEFAULT_DAYS), 10);
  const days = [1, 7, 30, 90, 365, 0].includes(daysRaw) ? daysRaw : DEFAULT_DAYS;

  const rpc = KIND_RPCS[kind];
  const result = await supabase.rpc(rpc, {
    p_days: days,
    p_limit: FIRST_PAGE_SIZE + 1,
    p_offset: 0,
  });
  let rows = (result.data ?? []) as (VisitorRow | CardRow)[];
  const hasMore = rows.length > FIRST_PAGE_SIZE;

  // comments kind: 각 qa의 기간 내 댓글(+대댓글)도 함께 fetch — 항상 펼친 상태로 표시
  if (kind === "comments" && rows.length > 0) {
    const since =
      days === 0
        ? "1970-01-01T00:00:00Z"
        // eslint-disable-next-line react-hooks/purity -- server component, request-time
        : new Date(Date.now() - days * 86400_000).toISOString();
    const cardIds = (rows as CardRow[])
      .map((r) => r.card_id)
      .filter((id): id is number => typeof id === "number");
    if (cardIds.length > 0) {
      const { data: comments } = await supabase
        .from("comments")
        .select(
          "id, card_id, body, created_at, parent_id, author_id, author:profiles!comments_author_id_fkey(display_name, handle)",
        )
        .in("card_id", cardIds)
        .eq("status", "visible")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      const byCard = new Map<number, unknown[]>();
      for (const c of comments ?? []) {
        const cardId = (c as { card_id: number }).card_id;
        if (!byCard.has(cardId)) byCard.set(cardId, []);
        byCard.get(cardId)!.push(c);
      }
      rows = (rows as CardRow[]).map((r) => ({
        ...r,
        comments: byCard.get(r.card_id) ?? [],
      })) as CardRow[];
    }
  }

  const firstPage = rows.slice(0, FIRST_PAGE_SIZE);

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          {KIND_TITLES[kind]} TOP
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          기간별 TOP 리스트 — 클릭하면 해당 사용자/글로 이동합니다.
        </p>
      </div>

      <StatsListClient
        kind={kind}
        initial={firstPage}
        initialHasMore={hasMore}
        initialDays={days}
      />
    </section>
  );
}
