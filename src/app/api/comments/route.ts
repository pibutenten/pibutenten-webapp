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
  const cardIdRaw = url.searchParams.get("cardId");
  if (!cardIdRaw) {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
  }
  const cardId = parseInt(cardIdRaw, 10);
  if (!Number.isFinite(cardId) || cardId <= 0) {
    return NextResponse.json({ error: "invalid cardId" }, { status: 400 });
  }
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));

  const supabase = await createSupabaseServerClient();

  // 1) root 댓글 (parent_id is null) — 페이지네이션 + 최신순
  const rootRes = await supabase
    .from("comments")
    .select("*")
    .eq("card_id", cardId)
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
      .eq("card_id", cardId)
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

  let profilesById = new Map<string, ProfileRow & { doctor_photo_url?: string | null }>();
  let doctorByProfile = new Map<string, string>();

  if (authorIds.length > 0) {
    // Phase 9: profile_identities 폐기. comments.author_id로 직접 profiles 조회.
    const [profRes, docRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url, alt_display_name, alt_avatar_url, role")
        .in("id", authorIds),
      supabase
        .from("doctor_accounts")
        .select("profile_id, doctor_id, doctor:doctors(slug, photo_url)")
        .in("profile_id", authorIds),
    ]);
    if (!profRes.error && profRes.data) {
      profilesById = new Map(
        ((profRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
      );
    }
    if (!docRes.error && docRes.data) {
      type DAR = {
        profile_id: string;
        doctor_id: string;
        doctor: { slug: string; photo_url: string | null } | { slug: string; photo_url: string | null }[] | null;
      };
      for (const da of docRes.data as DAR[]) {
        doctorByProfile.set(da.profile_id, da.doctor_id);
        const d = Array.isArray(da.doctor) ? da.doctor[0] : da.doctor;
        if (d) {
          const photo = d.photo_url ?? `/doctors/${d.slug}.png`;
          const existing = profilesById.get(da.profile_id);
          if (existing) {
            profilesById.set(da.profile_id, { ...existing, doctor_photo_url: photo });
          }
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
            alt_display_name: p.alt_display_name,
            alt_avatar_url: p.alt_avatar_url,
            role: p.role,
            doctor_id: doctorByProfile.get(p.id) ?? null,
          }
        : {
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
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cardId = typeof raw.cardId === "number" ? raw.cardId : parseInt(String(raw.cardId ?? ""), 10);
  if (!Number.isFinite(cardId) || cardId <= 0) {
    return NextResponse.json({ error: "cardId is required" }, { status: 400 });
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

  // Phase 9: identity_id 컬럼 폐기 — author_id (auth.users.id) + posted_as 로 충분
  const ins = await supabase
    .from("comments")
    .insert({
      card_id: cardId,
      parent_id: parentId,
      body,
      author_id: user.id,
      posted_as: currentPersona,
    })
    .select("*")
    .single();

  if (ins.error) {
    return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }

  return NextResponse.json({ comment: ins.data }, { status: 201 });
}
