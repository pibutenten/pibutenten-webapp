import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_LIST_SELECT } from "@/lib/card-select";
import type { CardData } from "@/lib/types/card";
import { renderBetaPost } from "../post-data";

/**
 * /beta-skin/post/[...slug] — 베타 글상세의 "고유 URL" 라우트.
 *   운영 canonical(getQaUrl) 형태를 /beta-skin/post 접두로 그대로 차용:
 *     - 의사 글:  /beta-skin/post/doctors/{slug}/{year}/{post_slug}
 *     - 회원 글:  /beta-skin/post/{handle}/{shortcode}
 *   ?id= 숫자 URL 대신 의미있는 고유 주소로 진입. 데이터·렌더는 ?id= 라우트와 공용(renderBetaPost).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "신규 스킨 미리보기 · 글 상세",
  robots: { index: false, follow: false },
};

const SELECT = `${CARD_LIST_SELECT}, video_id`;

export default async function BetaCanonicalPostPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  let row: (CardData & { video_id?: number | null }) | null = null;

  if (slug.length === 4 && slug[0] === "doctors") {
    // /doctors/{slug}/{year}/{post_slug}
    const [, dSlug, year, pSlug] = slug;
    const { data } = await supabase
      .from("cards")
      .select(SELECT)
      .eq("post_year", Number(year))
      .eq("post_slug", decodeURIComponent(pSlug))
      .eq("status", "published")
      .is("deleted_at", null)
      .limit(5);
    const rows = (data ?? []) as unknown as (CardData & {
      video_id?: number | null;
    })[];
    row = rows.find((r) => r.doctor?.slug === dSlug) ?? rows[0] ?? null;
  } else if (slug.length === 2) {
    // /{handle}/{shortcode}
    const shortcode = decodeURIComponent(slug[1]);
    const { data } = await supabase
      .from("cards")
      .select(SELECT)
      .eq("shortcode", shortcode)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    row = (data ?? null) as unknown as
      | (CardData & { video_id?: number | null })
      | null;
  }

  if (!row) notFound();

  return renderBetaPost(supabase, row as CardData, row.video_id ?? null);
}
