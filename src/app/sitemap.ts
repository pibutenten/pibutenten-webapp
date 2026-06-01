import type { MetadataRoute } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

// SITE_PUBLIC env + 신규 발행 글 lastmod 를 매 요청 반영.
export const dynamic = "force-dynamic";

/**
 * sitemap.xml — Next.js App Router 자동 생성.
 *
 * 포함:
 *  - 정적 라우트 (/, /doctors, /about, 신뢰 페이지 9종)
 *  - 참여 전문의 프로필 (/doctors/{slug})
 *  - 발행된 의사 글 (canonical: /doctors/{slug}/{year}/{post_slug})
 *  - /topics/{태그} — 의사 글 4개 이상 모인 태그 hub (AEO/GEO 자산)
 *
 * 제외 (robots에서도 차단):
 *  - /{handle}/{shortcode} (회원 글 — UGC, YMYL 안전성)
 *  - /admin/*, /onboarding, /write, /signup, /login
 *  - /api, /debug
 *  - SEO URL 구성 못 하는 의사 글(post_slug/post_year 누락)도 sitemap에서 제외
 *
 * 2026-05-28 변경:
 *  - 신뢰 페이지 9종 (editorial-policy/medical-review/corrections/disclosures/disclaimer/
 *    doctor-guidelines/contact/terms/privacy) staticRoutes 에 추가
 *  - cards.updated_at 추가 select → lastModified 정확화 (updated_at ?? created_at)
 */

export const revalidate = 3600; // 1시간마다 재생성

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // 정적 라우트
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/doctors`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // 신뢰 페이지 (2026-05-28 추가) — YMYL E-E-A-T 신호
    {
      url: `${SITE_URL}/editorial-policy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/medical-review`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/corrections`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/disclosures`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/disclaimer`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/doctor-guidelines`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  try {
    const supabase = await createSupabaseServerClient();

    // 발행된 글 — 의사가 작성한 Q&A canonical 만.
    // M5 (2026-05-28): category='qa' 필터 추가. 의사의 비-qa 카드 (tip 등) 가 doctor canonical
    // URL 로 sitemap 에 들어가면 page 가 404 반환 (page 가 category=qa 강제) → soft 404.
    const { data: publishedCards } = await supabase
      .from("cards")
      .select(
        "id, created_at, reviewed_at, updated_at, doctor_id, post_year, post_slug, doctor:doctors(slug)",
      )
      .eq("status", "published")
      .eq("category", "qa")
      .not("doctor_id", "is", null);

    // 의사 프로필 참여 전문의
    const { data: doctors } = await supabase
      .from("doctors")
      .select("slug, updated_at, created_at");

    const cardRoutes: MetadataRoute.Sitemap = (publishedCards ?? []).flatMap((q) => {
      // 표시일 SSOT (P1-b): lastModified = reviewed_at(검수일) ?? created_at.
      //   날짜 표시처를 한 규칙으로 통일 (Q&A=검수일, post=created_at).
      const lastModifiedSource = q.reviewed_at ?? q.created_at;
      const lastModified = lastModifiedSource ? new Date(lastModifiedSource) : now;
      // 의사 글 + post_year + post_slug → canonical URL
      // (Supabase nested doctors join은 1:1이지만 array로 올 수 있어 조심)
      const docRel = (q as { doctor?: { slug: string } | { slug: string }[] | null }).doctor;
      const docSlug = Array.isArray(docRel)
        ? docRel[0]?.slug
        : docRel?.slug;
      if (docSlug && q.post_year && q.post_slug) {
        return [
          {
            url: `${SITE_URL}/doctors/${docSlug}/${q.post_year}/${encodeURIComponent(q.post_slug)}`,
            lastModified,
            changeFrequency: "monthly" as const,
            priority: 0.8,
          },
        ];
      }
      // SEO URL 만들 수 없는 글은 sitemap에서 제외
      return [];
    });

    // 의사 프로필 — /doctors/{slug}
    const doctorRoutes: MetadataRoute.Sitemap = (doctors ?? []).map((d) => ({
      url: `${SITE_URL}/doctors/${d.slug}`,
      lastModified: d.updated_at
        ? new Date(d.updated_at)
        : d.created_at
          ? new Date(d.created_at)
          : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    // /topics/{태그} — 의사 글 4개 이상인 태그만
    const { data: tags } = await supabase.rpc("get_indexable_tags", {
      p_min_count: 4,
    });
    const tagRoutes: MetadataRoute.Sitemap = (
      (tags ?? []) as Array<{ keyword: string; cnt: number }>
    ).map((t) => ({
      url: `${SITE_URL}/topics/${encodeURIComponent(t.keyword)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    return [...staticRoutes, ...doctorRoutes, ...tagRoutes, ...cardRoutes];
  } catch (e) {
    // DB 접근 실패 시에도 정적 라우트는 노출
    console.warn("[sitemap] DB fetch failed, fallback to static routes:", e);
    return staticRoutes;
  }
}
