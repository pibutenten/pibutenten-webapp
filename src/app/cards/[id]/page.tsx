import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * `/cards/{id}` — 카드 ID 단일 진입점. canonical URL 로 즉시 302 redirect.
 *
 * 정책 (2026-05-17): 모든 발행된 카드는 정확히 하나의 canonical URL 을 갖는다.
 *   - 의사 Q&A → `/doctors/{slug}/{year}/{post_slug}`
 *   - 그 외 모든 글(회원·의사의 포스팅·꿀팁 등) → `/{author_handle}/{shortcode}`
 *
 * 둘 다 못 만드는 카드는 데이터 무결성 오류로 본다 (`notFound`).
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
      `id, category, post_year, post_slug, shortcode,
       doctor:doctors(slug),
       author:profiles!cards_author_id_profiles_fkey(handle)`,
    )
    .eq("id", cardId)
    .maybeSingle()
    .returns<{
      id: number;
      category: string | null;
      post_year: number | null;
      post_slug: string | null;
      shortcode: string | null;
      doctor: { slug: string } | { slug: string }[] | null;
      author: { handle: string | null } | { handle: string | null }[] | null;
    } | null>();

  if (!card) notFound();

  const doctor = Array.isArray(card.doctor) ? card.doctor[0] ?? null : card.doctor;
  const author = Array.isArray(card.author) ? card.author[0] ?? null : card.author;

  if (
    card.category === "qa" &&
    doctor?.slug &&
    card.post_year &&
    card.post_slug
  ) {
    redirect(`/doctors/${doctor.slug}/${card.post_year}/${card.post_slug}`);
  }

  if (author?.handle && card.shortcode) {
    redirect(`/${author.handle}/${card.shortcode}`);
  }

  notFound();
}
