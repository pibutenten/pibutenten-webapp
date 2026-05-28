/**
 * /api/comments
 *
 *  GET  ?cardId=N&offset=0&limit=20  → root 댓글 + 각 root의 답글들 (트리)
 *  POST { cardId, parentId?, body }  → 새 댓글/답글 작성 (인증 필수)
 *
 * RLS가 권한을 강제. 여기서는 입력 검증과 응답 정형화만.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentityContext } from "@/lib/identity";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";
import { logAudit } from "@/lib/audit-log";
import {
  CommentCreateSchema,
  CommentGetQuerySchema,
} from "@/lib/schema/api/comments";
import { screenContent } from "@/lib/content-screening";
// 2026-05-28: 댓글 도메인 타입 SSOT (lib/types/comment.ts). CommentsBlock 과 공유.
import type { CommentRow, CommentWithReplies } from "@/lib/types/comment";

export const dynamic = "force-dynamic";

// 옛 in-file 정의 폐기 → re-export 만 유지 (외부 호출자가 본 모듈에서 import 하던 호환성).
export type { CommentRow, CommentWithReplies };

// ─────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  // 2026-05-28: Zod 검증으로 통합 (articles 와 동일 패턴).
  //   옛 parseInt + Math.min/max 다중 분기 → CommentGetQuerySchema 단일 출처.
  const url = new URL(req.url);
  const parsed = CommentGetQuerySchema.safeParse({
    cardId: url.searchParams.get("cardId"),
    offset: url.searchParams.get("offset") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      null,
      "invalid_input",
      "[comments GET] schema",
      400,
      undefined,
      {
        userMessage: "잘못된 요청 파라미터입니다.",
        devOnly: {
          issues: parsed.error.issues.slice(0, 5).map((iss) => ({
            path: iss.path.join("."),
            code: iss.code,
          })),
        },
      },
    );
  }
  const { cardId, offset, limit } = parsed.data;

  const supabase = await createSupabaseServerClient();

  // 1) root 댓글 (parent_id is null) — 페이지네이션.
  // 정렬: 좋아요 많은 순(인기) → 최신순 → id 내림차순(tie-break).
  // (이전 단순 최신순 → 좋아요 많은 댓글이 묻히는 문제, 260518 fix)
  const rootRes = await supabase
    .from("comments")
    .select("*")
    .eq("card_id", cardId)
    .is("parent_id", null)
    .order("like_count", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (rootRes.error) {
    return errorResponse(rootRes.error, "generic", "[comments GET] root", 500);
  }

  const rootRows = (rootRes.data ?? []) as Omit<CommentRow, "author">[];
  const rootIds = rootRows.map((r) => r.id);

  // 2) 답글 (parent_id ∈ rootIds) — 오래된 순 (대화 흐름)
  let replyRows: Omit<CommentRow, "author">[] = [];
  if (rootIds.length > 0) {
    const replyRes = await supabase
      .from("comments")
      .select("*")
      .eq("card_id", cardId)
      .in("parent_id", rootIds)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (replyRes.error) {
      return errorResponse(replyRes.error, "generic", "[comments GET] reply", 500);
    }
    replyRows = (replyRes.data ?? []) as Omit<CommentRow, "author">[];
  }

  // 3) 작성자 프로필 — author_id 별 1회 조회
  const authorIds = Array.from(
    new Set(
      [...rootRows, ...replyRows]
        .map((r) => r.author_id)
        .filter((v): v is string => !!v),
    ),
  );

  type ProfileRow = {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    handle: string | null;
    role: "admin" | "doctor" | "user";
  };

  let profilesById = new Map<string, ProfileRow & { doctor_photo_url?: string | null }>();
  const doctorByProfile = new Map<string, string>();

  if (authorIds.length > 0) {
    // Phase 9: profile_identities 폐기. comments.author_id로 직접 profiles 조회.
    // 의사 매핑은 SSOT (profiles.doctor_id) 기준 헬퍼로 조회.
    const [profRes, doctorMetaMap] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url, handle, role")
        .in("id", authorIds),
      getDoctorMetaBatch(supabase, authorIds),
    ]);
    if (!profRes.error && profRes.data) {
      profilesById = new Map(
        ((profRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
      );
    }
    for (const [pid, meta] of doctorMetaMap) {
      doctorByProfile.set(pid, meta.doctorId);
      if (meta.slug) {
        const photo = meta.photoUrl ?? `/doctors/${meta.slug}.png`;
        const existing = profilesById.get(pid);
        if (existing) {
          profilesById.set(pid, { ...existing, doctor_photo_url: photo });
        }
      }
    }
  }

  function attachAuthor(r: Omit<CommentRow, "author">): CommentRow {
    if (!r.author_id) return { ...r, author: null };
    const p = profilesById.get(r.author_id);
    return {
      ...r,
      author: p
        ? {
            id: p.id,
            display_name: p.display_name,
            // doctor 매핑 row면 doctors.photo_url 우선 (single source)
            avatar_url: p.doctor_photo_url ?? p.avatar_url,
            handle: p.handle,
            role: p.role,
            doctor_id: doctorByProfile.get(p.id) ?? null,
          }
        : {
            id: r.author_id,
            display_name: null,
            avatar_url: null,
            handle: null,
            role: "user",
            doctor_id: null,
          },
    };
  }

  // 4) viewer가 좋아요 누른 댓글 id set (server prefetch — 토글 즉시 반응)
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const allCommentIds = [...rootRows, ...replyRows].map((r) => r.id);
  let likedSet = new Set<number>();
  if (viewer && allCommentIds.length > 0) {
    const { data: likedRows } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("user_id", viewer.id)
      .in("comment_id", allCommentIds);
    likedSet = new Set(
      (likedRows ?? []).map((r) => (r as { comment_id: number }).comment_id),
    );
  }

  function attachAuthorAndLike(r: Omit<CommentRow, "author">): CommentRow {
    const withAuthor = attachAuthor(r);
    return { ...withAuthor, viewer_liked: likedSet.has(r.id) };
  }

  // 5) 트리 조립
  const repliesByParent = new Map<number, CommentRow[]>();
  for (const r of replyRows) {
    const withAuthor = attachAuthorAndLike(r);
    if (r.parent_id == null) continue;
    const arr = repliesByParent.get(r.parent_id) ?? [];
    arr.push(withAuthor);
    repliesByParent.set(r.parent_id, arr);
  }

  const comments: CommentWithReplies[] = rootRows.map((r) => ({
    ...attachAuthorAndLike(r),
    replies: repliesByParent.get(r.id) ?? [],
  }));

  // 6) 전체 root 댓글 수 (페이지네이션 / 더 보기 버튼 표시용)
  const totalRes = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("card_id", cardId)
    .is("parent_id", null);

  return NextResponse.json(
    {
      comments,
      total_root: totalRes.count ?? comments.length,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

// ─────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // 2026-05-28: Zod 검증으로 통합 (articles 와 동일 패턴).
  //   옛 typeof + parseInt + trim + length 다중 분기 → CommentCreateSchema 단일 출처.
  //   parentId null/undefined 모두 root 댓글로 처리, body 는 schema 의 transform 으로 trim.
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch (e) {
    return errorResponse(
      e,
      "invalid_input",
      "[comments POST] body parse",
      400,
      undefined,
      { userMessage: "잘못된 요청 형식" },
    );
  }

  const parsed = CommentCreateSchema.safeParse(rawJson);
  if (!parsed.success) {
    // schema 내 메시지 (예: "댓글 내용을 입력해 주세요." / "댓글은 2000자 이내로...") 를
    // 첫 issue 의 message 로 사용자에게 그대로 노출. 옛 분기 별 메시지와 의미 일치.
    const firstMsg = parsed.error.issues[0]?.message;
    return errorResponse(
      null,
      "invalid_input",
      "[comments POST] schema",
      400,
      undefined,
      {
        userMessage: firstMsg ?? "유효하지 않은 입력입니다.",
        devOnly: {
          issues: parsed.error.issues.slice(0, 5).map((iss) => ({
            path: iss.path.join("."),
            code: iss.code,
          })),
        },
      },
    );
  }
  const { cardId, body } = parsed.data;
  // parentId 미전송 / null 둘 다 root 댓글 — DB insert 시 null 통일.
  const parentId = parsed.data.parentId ?? null;

  const supabase = await createSupabaseServerClient();
  const idCtx = await getIdentityContext(supabase);
  if (!idCtx?.active) {
    return errorResponse(null, "unauthorized", "[comments POST] auth required", 401);
  }

  // Rate limit (A8): 사용자당 분당 10회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "comments-post",
    userId: idCtx.user.id,
    max: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 콘텐츠 자동검수 (2026-05-28, 카드 패턴 미러링): active 신분이 USER 면 의료법/약사법/환자후기
  // 의심 패턴 검사. 임계 5 초과 시 status='hidden' + screening_flags 저장 (카드의 pending_review
  // 와 대응 — comments enum 에 pending_review 가 없어 hidden 선택. ADR 0007 정합).
  // 의사·관리자(active) 는 screenContent 안에서 자동 통과.
  const activeRole = (idCtx.active.role ?? "user") as "admin" | "doctor" | "user";
  const verdict = screenContent({
    title: null,
    body,
    keywords: null,
    externalUrl: null,
    authorRole: activeRole,
  });
  const insertRow: Record<string, unknown> = {
    card_id: cardId,
    parent_id: parentId,
    body,
    author_id: idCtx.active.profileId,
  };
  if (verdict.flagged) {
    insertRow.status = "hidden";
    insertRow.screening_flags = verdict.reasons;
  }

  // Phase 9: author_id에 **active identity의 profile.id** 저장.
  //   cookie 'pibutenten:identity'가 UUID면 그 profile, 'primary'면 base profile.
  //   getIdentityContext가 묶음 검증(auth_user_id 매칭) 후 idCtx.active.profileId 반환.
  //   좋아요·저장과 동일한 ID 정책 — 묶음 내 ID 전환 시 댓글도 그 ID로 기록됨.
  const ins = await supabase
    .from("comments")
    .insert(insertRow)
    .select("*")
    .single();

  if (ins.error) {
    return errorResponse(ins.error, "save_failed", "[comments POST]", 400);
  }

  // P1-⑤ (2026-05-28): 검수에 의해 hidden 처리된 댓글은 audit 적재.
  // PIPA 안전성 확보조치 §8 — 콘텐츠 자동 차단 추적.
  if (verdict.flagged) {
    await logAudit({
      action: "comment.screening_hide",
      actorProfileId: idCtx.active.profileId,
      actorAuthUserId: idCtx.user.id,
      targetTable: "comments",
      targetId: ins.data?.id ?? null,
      request: req,
      metadata: {
        cardId,
        parentId,
        reasons: verdict.reasons,
      },
    });
  }

  // 검수에 걸려 hidden 처리되었으면 사용자에게 명시 — silent fail 방지.
  // 댓글 자체는 저장되어 admin 검토 큐로 가지만 화면에는 안 보임. 회원이 인지하고
  // 표현 수정해 다시 시도하거나 admin 검토 결과 기다릴 수 있도록.
  return NextResponse.json(
    {
      comment: ins.data,
      screening: verdict.flagged
        ? {
            status: "hidden",
            reasons: verdict.reasons,
            userMessage:
              "댓글이 자동 검수에서 의료광고·환자후기 등 의심 표현으로 감지되어 보류되었습니다. 운영자가 검토 후 게시 여부를 결정합니다.",
          }
        : null,
    },
    { status: 201 },
  );
}
