"use client";

import Image from "next/image";
import Link from "next/link";
import type { ArticleRow } from "@/lib/article/types";

type Props = {
  article: ArticleRow;
};

/**
 * Article 썸네일 카드 — 원장 개인 페이지의 칼럼 섹션에 노출.
 * 대표 이미지 + 제목 + 첫 섹션의 본문 일부 요약.
 */
export default function ArticleCard({ article }: Props) {
  const cover = article.article_cover_image;
  const summary =
    (article.article_sections?.[0]?.body ?? "")
      .replace(/\s*\n+\s*/g, " ")
      .trim()
      .slice(0, 90) || "";

  return (
    <Link
      href={`/article/${encodeURIComponent(article.article_slug)}`}
      className="group block overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md,0_4px_14px_rgba(0,0,0,0.08))]"
    >
      {cover && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--bg-soft)]">
          <Image
            src={cover}
            alt={article.question}
            fill
            sizes="(max-width: 600px) 100vw, 400px"
            className="object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}
      <div className="p-4">
        <div className="mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
          style={{ backgroundColor: "#EDE7F6", color: "#5E35B1" }}
        >
          칼럼
        </div>
        <h3 className="mb-1.5 text-[16px] font-bold leading-snug text-[var(--text)] group-hover:text-[var(--primary)]">
          {article.question}
        </h3>
        {summary && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {summary}
          </p>
        )}
      </div>
    </Link>
  );
}
