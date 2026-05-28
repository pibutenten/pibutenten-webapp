"use client";

/**
 * CommentsBlock — Q&A 카드 하단의 댓글/답글 영역 (2026-05-28 분리 root).
 *
 * 옛 src/components/CommentsBlock.tsx (863 줄) 을 src/components/comments/ 폴더로 분해:
 *   - CommentForm.tsx (입력 폼)
 *   - CommentItem.tsx (댓글 1개)
 *   - CommentsBlock.tsx (root — 본 파일, 데이터 fetch + state + 폼 조율)
 *   - 공유 타입은 lib/types/comment.ts (CommentAuthor, CommentRow, CommentWithReplies, CommentViewer)
 *
 * 옛 위치의 components/CommentsBlock.tsx 는 호환성 위해 본 파일을 re-export 만.
 *
 * 사양 (옛 코드 그대로):
 *   - 미리보기 모드: 최신 root 댓글 3개만 표시
 *   - 펼친 모드 (showInput=true): 전체 root + 각 답글
 *   - 작성자 본인 / 해당 글 원장님 / 관리자에게는 가림(hidden) 댓글도 회색으로 표시
 *   - 1단계 답글까지만 (답글에는 [답글] 버튼 없음)
 *   - RLS 가 권한을 강제. UI 는 표시 여부와 액션 버튼 노출만 담당.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveIdentityId } from "@/lib/active-identity";
import { ROLES } from "@/lib/identity-shared";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { showToast } from "@/lib/toast";
import { getDoctorIdForProfile } from "@/lib/doctor-mapping";
import type {
  CommentStatus,
  CommentViewer,
  CommentWithReplies,
} from "@/lib/types/comment";
import CommentItem from "./CommentItem";
import CommentForm from "./CommentForm";

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
  const [me, setMe] = useState<CommentViewer>(null);
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
