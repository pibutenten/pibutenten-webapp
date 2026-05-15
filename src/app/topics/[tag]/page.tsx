import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type CardData } from "@/components/Card";
import CardMasonry from "@/components/CardMasonry";
import { SITE_URL } from "@/lib/site";

/**
 * /topics/{태그} — 태그별 의사 글 hub.
 *
 * v5.2 spec:
 *  - URL은 한국어 그대로 (UTF-8)
 *  - 의사 글 4개 이상 모인 태그만 페이지 활성화 (그 미만은 404)
 *  - 정렬: SNS-style 시간가중 + jitter (메인 피드와 동일)
 *    · tag_qas_scored RPC (HALF_LIFE=14일, JITTER_AMP=0.2)
 *    · 봇·사용자 동일 RPC — Google이 다른 순서를 봐도 무방
 *    · canonical은 그대로 → SEO 영향 X
 *  - posted_as='official' AND category IN ('qa','tip') 만 인덱싱
 *  - JSON-LD CollectionPage + ItemList (itemListOrder=Unordered)
 *  - ISR 비활성: dynamic — 매 요청마다 새 셔플 (jitter 살리기)
 */

export const dynamic = "force-dynamic";
export const dynamicParams = true;

const PAGE_LIMIT = 50; // 페이지당 카드 수 (단순 — 페이지네이션은 추후)
const MIN_DOCTOR_POSTS = 4;

type Props = {
  params: Promise<{ tag: string }>;
};

type IndexableTag = { keyword: string; cnt: number };

async function fetchAllIndexableTags(): Promise<IndexableTag[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_indexable_tags", {
    p_min_count: MIN_DOCTOR_POSTS,
  });
  return (data ?? []) as IndexableTag[];
}

async function fetchPostsForTag(
  tag: string,
): Promise<{ posts: CardData[]; count: number }> {
  const supabase = await createSupabaseServerClient();
  // 시간가중 + jitter 셔플 — tag_qas_scored RPC
  // (메인 피드 feed_qas_scored 와 동일 공식: HALF_LIFE=14일, jitter=0.2 → ±10%)
  const rpcRes = await supabase.rpc("tag_cards_scored", {
    p_tag: tag,
    p_limit: PAGE_LIMIT,
    p_offset: 0,
    p_half_life_days: 14,
    p_jitter_amp: 0.2,
  });
  const posts = (rpcRes.data ?? []) as CardData[];

  // count 는 RPC가 limit 까지만 주므로 별도 조회 (인덱싱 조건 동일)
  const { count } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("posted_as", "official")
    .in("category", ["qa", "tip"])
    .not("doctor_id", "is", null)
    .contains("keywords", [tag]);

  return { posts, count: count ?? 0 };
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);
  const url = `${SITE_URL}/topics/${encodeURIComponent(tag)}`;
  return {
    title: `${tag} — 피부과 전문의 답변 모음`,
    description: `${tag} 관련 피부과 전문의의 검증된 답변과 칼럼. 시술 원리·효과·부작용·관리법까지 한곳에서.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${tag} — 피부과 전문의 답변 모음 | 피부텐텐`,
      description: `${tag} 관련 피부과 전문의의 검증된 답변·칼럼.`,
      url,
      type: "website",
    },
  };
}

export default async function TagPage({ params }: Props) {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).trim();
  if (!tag) notFound();

  // 1) 의사 글 4개 이상인지 검증 — 미만이면 404
  const allTags = await fetchAllIndexableTags();
  const found = allTags.find((t) => t.keyword === tag);
  if (!found) notFound();

  // 2) 해당 태그의 의사 글 fetch (최신순)
  const { posts, count } = await fetchPostsForTag(tag);
  if (posts.length === 0) notFound();

  // 3) JSON-LD CollectionPage + ItemList
  const url = `${SITE_URL}/topics/${encodeURIComponent(tag)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${tag} — 피부과 전문의 답변 모음`,
    url,
    about: { "@type": "Thing", name: tag },
    isPartOf: {
      "@type": "WebSite",
      name: "피부텐텐",
      url: SITE_URL,
    },
    inLanguage: "ko-KR",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      // 시간가중 + jitter 셔플이라 명확한 순서 없음
      itemListOrder: "https://schema.org/ItemListUnordered",
      itemListElement: posts.slice(0, 20).map((p, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: postUrl(p),
        name: p.question,
      })),
    },
  };

  return (
    <section className="w-full py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mb-6">
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--primary)]">
            홈
          </Link>{" "}
          / 태그
        </p>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          #{tag}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          피부과 전문의가 답한 <strong>{tag}</strong> 관련 글{" "}
          <span className="font-bold text-[var(--primary)]">
            {count}
          </span>
          개.
        </p>
      </header>

      {/* 메인 피드와 동일한 Masonry — CardMasonry는 client wrapper */}
      <CardMasonry posts={posts} />

      {count > PAGE_LIMIT && (
        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          {PAGE_LIMIT}개 중 처음 {PAGE_LIMIT}개를 표시합니다. 더 보려면{" "}
          <Link
            href={`/search?q=${encodeURIComponent(tag)}`}
            className="font-medium text-[var(--primary)] hover:underline"
          >
            검색 페이지
          </Link>
          를 이용해주세요.
        </p>
      )}
    </section>
  );
}

/**
 * Card 글의 canonical URL 계산 — JSON-LD ItemList용.
 * 의사 글이라 항상 doctor + post_year + post_slug 가 있어야 함.
 * (없으면 fallback /{handle}/{shortcode})
 */
function postUrl(p: CardData): string {
  const d = p.doctor as { slug: string } | null | undefined;
  if (d?.slug && p.post_year && p.post_slug) {
    return `${SITE_URL}/doctors/${d.slug}/${p.post_year}/${p.post_slug}`;
  }
  if (p.shortcode) {
    const a = p.author as { handle?: string | null } | null | undefined;
    const handle = a?.handle ?? null;
    if (handle) return `${SITE_URL}/${handle}/${p.shortcode}`;
  }
  return SITE_URL;
}
