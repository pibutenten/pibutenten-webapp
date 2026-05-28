/**
 * OG (OpenGraph) + Twitter 메타 공용 헬퍼 SSOT (2026-05-28 신설).
 *
 * 옛: doctors/[slug]/page.tsx, doctors/[slug]/[year]/[postSlug]/page.tsx,
 *     [handle]/[shortcode]/page.tsx 가 같은 openGraph/twitter boilerplate 를 각자 작성.
 * 현재: 본 모듈에서 통합. 호출자는 도메인 데이터만 넘기면 메타 객체 일관 반환.
 *
 * 사용 패턴:
 *   import { buildOgImage, buildSocialMeta } from "@/lib/og-meta";
 *
 *   export async function generateMetadata(...) {
 *     const ogImage = buildOgImage(doctor.slug);
 *     return {
 *       title, description, alternates: { canonical },
 *       ...buildSocialMeta({ title, description, canonical, ogImage, ogType: "article" }),
 *     };
 *   }
 */

import type { Metadata } from "next";

/**
 * OG 이미지 URL 결정.
 *
 *   - doctorSlug 가 있으면 `/og/{slug}.png` (의사별 커스텀 이미지)
 *   - 없으면 기본 `/og.png`
 *
 * /public/og/{slug}.png 가 실제로 있는지는 빌드 시점에 보장 (런타임 확인 안 함).
 * 누락 시 OG crawler 가 fallback 이미지를 표시 (또는 broken). admin 운영 책임.
 */
export function buildOgImage(doctorSlug: string | null | undefined): string {
  return doctorSlug ? `/og/${doctorSlug}.png` : `/og.png`;
}

/**
 * openGraph + twitter 메타 객체 통합 빌더.
 *
 *   - ogType 기본 'website' (Next.js Metadata 의 OpenGraph type).
 *     단일 글 = 'article', 의사 프로필 = 'profile' 등.
 *   - 이미지는 1200×630 (Twitter summary_large_image 표준) 고정.
 *   - twitter.images 는 객체 배열 대신 단순 string 배열 (Next.js Metadata 표준 형식).
 */
export function buildSocialMeta(params: {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType?: "website" | "article" | "profile";
  /** OG 이미지의 alt 텍스트 (스크린리더용). 생략 시 title 재사용. */
  ogImageAlt?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { title, description, canonical, ogImage, ogType = "website", ogImageAlt } = params;
  const altText = ogImageAlt ?? title;
  return {
    openGraph: {
      type: ogType,
      title,
      description,
      url: canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: altText }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}
