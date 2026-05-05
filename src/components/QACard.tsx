"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import { CATEGORIES } from "@/lib/categories";
import { categorize } from "@/lib/category-sets";
import { PICK_IDS } from "@/lib/picks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import CommentsBlock from "@/components/CommentsBlock";

export type QACardData = {
  id: number;
  question: string;
  answer: string;
  meta: string | null;
  keywords: string[];
  like_count: number;
  view_count: number;
  share_count?: number;
  comment_count?: number;
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
  /** 칩 클릭 시 검색 URL에 boost로 함께 전달 (원장님 단일 페이지에서 사용) */
  boostDoctorSlug?: string;
  /** 이 카드가 HOT인지 (서버에서 계산한 hot id set 기준) */
  isHot?: boolean;
};

export default function QACard({ qa, activeQuery, boostDoctorSlug, isHot = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [viewCount, setViewCount] = useState(qa.view_count);
  const [likeCount, setLikeCount] = useState(qa.like_count);
  const [shareCount, setShareCount] = useState(qa.share_count ?? 0);
  const [commentCount, setCommentCount] = useState(qa.comment_count ?? 0);
  const [liked, setLiked] = useState(false);
  const router = useRouter();
  const doctor = qa.doctor;
  const isPick = PICK_IDS.has(qa.id);

  // 펼칠 때마다 조회수 +1 (중복 카운트 허용 — 인기도 신호 확보)
  useEffect(() => {
    if (!expanded) return;
    if (typeof window === "undefined") return;
    const supabase = createSupabaseBrowserClient();
    supabase
      .rpc("increment_qa_view", { p_qa_id: qa.id })
      .then(({ data }: { data: number | null }) => {
        if (typeof data === "number") setViewCount(data);
      });
  }, [expanded, qa.id]);

  // 좋아요 상태 — 브라우저당 1회 제한 (localStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLiked(localStorage.getItem(`qa-liked-${qa.id}`) === "1");
  }, [qa.id]);

  function handleLike() {
    if (typeof window === "undefined") return;
    const supabase = createSupabaseBrowserClient();
    if (liked) {
      // 좋아요 취소 (토글 off)
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      localStorage.removeItem(`qa-liked-${qa.id}`);
      supabase
        .rpc("decrement_qa_like", { p_qa_id: qa.id })
        .then(({ data, error }: { data: number | null; error: unknown }) => {
          if (error) {
            // 롤백
            setLiked(true);
            setLikeCount((c) => c + 1);
            localStorage.setItem(`qa-liked-${qa.id}`, "1");
            return;
          }
          if (typeof data === "number") setLikeCount(data);
        });
    } else {
      // 좋아요 (토글 on)
      setLiked(true);
      setLikeCount((c) => c + 1);
      localStorage.setItem(`qa-liked-${qa.id}`, "1");
      supabase
        .rpc("increment_qa_like", { p_qa_id: qa.id })
        .then(({ data, error }: { data: number | null; error: unknown }) => {
          if (error) {
            // 롤백
            setLiked(false);
            setLikeCount((c) => Math.max(0, c - 1));
            localStorage.removeItem(`qa-liked-${qa.id}`);
            return;
          }
          if (typeof data === "number") setLikeCount(data);
        });
    }
  }
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

  // 좌측 4px 표시
  // - HOT: 연한 빨강 (#FFD2D6) — Pick보다 살짝 더 연하게 인지적 균형
  // - Pick: 옅은 파랑 (#BBDEFB)
  // - 둘 다일 때: 위 절반 HOT / 아래 절반 Pick
  const showSideBar = isPick || isHot;

  return (
    <article className="fade-in-up relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-sm)]">
      {showSideBar && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-[4px]"
        >
          {isHot && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: isPick ? "50%" : "100%",
                background: "#FFD2D6",
              }}
            />
          )}
          {isPick && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: isHot ? "50%" : "100%",
                background: "#BBDEFB",
              }}
            />
          )}
        </div>
      )}
      {(isPick || isHot) && (
        <div className="absolute right-3 top-3 flex gap-1">
          {isHot && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: "#FFEBEE", color: "#C62828" }}
            >
              HOT
            </span>
          )}
          {isPick && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider"
              style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}
            >
              Pick
            </span>
          )}
        </div>
      )}
      {/* 원장 행 — 클릭 시 원장님 소개 페이지로 이동 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (doctor?.slug) router.push(`/doctors/${doctor.slug}`);
        }}
        className="mb-3.5 flex w-full cursor-pointer items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-[var(--bg-soft)]/60"
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
          className="cursor-pointer rounded-md px-1.5 py-0.5 font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--bg-soft)]/60 hover:text-[var(--primary)]"
        >
          {expanded ? "접기 ▴" : "더보기 ▾"}
        </button>
        {qa.video?.youtube_url && (
          <a
            href={qa.video.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              // 영상 보러가기 클릭 = 조회수 +1 (펼치지 않아도 인기 신호로 카운트)
              if (typeof window === "undefined") return;
              const supabase = createSupabaseBrowserClient();
              supabase
                .rpc("increment_qa_view", { p_qa_id: qa.id })
                .then(({ data }: { data: number | null }) => {
                  if (typeof data === "number") setViewCount(data);
                });
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)]/60 hover:text-[var(--primary)]"
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
                  const params = new URLSearchParams({ q: kw });
                  if (boostDoctorSlug) params.set("boost", boostDoctorSlug);
                  router.push(`/?${params.toString()}`);
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="inline-flex cursor-pointer items-center rounded-full border px-2.5 py-0.5 text-[12px] transition-colors hover:shadow-sm"
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

        <button
          type="button"
          onClick={handleLike}
          aria-label={liked ? "좋아요 취소" : "좋아요"}
          aria-pressed={liked}
          className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-[var(--primary)]"
          style={liked ? { color: "#E91E63" } : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px] transition-transform"
            style={liked ? { transform: "scale(1.05)" } : undefined}
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span>{likeCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-[var(--primary)]"
          aria-label="댓글"
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
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{commentCount}</span>
        </button>

        <button
          type="button"
          onClick={async () => {
            await shareQA(qa);
            // 공유 클릭 카운트 +1 (중복 허용)
            const supabase = createSupabaseBrowserClient();
            const { data } = await supabase.rpc("increment_qa_share", {
              p_qa_id: qa.id,
            });
            if (typeof data === "number") setShareCount(data);
          }}
          className="ml-auto flex cursor-pointer items-center gap-1.5 transition-colors hover:text-[var(--primary)]"
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
          <span>{shareCount}</span>
        </button>
      </div>

      {/* 댓글 블록 — 본문 펼침 여부 무관하게 항상 표시 */}
      <CommentsBlock
        qaId={qa.id}
        doctorSlug={qa.doctor?.slug ?? null}
        isPublishedQa={true}
        onCountChange={setCommentCount}
      />
    </article>
  );
}

async function shareQA(qa: QACardData) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}/qa/${qa.id}`;
  const title = qa.question;
  const text = `${qa.doctor?.name ?? ""} 원장님 — 피부텐텐`;

  // 모바일에서만 native share 사용 (데스크탑 Chrome share UI는 부실해서 클립보드가 더 자연)
  const ua = window.navigator.userAgent;
  const isMobile =
    /android|iphone|ipad|ipod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua)); // iPad on iPadOS

  const nav = window.navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
  };

  if (isMobile && nav.share) {
    try {
      await nav.share({ url, title, text });
      return;
    } catch {
      // 사용자 취소 / 실패 → 클립보드 fallback
    }
  }

  // 데스크탑(또는 share 미지원): 클립보드 복사
  try {
    await navigator.clipboard.writeText(url);
    showToast("링크가 복사되었어요");
  } catch {
    showToast("복사 실패");
  }
}

function showToast(msg: string) {
  // 화면 가운데에 산뜻한 흰 배경 토스트 (페이드 인/아웃)
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.9);" +
    "background:#FFFFFF;color:#1B4965;padding:14px 28px;" +
    "border:1px solid #E2E8EE;border-radius:9999px;" +
    "font-size:15px;font-weight:700;letter-spacing:-0.2px;z-index:9999;" +
    "box-shadow:0 12px 32px rgba(27,73,101,0.18),0 2px 6px rgba(0,0,0,0.06);" +
    "opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;" +
    "pointer-events:none;";
  document.body.appendChild(el);
  // 다음 프레임에서 페이드 인
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,-50%) scale(1)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%,-50%) scale(0.95)";
    setTimeout(() => el.remove(), 220);
  }, 1500);
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
