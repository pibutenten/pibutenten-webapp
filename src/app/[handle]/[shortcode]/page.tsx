import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Card, { type CardData } from "@/components/Card";
import BackButton from "@/components/BackButton";
import { SITE_URL } from "@/lib/site";
import { stripMarkdown } from "@/lib/strip-markdown";
import { CARD_DETAIL_SELECT } from "@/lib/card-select";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string; shortcode: string }>;
};

type QaWithFields = CardData & {
  updated_at?: string | null;
};

/**
 * 회원 글 라우트.
 * URL: /{handle}/{shortcode}  (year 세그먼트 제거 — 더 짧고 깔끔)
 *
 * - handle은 profiles.handle 매칭
 * - shortcode는 cards.shortcode (UNIQUE)
 *
 * 주의: /{handle}만 있을 때(/[handle]/page.tsx)와 라우트 충돌 방지를 위해
 *       shortcode 세그먼트는 base58 6~12자 패턴으로만 매칭 (regex로 검증).
 *       그 외 segment는 next.js가 [handle]/page.tsx로 fallthrough하지 않으므로
 *       notFound() 반환.
 */
async function fetchQa(
  handle: string,
  shortcode: string,
): Promise<QaWithFields | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("cards")
      .select(CARD_DETAIL_SELECT)
      .eq("shortcode", shortcode)
      .eq("status", "published")
      .maybeSingle()
      .returns<QaWithFields>();
    if (!data) return null;
    // handle 매칭 — 잘못된 handle prefix로 다른 사람 글 접근 방지
    const a = data.author;
    const matched = a && a.handle === handle;
    if (!matched) return null;
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, shortcode } = await params;
  const card = await fetchQa(handle, shortcode);
  if (!card) return { title: "찾을 수 없는 글" };
  const url = `${SITE_URL}/${handle}/${shortcode}`;
  const indexable = card.category === "tip";
  return {
    title: card.question,
    description: stripMarkdown(card.answer).slice(0, 160),
    alternates: { canonical: url },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function MemberPostPage({ params }: Props) {
  const { handle, shortcode } = await params;
  const card = await fetchQa(handle, shortcode);
  if (!card) notFound();

  // 정책 (2026-05-15): 의사 Q&A 는 doctor canonical 한 곳에서만 노출.
  // 회원 라우트로 접근 시도 시 → /doctors/{slug}/{year}/{post_slug} 로 영구 redirect (308).
  // Supabase 가 1:1 doctor join 을 array 로 반환하는 케이스 처리.
  // doctor 메타가 누락된 경우 (post_year/post_slug 없음) author_handle 로 doctor.slug 추정.
  const doc = Array.isArray(card.doctor) ? card.doctor[0] : card.doctor;
  if (card.category === "qa") {
    const dslug = doc?.slug ?? handle; // author_handle 이 doctor.slug 와 같음 (의사 글)
    const year = card.post_year ?? new Date(card.created_at ?? Date.now()).getUTCFullYear();
    const pslug = card.post_slug ?? card.shortcode; // post_slug 누락 시 shortcode fallback
    if (dslug && year && pslug) {
      permanentRedirect(`/doctors/${dslug}/${year}/${pslug}`);
    }
  }

  return (
    <section className="w-full py-6">
      {/* 좌상단 ← 뒤로 — 다른 페이지와 동일하게 mb-1 -ml-1 통일. */}
      <div className="mb-1 -ml-1">
        <BackButton fallbackHref={`/${handle}`} />
      </div>
      {/* 단독 카드 상세 — 본문 펼침 + 댓글 자동 펼침 (의사 글 페이지와 동일 정책) */}
      <Card card={card} forceExpanded autoExpandComments asH1 />
    </section>
  );
}

// 옛 URL `/{handle}/{year}/{shortcode}` 호환은 src/app/[handle]/[year]/[shortcode]/page.tsx에서
// 308 redirect로 처리 (이미 인덱싱된 / 외부 공유된 링크 보존).
