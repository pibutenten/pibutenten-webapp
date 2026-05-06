"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getDoctorPhoto, getDoctorTheme } from "@/lib/doctor-theme";
import { CATEGORIES } from "@/lib/categories";
import { categorize } from "@/lib/category-sets";
import { PICK_IDS } from "@/lib/picks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import CommentsBlock from "@/components/CommentsBlock";
import ConfirmDialog from "@/components/ConfirmDialog";

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
  type?: "qa" | "post" | "article";
  created_at?: string;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [me, setMe] = useState<{ id: string; role: "admin" | "doctor" | "user" } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(qa.question);
  const [editBody, setEditBody] = useState(qa.answer);
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const doctor = qa.doctor;
  const isPick = PICK_IDS.has(qa.id);

  // 조회수 +1 — 카드가 화면에 50% 이상 노출되면 1회 (브라우저당 dedup)
  // 짧은 글(더보기 없음)도 동일하게 노출 기반으로 카운트
  useEffect(() => {
    if (typeof window === "undefined") return;
    const card = cardRef.current;
    if (!card) return;
    const key = `qa-viewed-${qa.id}`;
    if (lsGet(key)) return;

    let counted = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (counted) return;
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
          counted = true;
          lsSet(key, "1");
          const sb = createSupabaseBrowserClient();
          sb.rpc("increment_qa_view", { p_qa_id: qa.id }).then(
            ({ data }: { data: number | null }) => {
              if (typeof data === "number") setViewCount(data);
            },
          );
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [qa.id]);

  // 좋아요 상태 초기화 — 로그인이면 qa_likes, 미로그인이면 localStorage
  useEffect(() => {
    let alive = true;
    (async () => {
      if (typeof window === "undefined") return;
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("qa_likes")
          .select("qa_id")
          .eq("qa_id", qa.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (alive) setLiked(!!data);
      } else {
        if (alive) setLiked(lsGet(`qa-liked-${qa.id}`) === "1");
      }
    })();
    return () => {
      alive = false;
    };
  }, [qa.id]);

  // localStorage 안전 접근 헬퍼 (인앱 브라우저 sandbox 방어)
  function lsGet(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function lsSet(key: string, val: string) {
    try {
      localStorage.setItem(key, val);
    } catch {
      /* ignore — Google/카톡 인앱 sandbox */
    }
  }
  function lsRemove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function handleLike() {
    if (typeof window === "undefined") return;
    const supabase = createSupabaseBrowserClient();
    const wasLiked = liked;
    // 낙관적 UI 업데이트 — 인앱에서도 즉각 피드백
    setLiked(!wasLiked);
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));

    (async () => {
      // auth.getUser() 가 인앱 브라우저에서 throw할 수 있어 try/catch
      let userId: string | null = null;
      try {
        const { data } = await supabase.auth.getUser();
        userId = data.user?.id ?? null;
      } catch {
        userId = null;
      }

      // 토글 RPC 시도 (auth 가능할 때) — 실패하면 anon path로 fallback
      let success = false;
      if (userId) {
        try {
          const { data, error } = await supabase.rpc("toggle_qa_like", {
            p_qa_id: qa.id,
          });
          if (!error) {
            const row = (data as { liked: boolean; like_count: number }[] | null)?.[0];
            if (row) {
              setLiked(row.liked);
              setLikeCount(row.like_count);
              if (row.liked) lsSet(`qa-liked-${qa.id}`, "1");
              else lsRemove(`qa-liked-${qa.id}`);
              success = true;
            }
          }
        } catch {
          /* fallback to anon path below */
        }
      }

      // anon path — 로그인 안 됐거나 toggle 실패 시
      if (!success) {
        const rpc = wasLiked ? "decrement_qa_like" : "increment_qa_like";
        try {
          const { data, error } = await supabase.rpc(rpc, { p_qa_id: qa.id });
          if (error) {
            // 완전 실패 — UI 롤백
            setLiked(wasLiked);
            setLikeCount((c) => (wasLiked ? c + 1 : Math.max(0, c - 1)));
            return;
          }
          if (typeof data === "number") setLikeCount(data);
          if (wasLiked) lsRemove(`qa-liked-${qa.id}`);
          else lsSet(`qa-liked-${qa.id}`, "1");
        } catch {
          setLiked(wasLiked);
          setLikeCount((c) => (wasLiked ? c + 1 : Math.max(0, c - 1)));
        }
      }
    })();
  }
  const theme = doctor ? getDoctorTheme(doctor.slug) : null;
  const photo = doctor ? getDoctorPhoto(doctor.slug) : null;
  // 영상 글은 영상 업로드 날짜, post는 created_at 상대시간
  const dateLabel = qa.video?.upload_date
    ? formatDate(qa.video.upload_date)
    : qa.created_at
      ? relativeTime(qa.created_at)
      : null;

  // QACard 아바타용 offset (avatarOffsetX/Y 우선, 없으면 offsetX/Y * 0.46)
  const avatarTx =
    theme?.avatarOffsetX ?? (theme?.offsetX ?? 0) * 0.46;
  const avatarTy =
    theme?.avatarOffsetY ?? (theme?.offsetY ?? 0) * 0.46;

  // 검색어가 어느 카테고리에 속하는지 판정 → 칩 강조 색
  const queryCategoryColor = activeQuery
    ? CATEGORIES.find((c) => c.slug === categorize(activeQuery))?.color
    : null;

  // 현재 로그인 사용자 + role
  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!alive || !user) return;
      const { data: prof } = await sb
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive) return;
      setMe({
        id: user.id,
        role: ((prof?.role as "admin" | "doctor" | "user" | undefined) ?? "user"),
      });
    })();
    return () => { alive = false; };
  }, []);

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  // 수정/삭제 권한: 관리자 OR 본인 글(post)
  const canEdit =
    !!me && (me.role === "admin" || (qa.type === "post" && me.id === qa.author?.id));

  async function saveEdit() {
    if (!editTitle.trim() || !editBody.trim()) {
      alert("제목과 본문을 입력해주세요.");
      return;
    }
    setEditSaving(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb
        .from("qas")
        .update({ question: editTitle.trim(), answer: editBody.trim() })
        .eq("id", qa.id);
      if (error) {
        alert("수정 실패: " + error.message);
      } else {
        setIsEditing(false);
        router.refresh();
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function performDelete() {
    setDeleting(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { error } = await sb.from("qas").delete().eq("id", qa.id);
      if (error) {
        alert("삭제 실패: " + error.message);
      } else {
        setConfirmDeleteOpen(false);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  // 24시간 내 글 → NEW 배지
  const isNew = (() => {
    if (!qa.created_at) return false;
    const t = new Date(qa.created_at).getTime();
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < 24 * 60 * 60 * 1000;
  })();

  // 본문 길이 — 짧으면 "더보기" 토글 비표시 (250자 미만 또는 줄바꿈 5줄 미만)
  const answerLines = (qa.answer ?? "").split("\n").length;
  const isLongAnswer = (qa.answer?.length ?? 0) > 250 || answerLines >= 6;

  // 글쓴이 fallback — doctor 없으면 author (post type)
  const authorName = doctor?.name ?? qa.author?.display_name ?? "익명";
  const authorAvatar = doctor ? photo : qa.author?.avatar_url ?? null;

  // 좌측 4px 표시
  // - HOT: 연한 빨강 (#FFD2D6) — Pick보다 살짝 더 연하게 인지적 균형
  // - Pick: 옅은 파랑 (#BBDEFB)
  // - 둘 다일 때: 위 절반 HOT / 아래 절반 Pick
  const showSideBar = isPick || isHot;

  return (
    <article ref={cardRef} className="fade-in-up relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-sm)]">
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
      {(isPick || isHot || isNew) && (
        // 카드 상단 안쪽에서 매달려 내려오는 딱지 — 카드 위로 올라가지 않음
        <div className="pointer-events-none absolute right-4 top-0 z-10 flex gap-1">
          {isNew && (
            <span
              className="inline-flex items-center rounded-b-md px-2 pt-0.5 pb-1 text-[10px] font-bold leading-none tracking-wider text-white"
              style={{
                backgroundColor: "#81C784",
                boxShadow: "0 1px 3px rgba(129, 199, 132, 0.25)",
              }}
            >
              NEW
            </span>
          )}
          {isHot && (
            <span
              className="inline-flex items-center rounded-b-md px-2 pt-0.5 pb-1 text-[10px] font-bold leading-none tracking-wider text-white"
              style={{
                backgroundColor: "#F48FB1",
                boxShadow: "0 1px 3px rgba(244, 143, 177, 0.25)",
              }}
            >
              HOT
            </span>
          )}
          {isPick && (
            <span
              className="inline-flex items-center rounded-b-md px-2 pt-0.5 pb-1 text-[10px] font-bold leading-none tracking-wider text-white"
              style={{
                backgroundColor: "#7DB7DA",
                boxShadow: "0 1px 3px rgba(125, 183, 218, 0.25)",
              }}
            >
              Pick
            </span>
          )}
        </div>
      )}
      {isEditing ? (
        /* 인라인 편집 모드 */
        <div className="mb-3 space-y-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={200}
            className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-[15px] font-bold focus:border-[var(--primary)] focus:outline-none"
            placeholder="제목"
          />
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={6}
            maxLength={4000}
            className="w-full resize-y rounded-md border border-[var(--border)] p-3 text-[14px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
            placeholder="본문"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setEditTitle(qa.question);
                setEditBody(qa.answer);
              }}
              className="rounded-md px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={editSaving}
              className="rounded-md bg-[var(--primary)] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
            >
              {editSaving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 1. 제목 — 가장 위, 가장 큰 강조 */}
          <h2 className="mb-2.5 whitespace-pre-wrap text-[17px] font-bold leading-[1.45] tracking-[-0.3px] text-[var(--primary)]">
            {highlight(qa.question, activeQuery)}
          </h2>

          {/* 2. 작성자 행 — 원장이면 원장 페이지, 일반 사용자면 /u/[id] 로 이동 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (doctor?.slug) {
                router.push(`/doctors/${doctor.slug}`);
              } else if (qa.author?.id) {
                router.push(`/u/${qa.author.id}`);
              }
            }}
            disabled={!doctor && !qa.author?.id}
            className={
              "mb-3 -ml-1 flex w-full items-center gap-2.5 rounded-md py-1.5 pl-1 pr-2 text-left transition-colors " +
              (doctor || qa.author?.id
                ? "cursor-pointer hover:bg-[var(--primary-soft)]"
                : "cursor-default")
            }
            aria-label={
              doctor
                ? `${doctor.name} 원장님 소개로 이동`
                : qa.author?.display_name
                  ? `${qa.author.display_name} 프로필로 이동`
                  : undefined
            }
          >
            <div
              className="relative shrink-0 overflow-hidden rounded-full"
              style={{
                background: theme?.bg ?? "var(--bg-soft)",
                boxShadow: doctor
                  ? `inset 0 0 0 2px ${theme?.bgSoft ?? "var(--bg-soft)"}`
                  : undefined,
                height: 36,
                width: 36,
              }}
            >
              {authorAvatar ? (
                <Image
                  src={authorAvatar}
                  alt={authorName}
                  fill
                  sizes="36px"
                  className="object-cover"
                  style={
                    doctor
                      ? {
                          objectPosition: "50% 12%",
                          transform: `translate(${avatarTx}px, ${avatarTy}px) scale(1.18)`,
                          transformOrigin: "50% 30%",
                        }
                      : { objectPosition: "50% 50%" }
                  }
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base text-[var(--text-muted)]">
                  👤
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {/* 1줄: 이름 + 피부과 전문의 */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 leading-none">
                <span className="text-[13px] font-bold leading-none text-[var(--text)]">
                  {authorName}
                </span>
                {doctor && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium leading-none"
                    style={{ color: "#5BB0D1" }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="#5BB0D1"
                      className="h-[12px] w-[12px]"
                      aria-hidden
                    >
                      <path d="M22.5 12.5l-2.7-3 .4-4-3.9-.9-2-3.5-3.7 1.9-3.7-1.9-2 3.5-3.9.8.4 4-2.7 3 2.7 3-.4 4 3.9.9 2 3.5 3.7-1.9 3.7 1.9 2-3.5 3.9-.8-.4-4 2.6-3zM10 17.5L5.5 13l1.7-1.7L10 14.1l6.7-6.7L18.4 9 10 17.5z" />
                    </svg>
                    피부과 전문의
                  </span>
                )}
              </div>
              {/* 2줄: 주제 · 날짜 (영상 글이거나 작성일이 있을 때만) */}
              {(qa.video?.topic || dateLabel) && (
                <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                  {qa.video?.topic ? qa.video.topic : ""}
                  {dateLabel
                    ? `${qa.video?.topic ? " · " : ""}${dateLabel}`
                    : ""}
                </div>
              )}
            </div>
          </button>

          {/* 3. 본문 — 줄바꿈 보존, 길이 충분할 때만 클릭으로 펼침/접기 */}
          <div
            onClick={() => isLongAnswer && setExpanded((v) => !v)}
            className={isLongAnswer ? "cursor-pointer" : ""}
          >
            <p
              className={`whitespace-pre-wrap text-[15px] leading-[1.7] text-[var(--text)] ${
                isLongAnswer && !expanded ? "line-clamp-5" : ""
              }`}
              style={{ transition: "color 0.2s ease" }}
            >
              {highlight(qa.answer, activeQuery)}
            </p>
          </div>
        </>
      )}
      <div className="mt-2 flex items-center gap-3 text-[12px]">
        {isLongAnswer && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="cursor-pointer rounded-md px-1.5 py-0.5 font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--bg-soft)]/60 hover:text-[var(--primary)]"
          >
            {expanded ? "접기 ▴" : "더보기 ▾"}
          </button>
        )}
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

      {/* 키워드 칩 — 컴팩트 + 첫 6개만 노출, 초과 시 +N 토글 */}
      {qa.keywords.length > 0 && (
        <Keywords
          keywords={qa.keywords}
          activeQuery={activeQuery}
          queryCategoryColor={queryCategoryColor ?? null}
          onPick={(kw) => {
            const params = new URLSearchParams({ q: kw });
            if (boostDoctorSlug) params.set("boost", boostDoctorSlug);
            router.push(`/?${params.toString()}`);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
      )}

      {/* footer: 조회수·좋아요·댓글·공유 — 컴팩트 */}
      <div className="flex items-center gap-3.5 border-t border-[var(--border)] pt-2.5 text-[13px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1" aria-label="조회수">
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
          className={
            "flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-all " +
            (liked
              ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]")
          }
          style={
            liked
              ? { backgroundColor: "var(--accent-soft)" }
              : undefined
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              "transition-transform " +
              (liked
                ? "h-[20px] w-[20px] like-pulse"
                : "h-[18px] w-[18px]")
            }
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span>{likeCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex cursor-pointer items-center gap-1 transition-colors hover:text-[var(--primary)]"
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
          className="ml-auto flex cursor-pointer items-center gap-1 transition-colors hover:text-[var(--primary)]"
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

        {/* 수정·삭제 — 본인 글이거나 관리자일 때만 직접 노출 */}
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => router.push(`/qa/${qa.id}/edit`)}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--primary)]"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
            >
              삭제
            </button>
          </>
        )}
      </div>

      {/* 댓글 블록 — 댓글 있거나 댓글창 열린 상태일 때만 표시 (본문 펼침과 무관) */}
      <CommentsBlock
        qaId={qa.id}
        doctorSlug={qa.doctor?.slug ?? null}
        isPublishedQa={true}
        onCountChange={setCommentCount}
        showInput={commentsOpen}
      />

      {/* 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="이 글을 삭제할까요?"
        description={"삭제하면 되돌릴 수 없어요.\n댓글과 좋아요도 함께 사라집니다."}
        confirmLabel={deleting ? "삭제 중…" : "삭제"}
        cancelLabel="취소"
        tone="danger"
        onConfirm={performDelete}
        onCancel={() => !deleting && setConfirmDeleteOpen(false)}
      />
    </article>
  );
}

// ────────────────────────────────────────────────────────────
// Keywords — 컨테이너 너비에 맞춰 한 줄에 들어가는 만큼만 노출 + +N 토글
// ────────────────────────────────────────────────────────────
const CHIP_BASE_CLASS =
  "inline-flex items-center rounded-full border px-2 py-[1px] text-[11px] whitespace-nowrap";
const CHIP_DEFAULT_STYLE: React.CSSProperties = {
  backgroundColor: "transparent",
  borderColor: "var(--border)",
  color: "var(--text-muted)",
  fontWeight: 500,
};

function Keywords({
  keywords,
  activeQuery,
  queryCategoryColor,
  onPick,
}: {
  keywords: string[];
  activeQuery?: string;
  queryCategoryColor: string | null;
  onPick: (kw: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [fitCount, setFitCount] = useState(keywords.length);

  // 측정: 자연스러운 줄바꿈(flex-wrap) 후 첫 줄에 들어간 칩 개수 검출
  useLayoutEffect(() => {
    if (showAll) return;

    const measure = () => {
      const measureDiv = measureRef.current;
      if (!measureDiv) return;
      if (measureDiv.clientWidth === 0) return;

      const chips = Array.from(
        measureDiv.querySelectorAll<HTMLElement>("[data-mchip]"),
      );
      if (chips.length === 0) {
        setFitCount(0);
        return;
      }

      const firstTop = chips[0].offsetTop;
      let firstLineCount = chips.length;
      for (let i = 1; i < chips.length; i++) {
        if (chips[i].offsetTop > firstTop + 2) {
          firstLineCount = i;
          break;
        }
      }

      if (firstLineCount === chips.length) {
        // 전부 한 줄에 들어감 → +N 불필요
        setFitCount(firstLineCount);
      } else {
        // 줄바꿈 발생 → +N 배지 자리 확보를 위해 마지막 칩 1개 빼기
        setFitCount(Math.max(0, firstLineCount - 1));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [keywords, showAll]);

  const visible = showAll ? keywords : keywords.slice(0, fitCount);
  const hidden = keywords.length - visible.length;

  return (
    <div ref={wrapperRef} className="relative mb-2 mt-2.5">
      {/* 측정용 — 보이지 않게 모든 칩을 wrap 모드로 렌더 (offsetTop으로 줄바꿈 검출) */}
      <div
        ref={measureRef}
        aria-hidden
        className="invisible pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-1"
      >
        {keywords.map((kw, i) => (
          <span
            key={`m-${i}`}
            data-mchip
            className={CHIP_BASE_CLASS}
            style={CHIP_DEFAULT_STYLE}
          >
            {kw}
          </span>
        ))}
      </div>

      {/* 실제 노출 — collapse 상태일 때 한 줄, 펼친 상태일 때만 wrap */}
      <div
        className={
          "flex gap-1 py-px " +
          (showAll ? "flex-wrap" : "flex-nowrap overflow-x-hidden")
        }
      >
        {visible.map((kw) => {
          const matched = activeQuery && kw === activeQuery;
          return (
            <button
              key={kw}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(kw);
              }}
              className={
                CHIP_BASE_CLASS +
                " cursor-pointer transition-colors hover:shadow-sm"
              }
              style={
                matched && queryCategoryColor
                  ? {
                      backgroundColor: queryCategoryColor + "1A",
                      borderColor: queryCategoryColor,
                      color: queryCategoryColor,
                      fontWeight: 700,
                    }
                  : CHIP_DEFAULT_STYLE
              }
            >
              {kw}
            </button>
          );
        })}
        {!showAll && hidden > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(true);
            }}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full border border-dashed px-2 py-[1px] text-[11px] font-medium whitespace-nowrap transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            +{hidden}
          </button>
        )}
        {showAll && keywords.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(false);
            }}
            className="inline-flex cursor-pointer items-center rounded-full border border-dashed px-2 py-[1px] text-[11px] font-medium whitespace-nowrap transition-colors hover:text-[var(--primary)]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            접기
          </button>
        )}
      </div>
    </div>
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

/** SNS 스타일 상대시간 — 방금 전 / N분 전 / N시간 전 / N일 전 / 7일 이상은 yy.mm.dd */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  return formatDate(iso);
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
