"use client";

import Image from "next/image";
import Link from "next/link";
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
import { getQaUrl } from "@/lib/qa-url";
import {
  parseYoutubeTimestamp,
  formatTimestamp,
} from "@/lib/youtube-time";
import { labelForCategory } from "@/lib/post-category";
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
  type?: "qa" | "post" | "article" | "link";
  created_at?: string;
  /** 작성 당시 페르소나 — 'personal'이면 author.alt_* 우선 표시 */
  posted_as?: "official" | "personal";
  /** §2 SEO URL — /doctors/{slug}/{year}/{postSlug} canonical 생성용 */
  post_year?: number | null;
  post_slug?: string | null;
  /** v4 — 회원 글 / 의사 personal 글 URL용 8자 base58 식별자 */
  shortcode?: string | null;
  /** 외부 링크 — 모든 카테고리에서 옵션 (Phase 3). qa 카테고리 외에서는 카드에 [더 알아보기] 버튼 노출 */
  external_url?: string | null;
  external_title?: string | null;
  external_description?: string | null;
  external_image?: string | null;
  external_site_name?: string | null;
  /** 글 분류 카테고리 (Phase 2) */
  category?: string | null;
  /** 의사 직함 숨김 (Phase A.2) — true면 사적 모드, "피부과 전문의" 배지 숨김 */
  hide_doctor_credential?: boolean | null;
  doctor: {
    slug: string;
    name: string;
    branch: string | null;
  } | null;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    alt_display_name?: string | null;
    alt_avatar_url?: string | null;
    /** v4 — 회원 핸들 (URL용) */
    handle?: string | null;
    alt_handle?: string | null;
    /** v4 — avatar cache buster용. profile.updated_at (avatar 변경 시 갱신) */
    updated_at?: string | null;
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
  /** 검색어 — 일치하는 태그 칩은 카테고리 색, 본문은 노란 mark */
  activeQuery?: string;
  /** 칩 클릭 시 검색 URL에 boost로 함께 전달 (원장님 단일 페이지에서 사용) */
  boostDoctorSlug?: string;
  /** 이 카드가 HOT인지 (서버에서 계산한 hot id set 기준) */
  isHot?: boolean;
  /** 단독 페이지(/qa/[id], /doctors/{slug}/{year}/{slug})에서 사용 — 댓글 자동 열림 + 입력 포커스 */
  autoExpandComments?: boolean;
  /** 단독 페이지: 본문 자동 펼침 (line-clamp 해제). 짧은 글이면 영향 없음. */
  forceExpanded?: boolean;
};

export default function QACard({
  qa,
  activeQuery,
  boostDoctorSlug,
  isHot = false,
  autoExpandComments = false,
  forceExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(forceExpanded);
  const [viewCount, setViewCount] = useState(qa.view_count);
  const [likeCount, setLikeCount] = useState(qa.like_count);
  const [shareCount, setShareCount] = useState(qa.share_count ?? 0);
  const [commentCount, setCommentCount] = useState(qa.comment_count ?? 0);
  // 단독 페이지에서는 댓글창 자동 열림 (autoExpandComments)
  const [commentsOpen, setCommentsOpen] = useState(autoExpandComments);
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

  // 조회수 +1 — 의도적인 "보기" 신호일 때만 카운트.
  // 조건:
  //   1) 사용자가 페이지에서 한 번이라도 스크롤한 후 (scrollOnce)
  //   2) 카드가 viewport 중앙 30% 영역에 진입
  //   3) 그 위치에 DWELL_MS(1.5초) 머물러 있을 때
  //   → 첫 화면 그대로 멈춰 있어도 카운트 X (스크롤 신호 필요)
  //   → 스크롤 후 빠르게 지나가는 카드도 카운트 X (dwell 필요)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const card = cardRef.current;
    if (!card) return;

    const DWELL_MS = 1500;
    let counted = false;
    let scrolled = false;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingIntersect = false;

    function maybeStartDwell() {
      if (counted || !scrolled || !pendingIntersect) return;
      if (dwellTimer) return;
      dwellTimer = setTimeout(() => {
        if (counted) return;
        counted = true;
        const sb = createSupabaseBrowserClient();
        sb.rpc("increment_qa_view", { p_qa_id: qa.id }).then(
          ({ data }: { data: number | null }) => {
            if (typeof data === "number") setViewCount(data);
          },
        );
        window.dispatchEvent(new CustomEvent("pibutenten:qa-viewed"));
        observer.disconnect();
      }, DWELL_MS);
    }

    function onScroll() {
      if (scrolled) return;
      scrolled = true;
      maybeStartDwell();
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          pendingIntersect = true;
          maybeStartDwell();
        } else {
          pendingIntersect = false;
          if (dwellTimer) {
            clearTimeout(dwellTimer);
            dwellTimer = null;
          }
        }
      },
      {
        rootMargin: "-35% 0px -35% 0px",
        threshold: 0.01,
      },
    );
    observer.observe(card);
    return () => {
      if (dwellTimer) clearTimeout(dwellTimer);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
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
  // 모든 글 단일 시간 기준 — qas.created_at (영상 글은 backfill로 video.upload_date와 동기화됨)
  // SNS 표준 상대시간 + 호버 시 절대 날짜
  const dateLabel = qa.created_at ? relativeTime(qa.created_at) : null;
  const dateAbsolute = qa.created_at
    ? absoluteDateTimeLabel(qa.created_at)
    : null;
  const dateIso = qa.created_at ?? undefined;

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
        // 1) 피드의 client-side 리스트에 즉시 반영 (FeedWithArticles가 listen)
        window.dispatchEvent(
          new CustomEvent("pibutenten:qa-deleted", { detail: { id: qa.id } }),
        );
        // 2) 단일 포스트 페이지에서 삭제한 경우 — 메인 피드로 이동
        //    (현재 URL이 /qa/{id} 또는 /doctors/.../{post-slug}이면 그 페이지가 사라진 상태)
        const path = window.location.pathname;
        if (
          path.startsWith(`/qa/${qa.id}`) ||
          (qa.post_slug && path.includes(`/${qa.post_slug}`))
        ) {
          router.push("/");
        } else {
          // 3) 그 외 페이지(피드/검색/대시보드 등)는 RSC 재요청
          router.refresh();
        }
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

  // 페르소나 — 'personal'로 작성된 글은 alt 정보 우선, doctor 뱃지/링크 숨김
  const isPersonalPost = qa.posted_as === "personal";
  // hide_doctor_credential — 의사가 카테고리·토글로 직함 숨긴 경우 (Phase A.2)
  const credentialHidden = Boolean(qa.hide_doctor_credential);
  const showAsDoctor = !!doctor && !isPersonalPost && !credentialHidden;
  const authorName = isPersonalPost
    ? qa.author?.alt_display_name ?? qa.author?.display_name ?? "익명"
    : doctor?.name ?? qa.author?.display_name ?? "익명";
  // 회원·personal 아바타에는 cache buster (profile.updated_at) 부착 — 사진 변경 즉시 반영
  const rawAvatar = isPersonalPost
    ? qa.author?.alt_avatar_url ?? qa.author?.avatar_url ?? null
    : doctor
      ? photo
      : qa.author?.avatar_url ?? null;
  const authorAvatar = (() => {
    if (!rawAvatar) return null;
    if (doctor && !isPersonalPost) return rawAvatar; // 정적 의사 사진은 그대로
    const ts = qa.author?.updated_at;
    if (!ts) return rawAvatar;
    const stamp = new Date(ts).getTime();
    return rawAvatar + (rawAvatar.includes("?") ? "&" : "?") + "v=" + stamp;
  })();

  return (
    <article
      ref={cardRef}
      className="fade-in-up relative rounded-[var(--radius)] bg-white p-[18px_20px]"
    >
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
          {/* 1. 작성자 행 — 가장 위 (원장이면 원장 페이지, 일반 사용자면 /u/[id] 로 이동) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (showAsDoctor && doctor?.slug) {
                router.push(`/doctors/${doctor.slug}`);
              } else if (qa.author?.id) {
                // 개인모드 글이면 ?p=personal 로 personal-only 활동 표시
                const suffix = isPersonalPost ? "?p=personal" : "";
                router.push(`/u/${qa.author.id}${suffix}`);
              }
            }}
            disabled={!showAsDoctor && !qa.author?.id}
            className={
              "mb-3 -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-md py-1.5 px-1 text-left transition-colors " +
              (showAsDoctor || qa.author?.id
                ? "cursor-pointer hover:bg-[var(--primary-soft)]"
                : "cursor-default")
            }
            aria-label={
              showAsDoctor
                ? `${authorName} 원장님 소개로 이동`
                : `${authorName} 프로필로 이동`
            }
          >
            <div
              className="relative shrink-0 overflow-hidden rounded-full"
              style={{
                background: showAsDoctor ? theme?.bg ?? "var(--bg-soft)" : "var(--bg-soft)",
                boxShadow: showAsDoctor
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
                    showAsDoctor
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
              {/* 1줄: 이름 + 피부과 전문의 — 글자 살짝만 키워서 아바타와 높이 균형 */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 leading-[1.2]">
                <span className="text-[13.5px] font-bold leading-[1.2] text-[var(--text)]">
                  {authorName}
                </span>
                {showAsDoctor && (
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium leading-[1.2]"
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
              {/* 2줄: 카테고리 · 날짜 — 모든 글 동일 (의사·회원·관리자 다 동일).
                  옛 영상 topic 표시는 v4에서 제거 (카테고리로 통일). */}
              {(() => {
                const catLabel = labelForCategory(qa.category);
                if (!catLabel && !dateLabel) return null;
                return (
                  <div className="mt-[3px] truncate text-[11.5px] leading-[1.2] text-[var(--text-muted)]">
                    {catLabel}
                    {dateLabel && (
                      <>
                        {catLabel ? " · " : ""}
                        <time
                          dateTime={dateIso}
                          title={dateAbsolute ?? undefined}
                        >
                          {dateLabel}
                        </time>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </button>

          {/* 2. 제목 — 하늘색(브랜드 primary), 클릭 시 단독 페이지로 이동.
              내부 링크 신호(PageRank · 앵커 텍스트) 누적 + 크롤러가 단독 URL 색인 가능. */}
          <h2 className="mb-2.5 whitespace-pre-wrap text-[17px] font-bold leading-[1.45] tracking-[-0.3px]">
            <Link
              href={getQaUrl(qa)}
              className="text-[var(--primary)] hover:underline"
            >
              {highlight(qa.question, activeQuery)}
            </Link>
          </h2>

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
        {/* 더보기 버튼 제거 — 본문 클릭으로 펼침/접기 */}
        {(() => {
          // 영상 링크 우선순위:
          //  1) Q&A 카테고리 + external_url(youtube) → 영상 보러가기 + timestamp
          //  2) videos 테이블 join (legacy backfill)
          //  3) 그 외 카테고리 + external_url → [더 알아보기]
          const isQa = qa.category === "qa";
          const ext = qa.external_url;
          const isYoutubeExt =
            ext && /(?:youtu\.be|youtube\.com|youtube-nocookie\.com)/.test(ext);
          const videoHref =
            isQa && isYoutubeExt
              ? ext
              : qa.video?.youtube_url ?? null;
          const tsec = parseYoutubeTimestamp(videoHref);
          if (videoHref) {
            return (
              <a
                href={videoHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  // 영상 보러가기 클릭 = 조회수 +1
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
                <span style={{ color: "#FF0000" }}>▶</span>{" "}
                영상에서 자세히 보기
                {tsec !== null && (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {formatTimestamp(tsec)}~
                  </span>
                )}
              </a>
            );
          }
          // Q&A 외 카테고리 + external_url (영상 아님) → [더 알아보기]
          if (!isQa && ext) {
            return (
              <a
                href={ext}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-soft)]/60 hover:text-[var(--primary-light-hover)]"
              >
                <span aria-hidden>↗</span> 더 알아보기
              </a>
            );
          }
          return null;
        })()}
      </div>

      {/* 태그 칩 — 카테고리 라벨(꿀팁/피부일기/물어봐요/새소식/Q&A)은 위 헤더에 이미
          표시되므로 태그에서는 제외. 옛 데이터 호환 위해 display 단계에서 필터. */}
      {(() => {
        const CATEGORY_LABELS = [
          "Q&A", "답해드려요",
          "꿀팁", "피부꿀팁",
          "피부일기",
          "물어봐요", "궁금해요",
          "새소식",
        ];
        const visibleKeywords = qa.keywords.filter(
          (k) => !CATEGORY_LABELS.includes(k),
        );
        if (visibleKeywords.length === 0) return null;
        return (
        <Keywords
          keywords={visibleKeywords}
          activeQuery={activeQuery}
          queryCategoryColor={queryCategoryColor ?? null}
          onPick={(kw) => {
            const params = new URLSearchParams({ q: kw });
            if (boostDoctorSlug) params.set("boost", boostDoctorSlug);
            // v3 URL 정책: 검색은 /search 로 분리됨
            router.push(`/search?${params.toString()}`);
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        />
        );
      })()}

      {/* footer: 조회수·좋아요·댓글·공유 — 컴팩트 */}
      <div className="flex items-center gap-3.5 pt-3 text-[13px] text-[var(--text-secondary)]">
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
  "inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] whitespace-nowrap";
const CHIP_DEFAULT_STYLE: React.CSSProperties = {
  backgroundColor: "#F0F2F5",
  color: "#8A8F99",
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
  const [showAll, setShowAll] = useState(false);
  // 초기값: 모든 태그 노출(SSR HTML에는 한 번만 등장).
  // 클라이언트에서 첫 줄 측정 후 fitCount 조정 → +N 배지 표시.
  const [fitCount, setFitCount] = useState<number>(keywords.length);

  // 측정: DOM에 detached probe div를 잠깐 만들어 첫 줄에 맞는 칩 갯수 계산.
  //  → 별도 측정 div를 마크업에 두지 않음 (검색엔진/AI 태그 스터핑 방지)
  useLayoutEffect(() => {
    if (showAll) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (typeof document === "undefined") return;

    const measure = () => {
      const w = wrapper.clientWidth;
      if (w === 0) return;
      const probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = `position:absolute;left:-99999px;top:-99999px;width:${w}px;display:flex;flex-wrap:wrap;gap:4px;visibility:hidden;`;
      for (const kw of keywords) {
        const span = document.createElement("span");
        span.className = CHIP_BASE_CLASS;
        span.style.backgroundColor = "#F0F2F5";
        span.style.color = "#8A8F99";
        span.style.fontWeight = "500";
        span.textContent = kw;
        probe.appendChild(span);
      }
      document.body.appendChild(probe);
      const chips = Array.from(probe.children) as HTMLElement[];
      let count = chips.length;
      if (chips.length > 0) {
        const firstTop = chips[0].offsetTop;
        for (let i = 1; i < chips.length; i++) {
          if (chips[i].offsetTop > firstTop + 2) {
            count = Math.max(0, i - 1); // +N 배지 자리 확보
            break;
          }
        }
      }
      document.body.removeChild(probe);
      setFitCount(count);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [keywords, showAll]);

  const visible = showAll ? keywords : keywords.slice(0, fitCount);
  const hidden = keywords.length - visible.length;

  return (
    <div ref={wrapperRef} className="relative mb-2 mt-2.5">
      {/* 스크린리더 + LLM/검색엔진용 텍스트 — 콤마 구분으로 단어 경계 명시 (D-4) */}
      <span className="sr-only">태그: {keywords.join(", ")}</span>
      {/* 실제 노출 — collapse 상태일 때 한 줄, 펼친 상태일 때만 wrap */}
      <div
        aria-hidden="true"
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
            className="inline-flex shrink-0 cursor-pointer items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap transition-colors hover:text-[var(--primary)]"
            style={{ backgroundColor: "#F0F2F5", color: "#8A8F99" }}
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
            className="inline-flex cursor-pointer items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap transition-colors hover:text-[var(--primary)]"
            style={{ backgroundColor: "#F0F2F5", color: "#8A8F99" }}
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
  // v4 canonical URL — getQaUrl이 의사 official(slug)·회원/personal(handle+shortcode)·fallback 결정
  const path = getQaUrl(qa);
  const url = `${window.location.origin}${path}`;
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
 * SNS 표준 상대시간.
 *  - <1분: 방금 전
 *  - <1시간: N분 전
 *  - <24시간: N시간 전
 *  - <7일: N일 전
 *  - <4주: N주 전
 *  - <12달: N달 전
 *  - 그 외: N년 전
 */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  if (diffSec < 86400 * 28) return `${Math.floor(diffSec / (86400 * 7))}주 전`;
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / (86400 * 30))}달 전`;
  return `${Math.floor(diffSec / (86400 * 365))}년 전`;
}

/**
 * 호버 절대 날짜 — title 속성용.
 * 예: "2026년 4월 24일 14:30"
 */
function absoluteDateTimeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}년 ${m}월 ${day}일 ${hh}:${mm}`;
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
