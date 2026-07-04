import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getQaUrl } from "@/lib/card-url";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * `/cards/{id}` — 카드 ID 단일 진입점. canonical URL 로 즉시 redirect.
 *
 * URL 규칙은 TS SSOT `getQaUrl`(src/lib/card-url.ts) 에 위임한다 (R1-2 M-7, 2026-07-04).
 *   과거 이 파일이 규칙 사본을 인라인로 들고 있어 review_summary 분기가 누락 →
 *   시술 리포트 앵커 카드가 전부 404 나던 버그의 원인. 분기 재복제 금지.
 *   - 시술 리포트 앵커 (type=review_summary + post_slug) → `/reports/{post_slug}`
 *   - 의사 글 (doctor slug + post_year + post_slug) → `/doctors/{slug}/{year}/{post_slug}`
 *   - 회원 글 (author handle + shortcode) → `/{handle}/{shortcode}`
 *
 * getQaUrl 이 URL 을 못 만드는 카드('/' fallback)는 데이터 무결성 오류로 본다 (`notFound`).
 * 편집기 / 홈 / doctor 메인 페이지 등 어떤 fallback 도 두지 않음.
 */
export default async function CardRedirectPage({ params }: Props) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (!Number.isFinite(cardId)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: card } = await supabase
    .from("cards")
    .select(
      `id, type, post_year, post_slug, shortcode,
       doctor:doctors(slug),
       author:profiles!cards_author_id_profiles_fkey(handle)`,
    )
    .eq("id", cardId)
    .maybeSingle()
    .returns<{
      id: number;
      type: string | null;
      post_year: number | null;
      post_slug: string | null;
      shortcode: string | null;
      doctor: { slug: string } | { slug: string }[] | null;
      author: { handle: string | null } | { handle: string | null }[] | null;
    } | null>();

  if (!card) notFound();

  const doctor = Array.isArray(card.doctor) ? card.doctor[0] ?? null : card.doctor;
  const author = Array.isArray(card.author) ? card.author[0] ?? null : card.author;

  const url = getQaUrl({
    id: card.id,
    type: card.type ?? undefined,
    doctor,
    post_year: card.post_year,
    post_slug: card.post_slug,
    shortcode: card.shortcode,
    author,
  });

  if (url === "/") notFound();

  redirect(url);
}
