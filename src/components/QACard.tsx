"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import { CATEGORIES } from "@/lib/categories";
import { categorize } from "@/lib/category-sets";
import { PICK_IDS } from "@/lib/picks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
 * - 본문 클릭 → 부드럽게 펼치기/접기 토글
 * - 원장님 아바타 뒤 파스텔 배경 (식별성)
 * - fadeInUp 애니메이션
 */
type Props = {
  qa: QACardData;
  /** 검색어 — 일치하는 키워드 칩은 카테고리 색, 본문은 노란 mark */
  activeQuery?: string;
};

export default function QACard({ qa, activeQuery }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [viewCount, setViewCount] = useState(qa.view_count);
  const router = useRouter();
  const doctor = qa.doctor;
  const isPick = PICK_IDS.has(qa.id);

  // 처음 펼칠 때 한 번만 조회수 +1 (브라우저당 1회)
  useEffect(() => {
    if (!expanded) return;
    if (typeof window === "undefined") return;
    const key = `qa-viewed-${qa.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const supabase = createSupabaseBrowserClient();
    supabase
      .rpc("increment_qa_view", { p_qa_id: qa.id })
      .then(({ data }: { data: number | null }) => {
        if (typeof data === "number") setViewCount(data);
      });
  }, [expanded, qa.id]);
  const theme = doctor ? getDoctorTheme(doctor.slug) : null;
  const photo = doctor ? getDoctorPhoto(doctor.slug) : null;
  const dateLabel = formatDate(qa.video?.upload_date ?? null);

  // QACard 아바타용 offset (avatarOffsetX/Y 우선, 없으면 offsetX/Y * 0.46)
  const avatarTx =
    theme?.avatarOffsetX ?? (theme?.offsetX ?? 0) * 0.46;
  const avatarTy =
    theme?.avatarOffsetY ?? (theme?.offsetY ?? 0) * 0.46;

  // 검색어가 어느 카테고리에 속하는지 판정 → 칩 강조 색
  const queryCategoryColor = activeQuery
    ? CATEGORIES.find((c) => c.slug === categorize(activeQuery))?.color
    : null;

  return (
    <article className="fade-in-up relative rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-sm)]" style={isPick ? { borderLeft: "3px solid #BBDEFB" } : undefined}>
      {isPick && (
        <span
          className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
          style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}
        >
          Pick
        </span>
      )}
      {/* 원장 행 — 클릭 시 원장님 소개 페이지로 이동 */}
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
            <span className="text-[13px] text-[var(--secondary)]" aria-hidden>
              ✓
            </span>
          </div>
          <div className="truncate text-[12px] text-[var(--text-muted)]">
            {qa.video?.topic ? `${qa.video.topic}` : ""}
            {dateLabel ? ` · ${dateLabel}` : ""}
          </div>
        </div>
      </button>

      {/* 질문 */}
      <h2 className="mb-3 text-[17px] font-bold leading-[1.45] tracking-[-0.3px] text-[var(--primary)]">
        {highlight(qa.question, activeQuery)}
      </h2>

      {/* 답변 — 클릭으로 펼치기/접기 */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer"
      >
        <p
          className={`text-[15px] leading-[1.7] text-[var(--text)] ${
            expanded ? "" : "line-clamp-5"
          }`}
          style={{ transition: "color 0.2s ease" }}
        >
          {highlight(qa.answer, activeQuery)}
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
        {qa.video?.youtube_url && (
          <a
            href={qa.video.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-medium text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            <span style={{ color: "#FF0000" }}>▶</span> 영상 보러가기
          </a>
        )}
      </div>

      {/* 키워드 칩 — 클릭 시 검색, 활성 검색어와 일치하면 카테고리 색 */}
      {qa.keywords.length > 0 && (
        <div className="mb-3 mt-3.5 flex flex-wrap gap-1.5">
          {qa.keywords.map((kw) => {
            const matched = activeQuery && kw === activeQuery;
            return (
              <button
                key={kw}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/?q=${encodeURIComponent(kw)}`);
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] transition-colors"
                style={
                  matched && queryCategoryColor
                    ? {
                        backgroundColor: queryCategoryColor + "1A",
                        borderColor: queryCategoryColor,
                        color: queryCategoryColor,
                        fontWeight: 700,
                      }
                    : {
                        backgroundColor: "white",
                        borderColor: "var(--border)",
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                      }
                }
              >
                {kw}
              </button>
            );
          })}
        </div>
      )}

      {/* footer: 조회수·좋아요·댓글·공유 */}
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
          <span>{viewCount}</span>
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
          <span>{qa.like_count}</span>
        </span>

        <span className="flex items-center gap-1.5" aria-label="댓글">
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
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>0</span>
        </span>

        <button
          type="button"
          onClick={() => shareQA(qa)}
          className="ml-auto flex items-center gap-1.5 transition-colors hover:text-[var(--primary)]"
          aria-label="공유하기"
          title="공유하기"
        >
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
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
      </div>
    </article>
  );
}

async function shareQA(qa: QACardData) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}/?qa=${qa.id}`;
  const title = qa.question;
  const text = `${qa.doctor?.name ?? ""} 원장님 — 피부텐텐 Q&A`;

  // 모바일/PWA: navigator.share
  const nav = window.navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.share) {
    try {
      await nav.share({ url, title, text });
      return;
    } catch {
      // 사용자가 취소했거나 실패 — 클립보드 fallback
    }
  }
  // 데스크탑: 클립보드
  try {
    await navigator.clipboard.writeText(url);
    showToast("링크가 복사되었어요");
  } catch {
    showToast("복사 실패");
  }
}

function showToast(msg: string) {
  // 간단한 임시 토스트 (추후 글로벌 토스트로 교체 가능)
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);" +
    "background:rgba(27,73,101,0.92);color:white;padding:8px 16px;" +
    "border-radius:9999px;font-size:13px;font-weight:600;z-index:9999;" +
    "box-shadow:0 4px 12px rgba(0,0,0,0.15);";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
}

/**
 * 텍스트 안에서 query 부분 일치를 노란 mark로 강조 (대소문자 무시).
 * query 비어있으면 원문 반환.
 */
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
