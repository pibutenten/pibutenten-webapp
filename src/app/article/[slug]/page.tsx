import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ArticleSection } from "@/lib/article/types";
import ArticleViewClient from "./ArticleViewClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

type ArticleFull = {
  id: number;
  question: string;
  article_sections: ArticleSection[];
  article_cover_image: string | null;
  article_slug: string;
  keywords: string[];
  like_count: number;
  view_count: number;
  created_at: string;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
};

async function fetchArticle(slug: string): Promise<ArticleFull | null> {
  const decoded = decodeURIComponent(slug);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("qas")
    .select(
      `id, question, article_sections, article_cover_image, article_slug,
       keywords, like_count, view_count, created_at,
       doctor:doctors(slug, name, branch)`,
    )
    .eq("type", "article")
    .eq("status", "published")
    .eq("article_slug", decoded)
    .maybeSingle();
  if (!data) return null;
  const doctor = Array.isArray(data.doctor) ? data.doctor[0] ?? null : data.doctor;
  return {
    id: data.id as number,
    question: data.question as string,
    article_sections: (data.article_sections ?? []) as ArticleSection[],
    article_cover_image: (data.article_cover_image ?? null) as string | null,
    article_slug: data.article_slug as string,
    keywords: (data.keywords ?? []) as string[],
    like_count: (data.like_count ?? 0) as number,
    view_count: (data.view_count ?? 0) as number,
    created_at: data.created_at as string,
    doctor: doctor as ArticleFull["doctor"],
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await fetchArticle(slug);
  if (!article) return { title: "피부텐텐 칼럼" };
  const intro =
    (article.article_sections?.[0]?.body ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 110) || "";
  const docName = article.doctor?.name
    ? `${article.doctor.name} 원장님`
    : "피부텐텐";
  return {
    title: article.question,
    description: intro,
    openGraph: {
      title: article.question,
      description: `${docName} — ${intro}`,
      type: "article",
      images: article.article_cover_image
        ? [{ url: article.article_cover_image }]
        : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await fetchArticle(slug);
  if (!article) notFound();

  const sections = article.article_sections ?? [];
  const dateLabel = formatDate(article.created_at);

  return (
    <article className="mx-auto w-full max-w-[680px] py-2">
      {/* 칼럼 라벨 */}
      <div className="mb-3">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider"
          style={{ backgroundColor: "#EDE7F6", color: "#5E35B1" }}
        >
          칼럼
        </span>
      </div>

      {/* 제목 */}
      <h1 className="mb-3 text-[26px] font-bold leading-[1.35] tracking-[-0.4px] text-[var(--text)] sm:text-[30px]">
        {article.question}
      </h1>

      {/* 메타 정보 (원장 + 날짜) */}
      <div className="mb-6 flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
        {article.doctor ? (
          <Link
            href={`/doctors/${article.doctor.slug}`}
            className="font-semibold text-[var(--primary)] hover:underline"
          >
            {article.doctor.name} 원장님
          </Link>
        ) : (
          <span>피부텐텐</span>
        )}
        {dateLabel && (
          <>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--text-muted)]">{dateLabel}</span>
          </>
        )}
      </div>

      {/* 대표 이미지 */}
      {article.article_cover_image && (
        <div className="mb-6 overflow-hidden rounded-[var(--radius)]">
          <Image
            src={article.article_cover_image}
            alt={article.question}
            width={1200}
            height={675}
            className="h-auto w-full object-cover"
            unoptimized
            priority
          />
        </div>
      )}

      {/* 목차 */}
      {sections.length > 1 && (
        <nav
          aria-label="목차"
          className="mb-8 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-soft)]/50 p-4"
        >
          <div className="mb-2 text-xs font-bold tracking-wider text-[var(--text-secondary)]">
            목차
          </div>
          <ol className="space-y-1.5 text-[14px]">
            {sections.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[var(--text-muted)]">{i + 1}.</span>
                <a
                  href={`#section-${i}`}
                  className="text-[var(--text)] hover:text-[var(--primary)] hover:underline"
                >
                  {s.heading || `섹션 ${i + 1}`}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* 본문 섹션들 */}
      <div className="space-y-10">
        {sections.map((s, i) => (
          <section
            key={i}
            id={`section-${i}`}
            className="scroll-mt-24"
          >
            {s.heading && (
              <h2 className="mb-3 text-[20px] font-bold leading-snug tracking-[-0.3px] text-[var(--primary)]">
                {s.heading}
              </h2>
            )}
            {s.image && (
              <div className="mb-4 overflow-hidden rounded-[var(--radius)]">
                <Image
                  src={s.image}
                  alt={s.heading || `섹션 ${i + 1}`}
                  width={1000}
                  height={563}
                  className="h-auto w-full object-cover"
                  unoptimized
                />
              </div>
            )}
            {s.body && (
              <div className="whitespace-pre-line text-[16px] leading-[1.85] text-[var(--text)]">
                {s.body}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* 키워드 */}
      {article.keywords.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-1.5">
          {article.keywords.map((k) => (
            <Link
              key={k}
              href={`/?q=${encodeURIComponent(k)}`}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              #{k}
            </Link>
          ))}
        </div>
      )}

      {/* 좋아요/조회/공유/댓글 */}
      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <ArticleViewClient
          articleId={article.id}
          slug={article.article_slug}
          initialLike={article.like_count}
          initialView={article.view_count}
          doctorSlug={article.doctor?.slug ?? null}
          title={article.question}
        />
      </div>

      {/* 원장 페이지로 */}
      {article.doctor && (
        <div className="mt-10 text-center">
          <Link
            href={`/doctors/${article.doctor.slug}`}
            className="inline-block rounded-full border border-[var(--border)] bg-white px-5 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            {article.doctor.name} 원장님 페이지에서 더 보기 →
          </Link>
        </div>
      )}
    </article>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}.${m[2]}.${m[3]}`;
}
