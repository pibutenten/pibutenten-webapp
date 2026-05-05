"use client";

import Image from "next/image";
import { useState } from "react";
import { getDoctorPhoto } from "@/lib/doctor-theme";

export type QACardData = {
  id: number;
  question: string;
  answer: string;
  meta: string | null;
  keywords: string[];
  like_count: number;
  view_count: number;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
  video: {
    youtube_id: string;
    youtube_url: string;
    topic: string | null;
    upload_date: string | null;
  } | null;
};

/**
 * Q&A 카드.
 * - 본문 클릭 → 펼치기/접기 토글
 * - line-clamp 5 → 펼치면 전체 노출
 * - 키워드 칩, 조회수·좋아요 footer
 */
export default function QACard({ qa }: { qa: QACardData }) {
  const [expanded, setExpanded] = useState(false);
  const doctor = qa.doctor;
  const photo = doctor ? getDoctorPhoto(doctor.slug) : null;
  const dateLabel = formatDate(qa.video?.upload_date ?? null);

  return (
    <article className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-sm)]">
      {/* 원장 행 */}
      <div className="mb-3.5 flex items-center gap-3">
        {doctor && photo && (
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-[var(--bg-soft)] bg-[var(--bg-soft)]">
            <Image
              src={photo}
              alt={`${doctor.name} 원장님`}
              fill
              sizes="44px"
              className="object-cover"
              style={{ objectPosition: "50% 10%" }}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--text)]">
            <span>{doctor?.name ?? "익명"} 원장님</span>
            <span className="text-[13px] text-[var(--secondary)]" aria-hidden>
              ✓
            </span>
          </div>
          <div className="truncate text-[12px] text-[var(--text-muted)]">
            {qa.video?.topic ? `${qa.video.topic}` : ""}
            {dateLabel ? ` · ${dateLabel}` : ""}
          </div>
        </div>
      </div>

      {/* 질문 */}
      <h2 className="mb-3 text-[17px] font-bold leading-[1.45] tracking-[-0.3px] text-[var(--primary)]">
        {qa.question}
      </h2>

      {/* 답변 — 클릭으로 펼치기/접기 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="block w-full cursor-pointer text-left"
      >
        <p
          className={`text-[15px] leading-[1.7] text-[var(--text)] transition-colors ${
            expanded ? "" : "line-clamp-5"
          }`}
        >
          {qa.answer}
        </p>
        <span
          className="mt-2 inline-block text-[12px] font-medium text-[var(--secondary)] hover:text-[var(--primary)]"
          aria-hidden
        >
          {expanded ? "접기 ▴" : "더보기 ▾"}
        </span>
      </button>

      {/* 키워드 칩 */}
      {qa.keywords.length > 0 && (
        <div className="mb-3 mt-3.5 flex flex-wrap gap-1.5">
          {qa.keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-2.5 py-0.5 text-[12px] font-medium text-[var(--text-secondary)]"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* footer: 조회수·좋아요 */}
      <div className="flex items-center gap-4 border-t border-[var(--border)] pt-3 text-[12px] text-[var(--text-muted)]">
        <span aria-label="조회수">👁 {qa.view_count}</span>
        <span aria-label="좋아요">♡ {qa.like_count}</span>
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
