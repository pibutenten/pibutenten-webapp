import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import QACard, { type QACardData } from "@/components/QACard";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string; year: string; shortcode: string }>;
};

type QaWithFields = QACardData & {
  updated_at?: string | null;
};

/**
 * 회원 글 / 의사 personal persona 글 라우트.
 * URL: /{handle}/{year}/{shortcode}
 *
 * - handle은 profiles.handle 또는 alt_handle 어느 쪽이든 매칭
 * - shortcode는 qas.shortcode (UNIQUE) — year 검증으로 잘못된 URL 방지
 */
async function fetchQa(
  handle: string,
  yearStr: string,
  shortcode: string,
): Promise<QaWithFields | null> {
  const year = Number.parseInt(yearStr, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,12}$/.test(shortcode)) return null;
  try {
    const supabase = await createSupabaseServerClient();
    // shortcode UNIQUE이므로 단일 결과. 그 후 author handle/alt_handle 매칭 검증.
    const { data } = await supabase
      .from("qas")
      .select(
        `
        id, question, answer, meta, keywords, type, created_at, updated_at, posted_as,
        like_count, view_count, post_year, post_slug, shortcode,
        category, hide_doctor_credential,
        external_url, external_title, external_description, external_image, external_site_name,
        doctor:doctors(slug, name, branch),
        author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url, handle, alt_handle),
        video:videos(youtube_id, youtube_url, topic, upload_date)
      `,
      )
      .eq("shortcode", shortcode)
      .eq("post_year", year)
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
  const { handle, year, shortcode } = await params;
  const qa = await fetchQa(handle, year, shortcode);
  if (!qa) return { title: "찾을 수 없는 글" };
  const url = `${SITE_URL}/${handle}/${year}/${shortcode}`;
  // 회원·personal 글은 noindex 기본 (인덱싱 가능 카테고리만 허용)
  const indexable = qa.category === "tip";
  return {
    title: qa.question,
    description: (qa.answer ?? "").slice(0, 160),
    alternates: { canonical: url },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function MemberPostPage({ params }: Props) {
  const { handle, year, shortcode } = await params;
  const qa = await fetchQa(handle, year, shortcode);
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
