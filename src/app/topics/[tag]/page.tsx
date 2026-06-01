import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type CardData } from "@/components/Card";
import CardMasonry from "@/components/CardMasonry";
import { SITE_URL } from "@/lib/site";
import { jsonLdString } from "@/lib/json-ld";
import {
  clinicIdRefForDoctor,
  clinicSchemaForDoctor,
} from "@/lib/schema/clinic";

/**
 * /topics/{태그} — 태그별 의사 글 hub.
 *
 * v5.2 spec:
 *  - URL은 한국어 그대로 (UTF-8)
 *  - 의사 글 4개 이상 모인 태그만 페이지 활성화 (그 미만은 404)
 *  - 정렬: SNS-style 시간가중 + jitter (메인 피드와 동일)
 *    · tag_cards_scored RPC (HALF_LIFE=14일, JITTER_AMP=0.2)
 *    · 봇·사용자 동일 RPC — Google이 다른 순서를 봐도 무방
 *    · canonical은 그대로 → SEO 영향 X
 *  - doctor 매핑된 글 + category = 'qa' 만 인덱싱 (tip 폐지, 2026-06-01)
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
  // 시간가중 + jitter 셔플 — tag_cards_scored RPC
  // (메인 피드 feed_cards_scored 와 동일 공식: HALF_LIFE=14일, jitter=0.2 → ±10%)
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
    .eq("category", "qa")
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

  // 3) JSON-LD: @graph 로 CollectionPage + FAQPage 묶음 출력.
  //    AEO/GEO/SEO 강화:
  //      - FAQPage.mainEntity = Question[] 각 카드 1개씩
  //      - 각 acceptedAnswer.author = Physician (의사 EEAT 신호 — 검증된 의사 답변)
  //      - publisher / isPartOf = Organization 피부텐텐 (브랜드 권위, layout 의 #organization 참조)
  //    화면 비노출 — Google·Bing·Perplexity·ChatGPT 등이 해석하여 인용 우선순위 결정.
  const url = `${SITE_URL}/topics/${encodeURIComponent(tag)}`;
  const ORG_ID = `${SITE_URL}/#organization`;

  // 답변 본문 snippet — 1단락(또는 400자) 한정. FAQPage spec 권장.
  const answerSnippet = (p: CardData): string => {
    const txt = (p.body ?? "").replace(/\s+/g, " ").trim();
    return txt.length > 400 ? txt.slice(0, 400) + "…" : txt;
  };

  // 의사별 Physician @id (`/doctors/{slug}#person`) — 단일 문서 내 동일 의사 중복 시 @id 로 dedup.
  // worksFor 는 의사 글·프로필 페이지와 동일하게 `clinicIdRefForDoctor` 의 @id 참조 패턴.
  //   참조 entity 의 MedicalClinic schema 는 graph 의 dedup 된 clinicSchemas 에서 함께 inject.
  const doctorPersonRef = (p: CardData) => {
    if (!p.doctor) return null;
    const worksForRef = clinicIdRefForDoctor(p.doctor.slug);
    return {
      "@type": "Physician",
      "@id": `${SITE_URL}/doctors/${p.doctor.slug}#person`,
      name: p.doctor.name,
      jobTitle: "피부과 전문의",
      medicalSpecialty: "https://schema.org/Dermatologic",
      url: `${SITE_URL}/doctors/${p.doctor.slug}`,
      ...(worksForRef ? { worksFor: worksForRef } : {}),
      memberOf: { "@id": ORG_ID },
    };
  };

  // 등장 의사들의 단일 지점 MedicalClinic schema — @id 기준 중복 제거.
  // 한 토픽에 같은 지점 의사 N명이 있어도 그 지점 schema 는 1개만 inject.
  const seenClinicIds = new Set<string>();
  const clinicSchemas: Record<string, unknown>[] = [];
  for (const p of posts) {
    if (!p.doctor?.slug) continue;
    const cs = clinicSchemaForDoctor(p.doctor.slug);
    if (!cs) continue;
    const cid = cs["@id"];
    if (typeof cid !== "string" || seenClinicIds.has(cid)) continue;
    seenClinicIds.add(cid);
    clinicSchemas.push(cs);
  }

  const collectionPage = {
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name: `${tag} — 피부과 전문의 답변 모음`,
    url,
    about: { "@type": "Thing", name: tag },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": ORG_ID },
    inLanguage: "ko-KR",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListOrder: "https://schema.org/ItemListUnordered",
      itemListElement: posts.slice(0, 20).map((p, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: postUrl(p),
        name: p.title,
      })),
    },
  };

  const faqPage = {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": ORG_ID },
    // 각 카드 = Question + acceptedAnswer (의사 작성). FAQPage spec 충족.
    mainEntity: posts.map((p) => ({
      "@type": "Question",
      name: p.title,
      url: postUrl(p),
      acceptedAnswer: {
        "@type": "Answer",
        text: answerSnippet(p),
        url: postUrl(p),
        ...(p.doctor ? { author: doctorPersonRef(p) } : {}),
      },
    })),
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [collectionPage, faqPage, ...clinicSchemas],
  };

  return (
    <section className="w-full py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
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
