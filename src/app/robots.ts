import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt — Next.js App Router 자동 생성.
 *
 * 정책 (2026-05-17 ~ 2026-06-01 베타기간):
 *  - 전체 봇 차단 (검색엔진 인덱싱 X, AI 크롤러 X).
 *  - 6/1 전체 공개 시점에 기존 정책(검색엔진 + AI 봇 허용)으로 환원 예정.
 *
 * ※ robots.txt 는 권고일 뿐. 악의적 크롤러는 무시 가능.
 *   완전 차단이 필요하면 Vercel Deployment Protection (비밀번호) 사용 권장.
 */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
    host: SITE_URL,
  };
}
