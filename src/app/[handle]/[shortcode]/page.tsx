import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/Card";
import { SITE_URL } from "@/lib/site";
import { stripMarkdown } from "@/lib/strip-markdown";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string; shortcode: string }>;
};

type QaWithFields = QACardData & {
  updated_at?: string | null;
};

/**
 * 회원 글 / 의사 personal persona 글 라우트.
 * URL: /{handle}/{shortcode}  (year 세그먼트 제거 — 더 짧고 깔끔)
 *
 * - handle은 profiles.handle 또는 alt_handle 어느 쪽이든 매칭
 * - shortcode는 qas.shortcode (UNIQUE)
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
      .select(
        `
        id, question, answer, meta, keywords, type, created_at, updated_at, posted_as,
        like_count, view_count, post_year, post_slug, shortcode,
        category, hide_doctor_credential, pubmed_ref,
        external_url, external_title, external_description, external_image, external_site_name,
        doctor:doctors(slug, name, branch),
        author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url, handle, alt_handle),
        video:videos(youtube_id, youtube_url, topic, upload_date)
      `,
      )
      .eq("shortcode", shortcode)
      .eq("status", "published")
      .maybeSingle()
      .returns<QaWithFields>();
    if (!data) return null;
    // handle 또는 alt_handle 매칭 — 잘못된 handle prefix로 다른 사람 글 접근 방지
    const a = data.author;
    const matched = a && (a.handle === handle || a.alt_handle === handle);
    if (!matched) return null;
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, shortcode } = await params;
  const qa = await fetchQa(handle, shortcode);
  if (!qa) return { title: "찾을 수 없는 글" };
  const url = `${SITE_URL}/${handle}/${shortcode}`;
  const indexable = qa.category === "tip";
  return {
    title: qa.question,
    description: stripMarkdown(qa.answer).slice(0, 160),
    alternates: { canonical: url },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function MemberPostPage({ params }: Props) {
  const { handle, shortcode } = await params;
  const qa = await fetchQa(handle, shortcode);
  if (!qa) notFound();

  return (
    <section className="w-full py-6">
      <Link
        href={`/${handle}`}
        className="mb-3 inline-block text-xs text-[var(--text-muted)] hover:text-[var(--primary)]"
      >
        ← {handle} 프로필
      </Link>
      <QACard qa={qa} />
    </section>
  );
}

// 옛 URL `/{handle}/{year}/{shortcode}` 호환은 src/app/[handle]/[year]/[shortcode]/page.tsx에서
// 308 redirect로 처리 (이미 인덱싱된 / 외부 공유된 링크 보존).
