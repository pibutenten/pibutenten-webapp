import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleRow, ArticleSection, ArticleSectionVirtualCard } from "./types";
import { splitArticleToVirtualCards } from "./feed";

/**
 * 피드용 article 가상 섹션 카드 로드.
 * - 최근 N개 published article을 가져와서 섹션마다 가상 카드로 분할
 * - searchQuery가 있으면 question/answer ilike로 1차 필터
 * - doctorSlug가 있으면 해당 원장만
 */
export async function loadArticleSectionCards(
  supabase: SupabaseClient,
  opts: {
    limit?: number;
    searchQuery?: string;
    doctorSlug?: string;
  } = {},
): Promise<ArticleSectionVirtualCard[]> {
  const limit = opts.limit ?? 10;
  let q = supabase
    .from("qas")
    .select(
      `id, question, article_sections, article_cover_image, article_slug,
       keywords, like_count, view_count, created_at,
       doctor:doctors(slug, name, branch)`,
    )
    .eq("type", "article")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.doctorSlug) {
    // doctor slug 필터 — RPC 안 쓰고 join 안 통하니 별도 조회로 doctor_id 매핑
    const { data: d } = await supabase
      .from("doctors")
      .select("id")
      .eq("slug", opts.doctorSlug)
      .maybeSingle();
    if (!d) return [];
    q = q.eq("doctor_id", d.id);
  }
  if (opts.searchQuery && opts.searchQuery.trim()) {
    const w = opts.searchQuery.trim().replace(/[%_]/g, "\\$&");
    const pat = `%${w}%`;
    q = q.or(`question.ilike.${pat},answer.ilike.${pat}`);
  }

  const { data } = await q;
  if (!data) return [];

  const articles: ArticleRow[] = data.map((r) => {
    const doctor = Array.isArray(r.doctor) ? r.doctor[0] ?? null : r.doctor;
    return {
      id: r.id as number,
      question: r.question as string,
      article_sections: (r.article_sections ?? []) as ArticleSection[],
      article_cover_image: (r.article_cover_image ?? null) as string | null,
      article_slug: r.article_slug as string,
      keywords: (r.keywords ?? []) as string[],
      like_count: (r.like_count ?? 0) as number,
      view_count: (r.view_count ?? 0) as number,
      created_at: r.created_at as string,
      doctor: doctor as ArticleRow["doctor"],
    };
  });

  const cards: ArticleSectionVirtualCard[] = [];
  for (const a of articles) {
    cards.push(...splitArticleToVirtualCards(a));
  }
  return cards;
}

/**
 * 원장 페이지에서 보여줄 article 목록 (썸네일 카드용)
 */
export async function loadDoctorArticles(
  supabase: SupabaseClient,
  doctorId: string,
  limit = 6,
): Promise<ArticleRow[]> {
  const { data } = await supabase
    .from("qas")
    .select(
      `id, question, article_sections, article_cover_image, article_slug,
       keywords, like_count, view_count, created_at,
       doctor:doctors(slug, name, branch)`,
    )
    .eq("type", "article")
    .eq("status", "published")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!data) return [];
  return data.map((r) => {
    const doctor = Array.isArray(r.doctor) ? r.doctor[0] ?? null : r.doctor;
    return {
      id: r.id as number,
      question: r.question as string,
      article_sections: (r.article_sections ?? []) as ArticleSection[],
      article_cover_image: (r.article_cover_image ?? null) as string | null,
      article_slug: r.article_slug as string,
      keywords: (r.keywords ?? []) as string[],
      like_count: (r.like_count ?? 0) as number,
      view_count: (r.view_count ?? 0) as number,
      created_at: r.created_at as string,
      doctor: doctor as ArticleRow["doctor"],
    };
  });
}
