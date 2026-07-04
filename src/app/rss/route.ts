import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { SITE_URL, INCLUDE_REPORT_ANCHORS } from "@/lib/site";
import { stripMarkdown } from "@/lib/strip-markdown";

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

// R3-3 (2026-07-04): 쿠키리스 anon 클라이언트로 전환 — 기존 createSupabaseServerClient 의
//   cookies() 참조가 라우트를 dynamic 으로 강제해 revalidate=1800 이 무효였음(매 요청 DB 3쿼리).
//   anon RLS 하에서 결과 동일(published·미삭제만) — sitemap.ts 와 같은 근거. 이제 30분 ISR 실효.
//   빌드타임 프리렌더 안전: supabase-js(postgrest-js)는 네트워크 실패도 throw 없이
//   { data: null, error } 반환 → cards/anchors=null → 빈 채널로 프리렌더, 다음 revalidate 에 복구.
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
  const supabase = createSupabaseAnonClient();
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
      // R3-3: markdown 기호(`**굵게**` 등) 제거 후 발췌 — stripMarkdown 이 공백 압축·trim 포함.
      //   `]]>` 는 CDATA 섹션을 조기 종료시키므로 표준 분할 치환으로 방어 (본문 유입 이론상 가능).
      const desc = stripMarkdown(c.body).slice(0, 300).replace(/\]\]>/g, "]]]]><![CDATA[>");
      return [
        `<item>
  <title>${escapeXml(c.title ?? "")}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <pubDate>${pubDate}</pubDate>
  <dc:creator>${escapeXml(doc.name)}</dc:creator>
  <description><![CDATA[${desc}]]></description>
</item>`,
      ];
    })
    .join("\n");

  // 시술 리포트 앵커 — /reports/{ko}(한글 정식 URL). ★게이트 off 기본 + published 한정(이중 차단).
  //   post_slug=영문 en → tag_dictionary(is_procedure) 로 en→ko 매핑 후 한글 link 만 출력(영문은 308 전용).
  let anchorItems = "";
  if (INCLUDE_REPORT_ANCHORS) {
    const { data: anchors } = await supabase
      .from("cards")
      .select("title, post_slug, created_at, updated_at")
      .eq("type", "review_summary")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: taxRows } = await supabase
      .from("tag_dictionary")
      .select("en, ko")
      .eq("is_procedure", true);
    const enToKo = new Map<string, string>(
      ((taxRows ?? []) as Array<{ en: string | null; ko: string | null }>)
        .filter((t): t is { en: string; ko: string } => !!t.en && !!t.ko)
        .map((t) => [t.en, t.ko]),
    );
    anchorItems = ((anchors ?? []) as Array<{
      title: string | null;
      post_slug: string | null;
      created_at: string;
      updated_at: string | null;
    }>)
      .flatMap((a) => {
        if (!a.post_slug) return [];
        const ko = enToKo.get(a.post_slug) ?? a.post_slug;
        const url = `${SITE_URL}/reports/${encodeURIComponent(ko)}`;
        const pubDate = new Date(a.updated_at ?? a.created_at).toUTCString();
        return [
          `<item>
  <title>${escapeXml(a.title ?? "")}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <pubDate>${pubDate}</pubDate>
  <description><![CDATA[회원 후기를 집계한 시술 리포트]]></description>
</item>`,
        ];
      })
      .join("\n");
  }

  // R3-3: RSS 2.0 <author> 는 이메일 형식 요구(스펙) — 이름만 표기하려면 Dublin Core
  //   <dc:creator> 사용이 표준. xmlns:dc 선언은 rss 루트 요소에.
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>피부텐텐 — 피부과 전문의 답변</title>
    <link>${SITE_URL}/</link>
    <description>피부과 전문의가 직접 답하는 리프팅·스킨부스터·안티에이징·피부시술 커뮤니티</description>
    <language>ko-KR</language>
    <lastBuildDate>${
      // ISR 특성상 빌드/revalidate(30분) 시점으로 고정되는 값 — 의도된 동작 (R3-3).
      new Date().toUTCString()
    }</lastBuildDate>
    ${items}
    ${anchorItems}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
