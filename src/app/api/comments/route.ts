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

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

export type CommentRow = {
  id: number;
  card_id: number;
  author_id: string | null;
  parent_id: number | null;
  body: string;
  status: "visible" | "hidden" | "deleted";
  like_count: number;
  created_at: string;
  updated_at: string;
  /** v4 — viewer가 이 댓글에 좋아요 표시했는지 (server prefetch). */
  viewer_liked?: boolean;
  author: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    handle: string | null;
    role: "admin" | "doctor" | "user";
    doctor_id: string | null;
  } | null;
};

export type CommentWithReplies = CommentRow & {
  replies: CommentRow[];
};

// ─────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cardIdRaw = url.searchParams.get("cardId");
  if (!cardIdRaw) {
    return errorResponse(null, "invalid_input", "[comments GET] cardId missing", 400, undefined, {
      userMessage: "cardId 가 필요합니다.",
    });
  }
  const cardId = parseInt(cardIdRaw, 10);
  if (!Number.isFinite(cardId) || cardId <= 0) {
    return errorResponse(null, "invalid_input", "[comments GET] invalid cardId", 400, undefined, {
      userMessage: "유효하지 않은 cardId 입니다.",
    });
  }
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));

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
type PostBody = {
  cardId?: unknown;
  parentId?: unknown;
  body?: unknown;
};

export async function POST(req: Request) {
  let raw: PostBody;
  try {
    raw = (await req.json()) as PostBody;
  } catch (e) {
    return errorResponse(e, "invalid_input", "[comments POST] body parse", 400, undefined, {
      userMessage: "잘못된 요청 형식",
    });
  }

  const cardId = typeof raw.cardId === "number" ? raw.cardId : parseInt(String(raw.cardId ?? ""), 10);
  if (!Number.isFinite(cardId) || cardId <= 0) {
    return errorResponse(null, "invalid_input", "[comments POST] cardId missing", 400, undefined, {
      userMessage: "cardId 가 필요합니다.",
    });
  }

  const parentId =
    raw.parentId == null || raw.parentId === ""
      ? null
      : typeof raw.parentId === "number"
        ? raw.parentId
        : parseInt(String(raw.parentId), 10);
  if (parentId !== null && (!Number.isFinite(parentId) || parentId <= 0)) {
    return errorResponse(null, "invalid_input", "[comments POST] invalid parentId", 400, undefined, {
      userMessage: "유효하지 않은 parentId 입니다.",
    });
  }

  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) {
    return errorResponse(null, "invalid_input", "[comments POST] empty body", 400, undefined, {
      userMessage: "댓글 내용을 입력해 주세요.",
    });
  }
  if (body.length > 2000) {
    return errorResponse(null, "invalid_input", "[comments POST] body too long", 400, undefined, {
      userMessage: "댓글은 2000자 이내로 작성해주세요.",
    });
  }

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

  // Phase 9: author_id에 **active identity의 profile.id** 저장.
  //   cookie 'pibutenten:identity'가 UUID면 그 profile, 'primary'면 base profile.
  //   getIdentityContext가 묶음 검증(auth_user_id 매칭) 후 idCtx.active.profileId 반환.
  //   좋아요·저장과 동일한 ID 정책 — 묶음 내 ID 전환 시 댓글도 그 ID로 기록됨.
  const ins = await supabase
    .from("comments")
    .insert({
      card_id: cardId,
      parent_id: parentId,
      body,
      author_id: idCtx.active.profileId,
    })
    .select("*")
    .single();

  if (ins.error) {
    return errorResponse(ins.error, "save_failed", "[comments POST]", 400);
  }

  return NextResponse.json({ comment: ins.data }, { status: 201 });
}
