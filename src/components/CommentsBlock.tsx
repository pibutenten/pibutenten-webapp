"use client";

/**
 * CommentsBlock — Q&A 카드 하단의 댓글/답글 영역.
 *
 * - 미리보기 모드: 최신 root 댓글 2개만 표시
 * - 펼친 모드: 전체 root + 각 답글
 * - 작성자 본인 / 해당 글 원장님 / 관리자에게는 가림(hidden) 댓글도 회색으로 표시
 * - 1단계 답글까지만 (답글에는 [답글] 버튼 없음)
 *
 * RLS가 권한을 강제하므로 UI는 표시 여부와 액션 버튼 노출만 담당.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { ROLES } from "@/lib/identity-shared";
import RelativeTime from "@/components/RelativeTime";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { showToast } from "@/lib/toast";
import { getDoctorIdForProfile } from "@/lib/doctor-mapping";

type CommentStatus = "visible" | "hidden" | "deleted";

type Author = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle?: string | null;
  role: "admin" | "doctor" | "user";
  doctor_id: string | null;
};

type CommentRow = {
  id: number;
  card_id: number;
  author_id: string | null;
  parent_id: number | null;
  body: string;
  status: CommentStatus;
  like_count: number;
  created_at: string;
  updated_at: string;
  /** v4 — viewer가 이 댓글에 좋아요 표시했는지 (server prefetch) */
  viewer_liked?: boolean;
  author: Author | null;
};

type CommentWithReplies = CommentRow & { replies: CommentRow[] };

type Props = {
  cardId: number;
  /** 글이 속한 원장님 slug (현재 로그인한 사람이 그 doctor 본인일 때 [원장님] 배지) */
  doctorSlug: string | null;
  /** 발행되지 않은 글이면 댓글 폼 숨김 */
  isPublishedQa: boolean;
  /** 댓글 수 변경 알림 (부모 카드의 카운트 갱신용) */
  onCountChange?: (next: number) => void;
  /** 입력 폼 표시 여부 — 부모가 펼침 상태 기준으로 결정 */
  showInput?: boolean;
  /** true면 입력 폼 자동 포커스 안 함 (단독 URL 자동 펼침 시 모바일 키보드 방지) */
  disableAutoFocus?: boolean;
};

type Me = {
  id: string;
  role: "admin" | "doctor" | "user";
  doctor_id: string | null;
} | null;

export default function CommentsBlock({
  cardId,
  isPublishedQa,
  onCountChange,
  showInput = false,
  disableAutoFocus = false,
}: Props) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [meLoaded, setMeLoaded] = useState(false);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  // 비로그인 사용자가 "로그인하고 댓글 남기기" 클릭 시 모달 (이전 페이지 이동 → 모달)
  const [authPromptOpen, setAuthPromptOpen] = useState(false);

  // ── 댓글 fetch
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/comments?cardId=${cardId}&limit=50`, {
        cache: "no-store",
      });
      const j = (await r.json()) as
        | { comments: CommentWithReplies[]; total_root: number }
        | { error: string };
      if ("error" in j) {
        setError(j.error);
        setComments([]);
      } else {
        setComments(j.comments);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  // ── 현재 로그인 사용자 정보 (id/role/doctor_id)
  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!alive) return;
      if (!user) {
        setMe(null);
        setMeLoaded(true);
        return;
      }
      // 정책 (2026-05-15 재정의): me.id / role / doctor_id 모두 **active profile 단일** 기준.
      // - id: active profile.id (cookie 'pibutenten:identity', 'primary' 면 user.id)
      // - role: active profile 자체의 role (묶음 최고 권한 X)
      // - doctor_id: active profile 의 의사 매핑 (SSOT: profiles.doctor_id, 묶음의 다른 profile X)
      // → 댓글 본인 인식 (isAuthor) 도 active == author 일 때만.
      const activeId = getActiveIdentityId() ?? user.id;
      const [{ data: prof }, myDoctorId] = await Promise.all([
        sb
          .from("profiles")
          .select("id, role, auth_user_id")
          .eq("id", activeId)
          .maybeSingle(),
        getDoctorIdForProfile(sb, activeId),
      ]);
      if (!alive) return;
      const row = prof as { id: string; role: string; auth_user_id: string } | null;
      // 본인 묶음 검증 — 다른 사람 profile cookie 위조 차단
      const isMine = !!row && (row.id === user.id || row.auth_user_id === user.id);
      if (!isMine) {
        setMe({ id: user.id, role: "user", doctor_id: null });
        setMeLoaded(true);
        return;
      }
      const role = ((row?.role as string) ?? "user") as "admin" | "doctor" | "user";
      setMe({
        id: activeId,
        role,
        doctor_id: myDoctorId,
      });
      setMeLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isLoggedIn = !!me;
  const isAdmin = me?.role === ROLES.ADMIN;
  // qa의 doctor 본인 여부는 댓글의 권한과는 별개 (서버 RLS가 진실원). UI는 me.doctor_id로 표시 보조.

  // ── 표시할 댓글:
  //   - showInput=false (카드 상단 💬 아이콘 미클릭) → 프리뷰 3개
  //   - showInput=true  (💬 클릭으로 입력창 열림)   → 전체 펼침
  //   "모두 보기 (N)" 버튼은 제거 — 카드 상단 💬 토글이 단일 진입점.
  const visibleRoots = showInput ? comments : comments.slice(0, 3);

  // ── 가시 댓글 총 수 (전체 표시용 카운트는 totalRoot + 답글 합산보다는 visible만 카운트)
  const visibleCount = useMemo(() => {
    let c = 0;
    for (const r of comments) {
      if (r.status === "visible") c += 1;
      for (const rep of r.replies) {
        if (rep.status === "visible") c += 1;
      }
    }
    return c;
  }, [comments]);

  // ── 부모(Card)에 댓글 수 변경 알림
  useEffect(() => {
    onCountChange?.(visibleCount);
  }, [visibleCount, onCountChange]);

  // ── 작성/답글 제출
  async function submitComment(parentId: number | null) {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId, parentId, body }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        showToast(j.error ?? "댓글 작성 실패", { tone: "danger" });
        return;
      }
      setBody("");
      setReplyTarget(null);
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function patchComment(
    id: number,
    patch: { body?: string; status?: CommentStatus },
  ) {
    const r = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      showToast(j.error ?? "수정 실패", { tone: "danger" });
      return false;
    }
    await reload();
    return true;
  }

  async function deleteComment(id: number) {
    if (!confirm("정말 삭제할까요? 답글도 함께 삭제됩니다.")) return;
    const r = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      showToast(j.error ?? "삭제 실패", { tone: "danger" });
      return;
    }
    await reload();
  }

  // 미니멀 모드: 댓글 0개 + 입력 폼 비표시 → 자체 렌더링 안 함
  const hasComments = visibleCount > 0;
  if (!loading && !hasComments && !showInput) {
    return null;
  }

  return (
    <div
      // 빈 공간 축소: 댓글 0 개일 때 mt-3 pt-2.5 → mt-1.5 pt-1.5 (옛 버튼 줄과 입력창
      // 사이 빈 공간이 너무 크다는 사용자 보고 fix). hasComments 일 때는 옛 간격 유지.
      className={
        "text-[13px] text-[var(--text)] " +
        (hasComments ? "mt-3 pt-2.5 border-t" : "mt-1.5 pt-1.5")
      }
      style={hasComments ? { borderColor: "#EEEFF1" } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {error && (
        <p className="text-[12px] text-red-600">댓글을 불러오지 못했어요: {error}</p>
      )}

      <ul className="flex flex-col">
        {visibleRoots.map((c) => (
          <li key={c.id}>
            <CommentItem
              comment={c}
              me={me}
              isAdmin={isAdmin}
              onReplyClick={() =>
                setReplyTarget((v) => (v === c.id ? null : c.id))
              }
              isReplying={replyTarget === c.id}
              onPatch={patchComment}
              onDelete={deleteComment}
              onRequireLogin={() => setAuthPromptOpen(true)}
            />

            {/* 답글 목록 — 좌측 세로선으로 그룹 표현. 댓글↔답글 간격은 각 item의 py-1.5로 통일 */}
            {c.replies.length > 0 && (
              <ul
                className="ml-2 flex flex-col border-l pl-2.5"
                style={{ borderColor: "#EEEFF1" }}
              >
                {c.replies.map((rep) => (
                  <li key={rep.id}>
                    <CommentItem
                      comment={rep}
                      me={me}
                      isAdmin={isAdmin}
                      isReply
                      onPatch={patchComment}
                      onDelete={deleteComment}
                      onRequireLogin={() => setAuthPromptOpen(true)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {/* 답글 입력 폼 (root 댓글에만) */}
            {replyTarget === c.id && isLoggedIn && (
              <div className="mt-2 pl-4">
                <CommentForm
                  body={body}
                  onChange={setBody}
                  onSubmit={() => submitComment(c.id)}
                  submitting={submitting}
                  placeholder="답글을 입력하세요"
                  onCancel={() => {
                    setReplyTarget(null);
                    setBody("");
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* root 댓글 입력 폼 — showInput 시에만 노출, meLoaded 후에만 분기 (깜빡임 방지) */}
      {showInput && isPublishedQa && meLoaded && isLoggedIn && replyTarget == null && (
        <div className="mt-3">
          <CommentForm
            body={body}
            onChange={setBody}
            onSubmit={() => submitComment(null)}
            submitting={submitting}
            placeholder="텐즈님의 생각을 남겨주세요"
            disableAutoFocus={disableAutoFocus}
          />
        </div>
      )}
      {showInput && isPublishedQa && meLoaded && !isLoggedIn && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setAuthPromptOpen(true)}
            className="text-[12px] text-[var(--text-muted)] hover:text-[var(--primary)] hover:underline"
          >
            로그인하고 댓글 남기기
          </button>
        </div>
      )}
      <LoginPromptDialog
        open={authPromptOpen}
        message="댓글을 남기려면 회원가입이 필요해요"
        onClose={() => setAuthPromptOpen(false)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CommentItem — 댓글 1개
// ─────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  me,
  isAdmin,
  isReply = false,
  isReplying = false,
  onReplyClick,
  onPatch,
  onDelete,
  onRequireLogin,
}: {
  comment: CommentRow;
  me: Me;
  isAdmin: boolean;
  isReply?: boolean;
  isReplying?: boolean;
  onReplyClick?: () => void;
  onPatch: (id: number, p: { body?: string; status?: CommentStatus }) => Promise<boolean>;
  onDelete: (id: number) => void;
  /** 비로그인 사용자가 좋아요 시도 시 호출 — 부모(CommentsBlock)의 LoginPromptDialog 열림. */
  onRequireLogin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  // v4 — 좋아요 (root + 답글 모두)
  const [liked, setLiked] = useState<boolean>(!!comment.viewer_liked);
  const [likeCount, setLikeCount] = useState<number>(comment.like_count);
  const [likePending, setLikePending] = useState(false);
  async function toggleLike() {
    if (likePending) return;
    if (!me) {
      onRequireLogin();
      return;
    }
    setLikePending(true);
    const wasLiked = liked;
    setLiked(!wasLiked); // 낙관적
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));
    const sb = createSupabaseBrowserClient();
    const { data, error } = await sb.rpc("toggle_comment_like", {
      p_comment_id: comment.id,
      p_identity_id: getActiveIdentityId(),
    });
    if (error) {
      setLiked(wasLiked);
      setLikeCount(comment.like_count);
    } else {
      const row = (data as { liked: boolean; like_count: number }[] | null)?.[0];
      if (row) {
        setLiked(row.liked);
        setLikeCount(row.like_count);
      }
    }
    setLikePending(false);
  }
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  // 외부 클릭 시 메뉴 닫기 (trigger·panel 둘 다 검사)
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuTriggerRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  // 메뉴 위치 계산 — trigger 버튼 기준 viewport 좌표 (portal로 body에 렌더되므로)
  function openMenu() {
    const el = menuTriggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX - 120, // min-w 120px 기준 우측 정렬
    });
    setMenuOpen(true);
  }

  const isAuthor = !!me && comment.author_id === me.id;
  // 가림/복원/삭제는 관리자 또는 본인. (해당 글 doctor 권한은 RLS가 강제 — UI에서 버튼은 관리자/원장 본인 매칭일 때만 노출하기 위해
  //  me.doctor_id 와 매칭 시 표시하는데, 클라이언트는 qa의 doctor_id를 모르므로 관리자에게만 노출. 원장은 어차피 RLS로 가능.)
  const canModerate = isAdmin;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isAdmin;
  const showMenu = canEdit || canDelete || canModerate;

  const isHidden = comment.status === "hidden";
  const isDeleted = comment.status === "deleted";

  // 가림 댓글 표시: 본인 / admin / doctor RLS 통과로 응답에 포함된 경우만. 회색 처리.
  const dimmed = isHidden || isDeleted;

  // 작성자 배지 — role='doctor' active identity면 verified 마크
  const role = comment.author?.role;
  const isAuthorDoctor = role === ROLES.DOCTOR;

  const displayName = comment.author?.display_name ?? "익명";
  const profileLink = comment.author?.handle
    ? `/${comment.author.handle}`
    : comment.author?.id
      ? `/u/${comment.author.id}`
      : null;
  // P1-4 fix — RelativeTime 컴포넌트로 위임. SSR 빈 문자열 → 마운트 후 실제 값 set.
  //   hydration mismatch (React #418) 방지.

  return (
    <div
      className={
        dimmed ? "rounded-md px-2 py-1.5" : "rounded-md px-0 py-1"
      }
      style={
        dimmed
          ? { backgroundColor: "#EEEEEE", color: "#888" }
          : undefined
      }
    >
      {/* 새 레이아웃: 메타(시간·답글·♡·⋮)는 우측 float, 닉네임+본문은 inline 텍스트로 흐름.
          본문이 길어지면 자연 wrap 으로 둘째 줄이 닉네임과 동일한 좌측 라인에서 시작.
          닉네임 ↔ 본문 5px / 메타 사이 간격 2px·5px·2px·8px. */}
      <div className="text-[13px] leading-[1.5]" style={{ display: "flow-root" }}>
        {/* 메타 — float-right. 텍스트 흐름이 좌측부터 채워지고 끝나면 둘째 줄은 좌단으로 wrap. */}
        <div className="float-right ml-2 inline-flex items-center whitespace-nowrap">
          <span className="text-[11px] text-[var(--text-muted)]">
            <RelativeTime iso={comment.created_at} />
          </span>
          {isHidden && (
            <span className="ml-1 text-[11px] text-[var(--text-muted)]">숨김됨</span>
          )}
          {isDeleted && (
            <span className="ml-1 text-[11px] text-[var(--text-muted)]">🗑 삭제</span>
          )}
          {/* 답글 — root 댓글에만 (시간 → 가온점: 2px, 가온점 → 답글: 5px) */}
          {!isReply && onReplyClick && !isDeleted && (
            <>
              <span
                style={{ marginLeft: "2px" }}
                className="inline-flex items-center text-[11px] leading-none text-[var(--text-muted)]"
                aria-hidden
              >
                ·
              </span>
              <button
                type="button"
                onClick={onReplyClick}
                style={{ marginLeft: "5px" }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]"
              >
                {isReplying ? "답글 취소" : "답글"}
              </button>
            </>
          )}
          {/* 좋아요 — 답글 → ♡: 2px */}
          {!isDeleted && (
            <button
              type="button"
              onClick={toggleLike}
              disabled={likePending}
              aria-label={liked ? "좋아요 취소" : "좋아요"}
              style={{ marginLeft: "2px" }}
              className={
                "inline-flex items-center gap-0.5 text-[11px] transition-colors " +
                (liked
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--accent)]")
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[12px] w-[12px]"
                aria-hidden
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
          )}

          {showMenu && (
            <button
              ref={menuTriggerRef}
              type="button"
              aria-label="메뉴"
              style={{ marginLeft: "8px" }}
              className="px-1 text-[16px] leading-none text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={(e) => {
                e.stopPropagation();
                if (menuOpen) setMenuOpen(false);
                else openMenu();
              }}
            >
              ⋮
            </button>
          )}
        </div>

        {/* 닉네임 */}
        {profileLink ? (
          <Link
            href={profileLink}
            className="font-bold text-[var(--text)] hover:text-[var(--primary)] hover:underline"
            style={dimmed ? { color: "#888" } : undefined}
          >
            {displayName}
          </Link>
        ) : (
          <span
            className="font-bold text-[var(--text)]"
            style={dimmed ? { color: "#888" } : undefined}
          >
            {displayName}
          </span>
        )}
        {/* 원장님 verified ✓ */}
        {isAuthorDoctor && (
          <svg
            viewBox="0 0 12 12"
            fill="none"
            className="ml-0.5 inline-block h-[12px] w-[12px] align-middle"
            aria-label="피부과 전문의"
          >
            <path
              d="M6 0L7.6025 1.30939L9.7082 1.1459L10.1954 3.10104L12 4.1459L11.1858 6L12 7.8541L10.1954 8.89896L9.7082 10.8541L7.6025 10.6906L6 12L4.3975 10.6906L2.2918 10.8541L1.80459 8.89896L0 7.8541L0.814188 6L0 4.1459L1.80459 3.10104L2.2918 1.1459L4.3975 1.30939L6 0Z"
              fill="#4CBFF2"
            />
            <path
              d="M8.56567 4.79451L5.50235 7.85783L3.43457 5.79005L4.08693 5.1373L5.50235 6.55232L7.91292 4.14215L8.56567 4.79451Z"
              fill="#FFFFFF"
            />
          </svg>
        )}
        {/* 본문 — 닉네임 ↔ 본문 5px. 둘째 줄부터 좌측 0 에서 시작 (들여쓰기 없음). */}
        {!editing && (
          <span
            style={{ marginLeft: "5px" }}
            className="text-[13px] text-[var(--text-secondary)]"
          >
            {isDeleted
              ? "(삭제된 댓글이에요)"
              : comment.body.replace(/\s+/g, " ").trim()}
          </span>
        )}

      </div>

      {/* 메뉴 panel — Portal (트리거 버튼은 위 float-right div 안에 있음) */}
      {showMenu && menuOpen && menuPos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuPanelRef}
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
            }}
            className="z-[200] min-w-[120px] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {canEdit && !isDeleted && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--bg-soft)]"
                onClick={() => {
                  setEditing(true);
                  setEditBody(comment.body);
                  setMenuOpen(false);
                }}
              >
                수정
              </button>
            )}
            {canModerate && comment.status === "visible" && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] text-[var(--text)] hover:bg-[var(--bg-soft)]"
                onClick={async () => {
                  setMenuOpen(false);
                  await onPatch(comment.id, { status: "hidden" });
                }}
              >
                숨김
              </button>
            )}
            {canModerate && isHidden && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--bg-soft)]"
                onClick={async () => {
                  setMenuOpen(false);
                  await onPatch(comment.id, { status: "visible" });
                }}
              >
                해제
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(comment.id);
                }}
              >
                삭제
              </button>
            )}
          </div>,
          document.body,
        )}

      {/* 본문 / 수정 폼 */}
      {editing ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <textarea
            value={editBody}
            onChange={(e) => {
              setEditBody(e.target.value);
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = t.scrollHeight + "px";
            }}
            rows={2}
            className="w-full resize-none overflow-hidden rounded border border-[var(--border)] p-2 text-[13px] focus:border-[var(--primary)] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded px-2.5 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={() => setEditing(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="rounded bg-[var(--primary)] px-3 py-1 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              disabled={!editBody.trim()}
              onClick={async () => {
                const ok = await onPatch(comment.id, { body: editBody.trim() });
                if (ok) setEditing(false);
              }}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}

      {/* 답글 버튼은 헤더 라인 inline으로 옮김 */}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CommentForm — 입력 폼
// ─────────────────────────────────────────────────────────────

function CommentForm({
  body,
  onChange,
  onSubmit,
  submitting,
  placeholder,
  disableAutoFocus = false,
}: {
  body: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  placeholder?: string;
  /** 더 이상 사용하지 않음 — 답글 취소는 헤더 라인의 [답글 취소] inline 토글로 대체 */
  onCancel?: () => void;
  /** true면 마운트 시 자동 포커스 안 함 (단독 URL 자동 펼침에서 키보드 방지) */
  disableAutoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 마운트 시 자동 포커스 — 댓글창/답글창 열림 즉시 입력 가능 (모바일 키보드 자동 활성)
  // disableAutoFocus=true면 (단독 URL 자동 펼침 등) 포커스 생략.
  useEffect(() => {
    if (disableAutoFocus) return;
    const ta = textareaRef.current;
    if (!ta) return;
    // iOS Safari: 직접 focus만으론 키보드 안 뜰 수 있어 두 단계 시도
    ta.focus();
    // 다음 프레임에 한 번 더 시도 (조건부 렌더 직후 안정화 대기)
    const id = window.setTimeout(() => {
      ta.focus();
      // 커서를 끝으로
      const len = ta.value.length;
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [disableAutoFocus]);

  const submitDisabled = submitting || !body.trim();

  return (
    /* 댓글 입력 박스 (스펙):
       - R: 고정 20px (textarea 높이 늘어나도 모서리 R 보존, 원형으로 변형되지 않음)
       - 테두리: #DCE3E7 / 1px (포커스 시 primary)
       - 높이: 40px (textarea가 늘면 컨테이너도 늘어남)
       - 폰트 13pt, placeholder 색 #A2A6AF
       - 텍스트 세로 중앙 정렬 (line-height + 수직 padding 으로 정확히 40px)
       - 등록 버튼: comment_btn_enabled / disabled SVG 1:1 사용 (28×28) */
    <div
      className="flex items-center gap-1 rounded-[20px] border bg-white pl-1 pr-1 min-h-[40px] focus-within:border-[var(--primary)]"
      style={{ borderColor: "#DCE3E7", borderWidth: "1px" }}
    >
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          autoFocus={!disableAutoFocus}
          value={body}
          onChange={(e) => {
            onChange(e.target.value);
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = t.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            // Enter → 등록 / Shift+Enter → 줄바꿈
            // IME 조합 중(한글 입력)에는 isComposing/keyCode 229로 무시
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              if (!submitting && body.trim()) onSubmit();
            }
          }}
          placeholder={placeholder ?? "댓글을 입력하세요"}
          rows={1}
          maxLength={2000}
          // 폰트 13pt, line-height 20px + py 10px = 단일 라인 시 정확히 40px (컨테이너 높이와 일치 → 세로 중앙)
          className={
            "block w-full resize-none overflow-hidden border-0 bg-transparent px-3 text-[13px] leading-[20px] placeholder:text-[#A2A6AF] focus:outline-none focus:ring-0 " +
            (body.length >= 1500 ? "pr-14 pb-5" : "")
          }
          style={{ paddingTop: "10px", paddingBottom: "10px" }}
        />
        {/* 글자수 카운트 — 1500자 이상부터만 노출 (한도 임박 알림) */}
        {body.length >= 1500 && (
          <span
            className="pointer-events-none absolute bottom-1 right-2 text-[10px]"
            style={{
              color: body.length >= 1900 ? "#E91E63" : "var(--text-muted)",
            }}
          >
            {body.length}/2000
          </span>
        )}
      </div>
      {/* 등록 — comment_btn SVG 1:1 사용 (28×28). disabled 상태별 SVG 교체.
          self-center 로 multi-line 시 세로 중앙 유지. */}
      <button
        type="button"
        aria-label="등록"
        title="등록"
        className="self-center shrink-0 flex h-7 w-7 items-center justify-center disabled:cursor-not-allowed"
        disabled={submitDisabled}
        onPointerDown={(e) => {
          // 한글 IME 조합 종료 강제 — composition 이 끝나야 body 가 갱신되고 disabled 해제됨
          const ta = textareaRef.current;
          if (ta && document.activeElement === ta) {
            ta.blur();
            ta.focus();
          }
          void e;
        }}
        onClick={() => {
          if (submitting || !body.trim()) return;
          onSubmit();
        }}
      >
        {submitting ? (
          <span className="text-[12px]">…</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              submitDisabled
                ? "/icons/comment_btn_disabled.svg"
                : "/icons/comment_btn_enabled.svg"
            }
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
            aria-hidden
          />
        )}
      </button>
    </div>
  );
}

// helper: 상대시간 (예: "2일 전") — RelativeTime 컴포넌트로 이전됨 (P1-4 fix).
//   `src/components/RelativeTime.tsx` 의 formatRelativeTime/RelativeTime 사용.
