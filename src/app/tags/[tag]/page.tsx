import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
import { SITE_URL } from "@/lib/site";

/**
 * /tags/{태그} — 태그별 의사 글 hub.
 *
 * v5.1 spec:
 *  - URL은 한국어 그대로 (UTF-8)
 *  - 의사 글 4개 이상 모인 태그만 페이지 활성화 (그 미만은 404)
 *  - 정렬은 최신순 고정 (셔플 X) — 봇·사용자 동일 정렬
 *  - posted_as='official' AND category IN ('qa','tip') 만 인덱싱
 *  - JSON-LD CollectionPage + ItemList
 *  - ISR 1시간 (새 글 발행 시 자연스레 갱신)
 */

export const revalidate = 3600;
export const dynamicParams = true; // 빌드 시 미생성 태그도 첫 요청 시 SSR 후 캐시

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
): Promise<{ posts: QACardData[]; count: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, count } = await supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords, type, created_at, updated_at, posted_as,
      like_count, view_count, share_count, comment_count, save_count,
      rating_avg, rating_count,
      post_year, post_slug, shortcode,
      category, hide_doctor_credential,
      external_url, external_title, external_description, external_image, external_site_name,
      doctor:doctors(slug, name, branch),
      author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url, handle, alt_handle),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
      { count: "exact" },
    )
    .eq("status", "published")
    .eq("posted_as", "official")
    .in("category", ["qa", "tip"])
    .not("doctor_id", "is", null)
    .contains("keywords", [tag])
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT)
    .returns<QACardData[]>();
  return { posts: data ?? [], count: count ?? 0 };
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);
  const url = `${SITE_URL}/tags/${encodeURIComponent(tag)}`;
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
  const url = `${SITE_URL}/tags/${encodeURIComponent(tag)}`;
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
      itemListOrder: "https://schema.org/ItemListOrderDescending",
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
          개. 최신순으로 정렬됩니다.
        </p>
      </header>

      <div className="space-y-4">
        {posts.map((qa) => (
          <QACard key={qa.id} qa={qa} />
        ))}
      </div>

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
 * QACard 글의 canonical URL 계산 — JSON-LD ItemList용.
 * 의사 글이라 항상 doctor + post_year + post_slug 가 있어야 함.
 * (없으면 fallback /{handle}/{shortcode})
 */
function postUrl(p: QACardData): string {
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
