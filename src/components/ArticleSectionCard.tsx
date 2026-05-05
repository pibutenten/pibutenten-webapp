"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import type { ArticleSectionVirtualCard } from "@/lib/article/types";

type Props = {
  card: ArticleSectionVirtualCard;
  activeQuery?: string;
};

/**
 * Article 섹션 가상 카드 — 피드에 다른 QA 카드와 섞여 노출.
 * - heading + body (이미지 X, 줄바꿈 그대로)
 * - 일부 가림 + 펼치기
 * - 펼친 상태에서 ▶ 칼럼 전체 보기 (파란색)
 * - 클릭 시 /article/{slug}#section-{idx} 이동
 */
export default function ArticleSectionCard({ card, activeQuery }: Props) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const doctor = card.doctor;
  const theme = doctor ? getDoctorTheme(doctor.slug) : null;
  const photo = doctor ? getDoctorPhoto(doctor.slug) : null;
  const dateLabel = formatDate(card.created_at);

  const avatarTx =
    theme?.avatarOffsetX ?? (theme?.offsetX ?? 0) * 0.46;
  const avatarTy =
    theme?.avatarOffsetY ?? (theme?.offsetY ?? 0) * 0.46;

  const articleHref = `/article/${encodeURIComponent(
    card.articleSlug,
  )}#section-${card.sectionIndex}`;

  return (
    <article className="fade-in-up relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-sm)]">
      {/* 좌측 4px (article 표시: 옅은 보라) */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 top-0 w-[4px]"
        style={{ background: "#D1C4E9" }}
      />
      <div className="absolute right-3 top-3 flex gap-1">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
          style={{ backgroundColor: "#EDE7F6", color: "#5E35B1" }}
        >
          칼럼
        </span>
      </div>

      {/* 원장 행 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (doctor?.slug) router.push(`/doctors/${doctor.slug}`);
        }}
        className="mb-3.5 flex w-full items-center gap-3 text-left transition-opacity hover:opacity-80"
        aria-label={doctor ? `${doctor.name} 원장님 소개로 이동` : undefined}
      >
        {doctor && photo && (
          <div
            className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full"
            style={{
              background: theme?.bg ?? "var(--bg-soft)",
              boxShadow: `inset 0 0 0 2px ${theme?.bgSoft ?? "var(--bg-soft)"}`,
            }}
          >
            <Image
              src={photo}
              alt={`${doctor.name} 원장님`}
              fill
              sizes="44px"
              className="object-cover"
              style={{
                objectPosition: "50% 12%",
                transform: `translate(${avatarTx}px, ${avatarTy}px)`,
              }}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--text)]">
            <span>{doctor?.name ?? "익명"} 원장님</span>
          </div>
          <div className="truncate text-[12px] text-[var(--text-muted)]">
            칼럼{dateLabel ? ` · ${dateLabel}` : ""}
          </div>
        </div>
      </button>

      {/* 섹션 heading = 질문 자리 */}
      <h2 className="mb-3 text-[17px] font-bold leading-[1.45] tracking-[-0.3px] text-[var(--primary)]">
        {highlight(card.heading, activeQuery)}
      </h2>

      {/* 섹션 body — 줄바꿈 무시 (single-line flow) */}
      <div onClick={() => setExpanded((v) => !v)} className="cursor-pointer">
        <p
          className={`text-[15px] leading-[1.7] text-[var(--text)] ${
            expanded ? "" : "line-clamp-5"
          }`}
        >
          {highlight(card.body.replace(/\s*\n+\s*/g, " "), activeQuery)}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[12px]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="font-medium text-[var(--secondary)] hover:text-[var(--primary)]"
        >
          {expanded ? "접기 ▴" : "더보기 ▾"}
        </button>
        {expanded && (
          <Link
            href={articleHref}
            className="inline-flex items-center gap-1 font-medium text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            <span style={{ color: "#1976D2" }}>▶</span> 칼럼 전체 보기
          </Link>
        )}
      </div>

      {/* 키워드 칩 */}
      {card.keywords.length > 0 && (
        <div className="mb-3 mt-3.5 flex flex-wrap gap-1.5">
          {card.keywords.map((kw) => (
            <button
              key={kw}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const params = new URLSearchParams({ q: kw });
                router.push(`/?${params.toString()}`);
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className="inline-flex items-center rounded-full border bg-white px-2.5 py-0.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              {kw}
            </button>
          ))}
        </div>
      )}

      {/* footer */}
      <div className="flex items-center gap-5 border-t border-[var(--border)] pt-3 text-[14px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5" aria-label="조회수">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{card.view_count}</span>
        </span>
        <span className="flex items-center gap-1.5" aria-label="좋아요">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span>{card.like_count}</span>
        </span>
        <Link
          href={articleHref}
          className="ml-auto text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          전체 보기 →
        </Link>
      </div>
    </article>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

function highlight(text: string, query?: string): ReactNode {
  if (!query || !query.trim()) return text;
  const q = query.trim();
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lq, i);
    if (idx < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={`m${key++}`}
        style={{
          backgroundColor: "#FFF3A3",
          color: "inherit",
          padding: "0 1px",
          borderRadius: "2px",
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return <Fragment>{parts}</Fragment>;
}
