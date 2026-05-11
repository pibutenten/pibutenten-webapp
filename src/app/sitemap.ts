import type { MetadataRoute } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

/**
 * sitemap.xml — Next.js App Router 자동 생성.
 *
 * 포함:
 *  - 정적 라우트 (/, /doctors, /about)
 *  - 의사 9명 프로필 (/doctors/{slug})
 *  - 발행된 의사 글 (canonical: /doctors/{slug}/{year}/{post_slug})
 *  - /tags/{태그} — 의사 글 4개 이상 모인 태그 hub (AEO/GEO 자산)
 *
 * 제외 (robots에서도 차단):
 *  - /{handle}/{shortcode} (회원 글 — UGC, YMYL 안전성)
 *  - /me/*, /admin/*, /onboarding, /write, /signup, /login
 *  - /api, /debug
 *  - SEO URL 구성 못 하는 의사 글(post_slug/post_year 누락)도 sitemap에서 제외
 *
 * v5.1: 칼럼(type='article') 폐기 — /article 라우트 제거됨.
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
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/doctors`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  try {
    const supabase = await createSupabaseServerClient();

    // 발행된 글 — 의사가 작성한 것만 (UGC 회원 글은 제외 위해 doctor_id 기준)
    const { data: qas } = await supabase
      .from("qas")
      .select(
        "id, created_at, doctor_id, post_year, post_slug, doctor:doctors(slug)",
      )
      .eq("status", "published")
      .not("doctor_id", "is", null);

    // 의사 프로필 9명
    const { data: doctors } = await supabase
      .from("doctors")
      .select("slug, updated_at, created_at");

    const qaRoutes: MetadataRoute.Sitemap = (qas ?? []).flatMap((q) => {
      const lastModified = q.created_at ? new Date(q.created_at) : now;
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

    // /tags/{태그} — 의사 글 4개 이상인 태그만
    const { data: tags } = await supabase.rpc("get_indexable_tags", {
      p_min_count: 4,
    });
    const tagRoutes: MetadataRoute.Sitemap = (
      (tags ?? []) as Array<{ keyword: string; cnt: number }>
    ).map((t) => ({
      url: `${SITE_URL}/tags/${encodeURIComponent(t.keyword)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    return [...staticRoutes, ...doctorRoutes, ...tagRoutes, ...qaRoutes];
  } catch (e) {
    // DB 접근 실패 시에도 정적 라우트는 노출
    console.warn("[sitemap] DB fetch failed, fallback to static routes:", e);
    return staticRoutes;
  }
}
