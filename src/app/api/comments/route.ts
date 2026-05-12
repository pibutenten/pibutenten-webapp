/**
 * /api/comments
 *
 *  GET  ?qaId=N&offset=0&limit=20  → root 댓글 + 각 root의 답글들 (트리)
 *  POST { qaId, parentId?, body }  → 새 댓글/답글 작성 (인증 필수)
 *
 * RLS가 권한을 강제. 여기서는 입력 검증과 응답 정형화만.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

export type CommentRow = {
  id: number;
  qa_id: number;
  author_id: string | null;
  parent_id: number | null;
  body: string;
  status: "visible" | "hidden" | "deleted";
  like_count: number;
  created_at: string;
  updated_at: string;
  posted_as?: "official" | "personal";
  /** v4 — viewer가 이 댓글에 좋아요 표시했는지 (server prefetch). */
  viewer_liked?: boolean;
  author: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    alt_display_name: string | null;
    alt_avatar_url: string | null;
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
  const qaIdRaw = url.searchParams.get("qaId");
  if (!qaIdRaw) {
    return NextResponse.json({ error: "qaId is required" }, { status: 400 });
  }
  const qaId = parseInt(qaIdRaw, 10);
  if (!Number.isFinite(qaId) || qaId <= 0) {
    return NextResponse.json({ error: "invalid qaId" }, { status: 400 });
  }
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));

  const supabase = await createSupabaseServerClient();

  // 1) root 댓글 (parent_id is null) — 페이지네이션 + 최신순
  const rootRes = await supabase
    .from("comments")
    .select("*")
    .eq("qa_id", qaId)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (rootRes.error) {
    return NextResponse.json({ error: rootRes.error.message }, { status: 500 });
  }

  const rootRows = (rootRes.data ?? []) as Omit<CommentRow, "author">[];
  const rootIds = rootRows.map((r) => r.id);

  // 2) 답글 (parent_id ∈ rootIds) — 오래된 순 (대화 흐름)
  let replyRows: Omit<CommentRow, "author">[] = [];
  if (rootIds.length > 0) {
    const replyRes = await supabase
      .from("comments")
      .select("*")
      .eq("qa_id", qaId)
      .in("parent_id", rootIds)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (replyRes.error) {
      return NextResponse.json({ error: replyRes.error.message }, { status: 500 });
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
    alt_display_name: string | null;
    alt_avatar_url: string | null;
    role: "admin" | "doctor" | "user";
  };
  type DoctorAcctRow = { profile_id: string; doctor_id: string };

  let profilesById = new Map<string, ProfileRow>();
  let doctorByProfile = new Map<string, string>();
  // identity_id → {display_name, avatar_url} (멀티 ID 분리 표시용)
  const identityById = new Map<string, { display_name: string | null; avatar_url: string | null }>();

  if (authorIds.length > 0) {
    const identityIds = Array.from(
      new Set(
        [...rootRows, ...replyRows]
          .map((r) => (r as { identity_id?: string | null }).identity_id)
          .filter((v): v is string => !!v),
      ),
    );
    const [profRes, docRes, idRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url, alt_display_name, alt_avatar_url, role")
        .in("id", authorIds),
      supabase
        .from("doctor_accounts")
        .select("profile_id, doctor_id")
        .in("profile_id", authorIds),
      identityIds.length > 0
        ? supabase
            .from("profile_identities")
            .select("id, display_name, avatar_url")
            .in("id", identityIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profRes.error) {
      profilesById = new Map();
    } else {
      profilesById = new Map(
        ((profRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
      );
    }
    if (!docRes.error && docRes.data) {
      doctorByProfile = new Map(
        (docRes.data as DoctorAcctRow[]).map((d) => [d.profile_id, d.doctor_id]),
      );
    }
    if (!idRes.error && idRes.data) {
      for (const row of idRes.data as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
        identityById.set(row.id, { display_name: row.display_name, avatar_url: row.avatar_url });
      }
    }
  }

  function attachAuthor(r: Omit<CommentRow, "author">): CommentRow {
    if (!r.author_id) return { ...r, author: null };
    const p = profilesById.get(r.author_id);
    // 멀티 ID: comments.identity_id 있으면 그 identity의 display_name/avatar 우선
    const idId = (r as { identity_id?: string | null }).identity_id;
    const ident = idId ? identityById.get(idId) : null;
    return {
      ...r,
      author: p
        ? {
            id: p.id,
            display_name: ident?.display_name ?? p.display_name,
            avatar_url: ident?.avatar_url ?? p.avatar_url,
            // identity 있으면 personal/official 분기 무력화 — alt_*도 identity 값으로 덮어쓰기
            alt_display_name: ident?.display_name ?? p.alt_display_name,
            alt_avatar_url: ident?.avatar_url ?? p.alt_avatar_url,
            role: p.role,
            doctor_id: doctorByProfile.get(p.id) ?? null,
          }
        : {
            // RLS로 프로필 직접 조회 안 되는 경우 (대부분 일반 사용자) — 표시명 fallback
            id: r.author_id,
            display_name: null,
            avatar_url: null,
            alt_display_name: null,
            alt_avatar_url: null,
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
    .eq("qa_id", qaId)
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
  qaId?: unknown;
  parentId?: unknown;
  body?: unknown;
};

export async function POST(req: Request) {
  let raw: PostBody;
  try {
    raw = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const qaId = typeof raw.qaId === "number" ? raw.qaId : parseInt(String(raw.qaId ?? ""), 10);
  if (!Number.isFinite(qaId) || qaId <= 0) {
    return NextResponse.json({ error: "qaId is required" }, { status: 400 });
  }

  const parentId =
    raw.parentId == null || raw.parentId === ""
      ? null
      : typeof raw.parentId === "number"
        ? raw.parentId
        : parseInt(String(raw.parentId), 10);
  if (parentId !== null && (!Number.isFinite(parentId) || parentId <= 0)) {
    return NextResponse.json({ error: "invalid parentId" }, { status: 400 });
  }

  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (body.length > 2000) {
    return NextResponse.json({ error: "댓글은 2000자 이내로 작성해주세요." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 페르소나 컨텍스트 — 댓글도 현재 페르소나로 마킹
  const { readPersonaServer } = await import("@/lib/persona-server");
  const currentPersona = await readPersonaServer();

  // v5.1 옵션 X: 활성 identity_id도 함께 저장 (멀티 ID 카운팅·표시 정확화)
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const identityCookie = cookieStore.get("pibutenten:identity")?.value;
  const identityId =
    identityCookie &&
    identityCookie !== "primary" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identityCookie)
      ? identityCookie
      : null;

  const ins = await supabase
    .from("comments")
    .insert({
      qa_id: qaId,
      parent_id: parentId,
      body,
      author_id: user.id,
      posted_as: currentPersona,
      identity_id: identityId,
    })
    .select("*")
    .single();

  if (ins.error) {
    return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }

  return NextResponse.json({ comment: ins.data }, { status: 201 });
}
