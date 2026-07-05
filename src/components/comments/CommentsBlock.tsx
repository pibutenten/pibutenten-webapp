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
import { ROLES } from "@/lib/identity-shared";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoginPromptDialog from "@/components/LoginPromptDialog";
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";
import { useSession } from "@/lib/session-context";
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
  /** P1-③ (2026-05-29): 카드의 doctor.id. me.doctor_id 와 매칭되면 숨김 댓글 본문 검토 가능. */
  cardDoctorId?: string | null;
  /** 발행되지 않은 글이면 댓글 폼 숨김 */
  isPublishedQa: boolean;
  /** 댓글 수 변경 알림 (부모 카드의 카운트 갱신용) */
  onCountChange?: (next: number) => void;
  /** 입력 폼 표시 여부 — 부모가 펼침 상태 기준으로 결정 */
  showInput?: boolean;
  /** 피드 배치 미리보기 seed — 제공되면 미리보기 모드에서 자체 fetch 안 함(N+1 제거).
   *  undefined = seed 없음(상세 등) → 기존처럼 마운트 시 전체 fetch. */
  initialComments?: CommentWithReplies[];
  /** seed 의 총 visible 댓글 수(top3 만으론 알 수 없는 실제 카운트). 미리보기 배지용. */
  initialTotal?: number;
  /** true면 입력 폼 자동 포커스 안 함 (단독 URL 자동 펼침 시 모바일 키보드 방지) */
  disableAutoFocus?: boolean;
  /** 미리보기 모드에서 "댓글 N개 모두 보기" 줄 클릭 시 부모(PostCard)가 펼침(showInput=true 로
   *  전환)을 수행하도록 위임. 미제공 시 줄 미표시(구형 호출자 호환). */
  onExpandRequest?: () => void;
};

export default function CommentsBlock({
  cardId,
  cardDoctorId,
  isPublishedQa,
  onCountChange,
  showInput = false,
  disableAutoFocus = false,
  initialComments,
  initialTotal,
  onExpandRequest,
}: Props) {
  // 피드 배치 미리보기 seed 가 있으면 그것으로 시작(자체 fetch 0). 없으면 빈 + 로딩.
  const [comments, setComments] = useState<CommentWithReplies[]>(initialComments ?? []);
  const [loading, setLoading] = useState(initialComments === undefined);
  // 전체(상세/펼침) 로드를 한 번이라도 했는지 — seed 미리보기와 구분.
  const [fullLoaded, setFullLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 현재 로그인 사용자(viewer) — SessionContext 단일 출처 (R4-2, 2026-07-04).
  //   옛: 카드 인스턴스마다 useEffect 에서 supabase.auth.getUser()(네트워크) + profiles SELECT
  //       + doctor 매핑 SELECT → 피드 20카드 = 60호출 (N+1).
  //   새: SessionProvider(앱 루트, /api/session 1회)의 SessionInfo 파생 — 인스턴스당 추가 호출 0.
  //       useCardViewer 와 동일 패턴 (ADR 0012: me.id/role/doctor_id 모두 active 명함 단일 기준).
  //   보안:
  //     ① 묶음 검증(활성 identity 가 본인 묶음 소속인지 — 위조 cookie 차단)은 서버
  //        getSessionInfo() 가 auth.getUser() + 묶음 rows 대조로 동등 수행. 클라 자체 검증
  //        제거로 소실되지 않으며, 판정 근거가 위조 가능한 mirror cookie → 서버 httpOnly
  //        cookie 로 옮겨져 오히려 강화.
  //     ② 권한 진실원은 서버 RLS + resolveActiveIdentity (comments API 가 매 요청 재검증).
  //        여기의 me 는 수정/삭제/숨김 버튼 노출·숨김 본문 열람 등 표시 보조 전용 —
  //        위조돼도 서버가 거부.
  const session = useSession();
  const me: CommentViewer =
    session === null
      ? null
      : {
          id: session.activeIdentityId,
          role: session.role,
          doctor_id: session.doctorId,
        };
  // meLoaded 등가물 — SSR/첫 페인트에는 로그인 분기(입력 폼 vs '로그인하고 댓글 남기기')를
  // 렌더하지 않아 로그인 사용자에게 로그인 버튼이 깜빡이는 것 방지(옛 meLoaded 와 동일 목적).
  // SessionProvider 의 동기 쿠키 판정(setSession)과 같은 passive effect flush 에서 함께
  // 반영되므로, 쿠키가 유효한 로그인 사용자는 로그인 버튼을 한 프레임도 보지 않는다.
  const [meLoaded, setMeLoaded] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe mount 플래그(1회) — session-context.tsx 와 동일 패턴
  useEffect(() => setMeLoaded(true), []);

  // 댓글 입력 placeholder — 로그인 시 본인 닉네임, 비로그인은 기본('텐즈').
  const composerPlaceholder = session?.displayName
    ? `${session.displayName}님의 생각을 남겨주세요`
    : "텐즈님의 생각을 남겨주세요";

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  // 비로그인 사용자가 "로그인하고 댓글 남기기" 클릭 시 모달 (이전 페이지 이동 → 모달)
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  // 삭제 확인 다이얼로그 대상 댓글 ID (null이면 닫힘)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

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
        | { error?: string; message?: string };
      // B-3 (2026-05-29 / P1-F): r.ok 우선 분기 (in 검사는 optional key 라 narrow 약함).
      //   서버 message (한글) 우선, error (kind enum) 는 fallback.
      if (!r.ok) {
        setError(pickErrorMessage(j as { error?: string; message?: string }, r.status));
        setComments([]);
      } else if ("comments" in j) {
        setComments(j.comments);
      } else {
        setError(pickErrorMessage(j as { error?: string; message?: string }, r.status));
        setComments([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setFullLoaded(true);
    }
  }, [cardId]);

  // 전체 댓글 로드 조건: 펼침(showInput) 또는 seed 없음(상세 등). seed 있는 미리보기 모드면 fetch 안 함.
  //   → 피드 스크롤 중 카드별 fetch(N+1) 제거. 💬 클릭(showInput=true) 시에만 전체 로드.
  useEffect(() => {
    const needFull = showInput || initialComments === undefined;
    if (needFull && !fullLoaded) void reload();
  }, [showInput, initialComments, fullLoaded, reload]);

  const isLoggedIn = !!me;
  const isAdmin = me?.role === ROLES.ADMIN;
  // qa의 doctor 본인 여부는 댓글의 권한과는 별개 (서버 RLS가 진실원). UI는 me.doctor_id로 표시 보조.

  // ── 표시할 댓글:
  //   - showInput=false (카드 상단 💬 아이콘 미클릭) → 프리뷰 3개
  //   - showInput=true  (💬 클릭으로 입력창 열림)   → 전체 펼침
  //   "댓글 N개 모두 보기" 줄은 2026-07-04 원장 요청으로 복원 — 펼침 진입점 2개
  //   (카드 상단 💬 토글 + 미리보기 하단 모두 보기 줄, 후자는 onExpandRequest 위임).
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
  //   전체 로드 전(미리보기 seed)에는 seed 의 실제 총수(initialTotal)를 쓴다 — seed 는 top3 만이라
  //   visibleCount(≤3)로는 배지가 틀어진다. 전체 로드 후엔 실제 visibleCount(작성·삭제 즉시 반영).
  useEffect(() => {
    const count = fullLoaded ? visibleCount : (initialTotal ?? 0);
    onCountChange?.(count);
  }, [fullLoaded, visibleCount, initialTotal, onCountChange]);

  // ── "댓글 N개 모두 보기" 줄(2026-07-04 복원)용 카운트.
  //   totalCount: onCountChange effect 와 동일 규칙 — seed 미리보기는 initialTotal, 전체 로드 후 visibleCount.
  //   hiddenCount: 총수 - 미리보기에 실제 보이는 수(visible root 3개 + 그 답글). 0 이면 줄 미표시.
  const totalCount = fullLoaded ? visibleCount : (initialTotal ?? 0);
  const hiddenCount = useMemo(() => {
    let shown = 0;
    for (const r of visibleRoots) {
      if (r.status === "visible") shown += 1;
      for (const rep of r.replies) {
        if (rep.status === "visible") shown += 1;
      }
    }
    return Math.max(0, totalCount - shown);
  }, [visibleRoots, totalCount]);

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
      const j = (await r.json()) as {
        error?: string;
        message?: string;
        // 병원·의사명이 자동 마스킹됐는지 — 성공 응답에만 존재(후기 라우트와 동일 키).
        blinded?: boolean;
        screening?: {
          status: string;
          reasons: string[];
          userMessage: string;
        } | null;
      };
      if (!r.ok) {
        // B-3 (2026-05-29 / P1-F): message (한글) 우선, error (kind enum) 는 fallback.
        showToast(pickErrorMessage(j, r.status) || "댓글 작성 실패", {
          tone: "danger",
        });
        return;
      }
      // 자동검수에 걸려 hidden 처리되었으면 작성자에게 1회 안내 (silent fail 방지).
      // 문구는 lib/safety 흐름과 분리 — 검수 사유 안내용.
      if (j.screening) {
        showToast(
          "광고성·대가성 후기나 효과를 단정·보장하는 표현은 의료법에 따라 게시가 제한될 수 있어요. 댓글이 검토 대기로 전환되었습니다.",
          { tone: "danger" },
        );
      }
      // 병원·의사명이 자동으로 가려졌으면 1회 안내 (후기 작성과 동일 문구).
      if (j.blinded === true) {
        showToast("병원·의사명으로 보이는 표현이 자동으로 가려졌습니다.", {
          durationMs: 4500,
        });
      }
      setBody("");
      setReplyTarget(null);
      await reload();
    } catch {
      // R2-3 (2026-07-04): 네트워크 예외(오프라인·요청 중단 등) — 종전엔 catch 가 없어
      // unhandled rejection + 무피드백. 입력 내용(body)은 성공 경로에서만 비우므로 보존됨.
      showToast("댓글 등록에 실패했어요. 네트워크를 확인해 주세요.", {
        tone: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function patchComment(
    id: number,
    patch: { body?: string; status?: CommentStatus },
  ) {
    try {
      const r = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await r.json()) as {
        error?: string;
        message?: string;
        // 병원·의사명 자동 마스킹 여부 — 성공 응답에만 존재(작성 POST 와 동일 키).
        blinded?: boolean;
        screening?: { status: string; reasons: string[] } | null;
      };
      if (!r.ok) {
        // B-3 (2026-05-29 / P1-F): message 우선 + fallback "수정 실패".
        showToast(pickErrorMessage(j, r.status) || "수정 실패", {
          tone: "danger",
        });
        return false;
      }
      // 수정이 검수에 걸려 hidden 처리됐으면 1회 안내(작성과 동일).
      if (j.screening) {
        showToast(
          "광고성·대가성 후기나 효과를 단정·보장하는 표현은 의료법에 따라 게시가 제한될 수 있어요. 댓글이 검토 대기로 전환되었습니다.",
          { tone: "danger" },
        );
      }
      // 병원·의사명이 자동으로 가려졌으면 1회 안내(작성과 동일 문구).
      if (j.blinded === true) {
        showToast("병원·의사명으로 보이는 표현이 자동으로 가려졌습니다.", {
          durationMs: 4500,
        });
      }
      await reload();
      return true;
    } catch {
      // R2-3 (2026-07-04): 네트워크 예외 — false 반환으로 수정 폼(입력 내용) 유지.
      showToast("댓글 수정에 실패했어요. 네트워크를 확인해 주세요.", {
        tone: "danger",
      });
      return false;
    }
  }

  function deleteComment(id: number) {
    setDeleteTarget(id);
  }

  async function executeDelete(id: number) {
    try {
      const r = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      const j = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) {
        // B-3 (2026-05-29 / P1-F): message 우선 + fallback "삭제 실패".
        showToast(pickErrorMessage(j, r.status) || "삭제 실패", {
          tone: "danger",
        });
        return;
      }
      await reload();
    } catch {
      // R2-3 (2026-07-04): 네트워크 예외 — reload() 미호출로 목록 상태 불변(댓글 유지).
      showToast("댓글 삭제에 실패했어요. 네트워크를 확인해 주세요.", {
        tone: "danger",
      });
    }
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
        (hasComments ? "mt-3 pt-2.5" : "mt-1.5 pt-1.5")
      }
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
              cardDoctorId={cardDoctorId ?? null}
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
                      cardDoctorId={cardDoctorId ?? null}
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

      {/* "댓글 N개 모두 보기" 줄 (2026-07-04 원장 요청 복원) — 인스타그램 표준.
          미리보기 모드에서 아직 안 보이는 댓글이 있고, 부모가 펼침 위임(onExpandRequest)을
          제공할 때만 표시. 클릭 시 부모가 showInput=true 로 전환(💬 토글과 달리 펼침 고정). */}
      {!showInput && onExpandRequest && hiddenCount > 0 && (
        <button
          type="button"
          aria-label={`댓글 ${totalCount}개 모두 보기`}
          className="mt-1.5 block w-full py-1 text-left text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          onClick={(e) => {
            e.stopPropagation();
            onExpandRequest();
          }}
        >
          댓글 {totalCount}개 모두 보기
        </button>
      )}

      {/* root 댓글 입력 폼 — showInput 시에만 노출, meLoaded 후에만 분기 (깜빡임 방지) */}
      {showInput && isPublishedQa && meLoaded && isLoggedIn && replyTarget == null && (
        <div className="mt-3">
          <CommentForm
            body={body}
            onChange={setBody}
            onSubmit={() => submitComment(null)}
            submitting={submitting}
            placeholder={composerPlaceholder}
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
      <ConfirmDialog
        open={deleteTarget !== null}
        title="댓글 삭제"
        description="정말 삭제할까요? 답글도 함께 삭제됩니다."
        confirmLabel="삭제"
        tone="danger"
        onConfirm={() => {
          if (deleteTarget !== null) {
            void executeDelete(deleteTarget);
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
