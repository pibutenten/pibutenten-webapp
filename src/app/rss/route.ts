import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

/**
 * RSS Feed — 의사 작성 Q&A 글 최신 50건.
 *
 * 목적: 네이버 Search Advisor freshness signal (외부 도메인에서 네이버에
 * 인지되는 거의 유일한 신호) + Bing/Feedly 등 RSS 리더 노출.
 *
 * 회원 글 누출 방지 필터:
 *   - status = 'published'
 *   - doctor_id IS NOT NULL  (회원 글 제외)
 *   - category = 'qa'        (의사의 tip/diary 등 제외 — sitemap.ts 정책과 동일)
 *   - post_year + post_slug 존재 (canonical URL 구성 가능한 글만)
 *
 * HOLD 모드 인지:
 *   공개 전이라도 RSS 자체는 응답 (robots.ts 의 SITE_PUBLIC=false 면
 *   크롤러가 robots.txt 를 먼저 본 후 RSS 를 가져가지 않음).
 *   robots Allow 와 분리해서 RSS 만 막을 필요는 없음.
 */

export const revalidate = 1800; // 30분 — 네이버 freshness

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type DoctorRel = { slug: string; name: string } | { slug: string; name: string }[] | null;

type CardRow = {
  id: string;
  title: string | null;
  body: string | null;
  created_at: string;
  reviewed_at: string | null;
  post_year: number | null;
  post_slug: string | null;
  doctor: DoctorRel;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  // P2-7 (2026-05-29): pubmed_refs 의도적 미포함.
  //   RSS 피드는 외부 리더(Feedly·네이버 등) 대상 — 본문·메타 간결성 우선.
  //   참고문헌 전체 텍스트는 카드 단일 페이지에서만 노출 (JSON-LD citation 포함).
  const { data: cards } = await supabase
    .from("cards")
    .select(
      "id, title, body, created_at, reviewed_at, post_year, post_slug, doctor_id, doctor:doctors(slug,name)",
    )
    .eq("status", "published")
    .eq("category", "qa")
    .not("doctor_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const items = ((cards ?? []) as CardRow[])
    .flatMap((c) => {
      const doc = Array.isArray(c.doctor) ? c.doctor[0] : c.doctor;
      if (!doc?.slug || !c.post_year || !c.post_slug) return [];
      const url = `${SITE_URL}/doctors/${doc.slug}/${c.post_year}/${encodeURIComponent(c.post_slug)}`;
      // 표시일 SSOT (P1-b): pubDate = reviewed_at(검수일) ?? created_at.
      const pubDate = new Date(c.reviewed_at ?? c.created_at).toUTCString();
      const desc = (c.body ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      return [
        `<item>
  <title>${escapeXml(c.title ?? "")}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <pubDate>${pubDate}</pubDate>
  <author>${escapeXml(doc.name)}</author>
  <description><![CDATA[${desc}]]></description>
</item>`,
      ];
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>피부텐텐 — 피부과 전문의 답변</title>
    <link>${SITE_URL}/</link>
    <description>피부과 전문의가 직접 답하는 리프팅·스킨부스터·안티에이징·피부시술 커뮤니티</description>
    <language>ko-KR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
