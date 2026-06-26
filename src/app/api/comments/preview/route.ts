/**
 * GET /api/comments/preview?cardIds=1,2,3
 *
 * 피드 댓글 미리보기 배치 — 카드 묶음의 (미리보기 댓글 top3 + 총 visible 수)를 **한 번에** 반환.
 * 카드마다 따로 호출하던 N+1(/api/comments?cardId=)을 페이지당 1회로 대체(인스타·페북식 배치).
 *
 *   1) RPC get_cards_comment_preview_meta(0289) → 카드별 { total, top_root_ids(인기순 3개) }
 *   2) 그 root id 들의 본문·답글(visible)·작성자·viewer_liked 조립 (/api/comments GET 과 동일 패턴)
 *   응답: { previews: { [cardId]: { comments: CommentWithReplies[]; total: number } } }
 *
 * RLS 가 권한을 강제(미발행 카드·권한 밖 댓글 자동 제외). 미리보기는 공개 teaser 라 visible 만 노출 —
 *   숨김/삭제 댓글은 사용자가 💬 클릭해 전체(/api/comments)를 열 때만(본인·관리자에게 회색) 보인다.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/error-response";
import { getDoctorMetaBatch } from "@/lib/doctor-mapping";
import { readTargetProfileId } from "@/lib/identity-server";
import type { CommentRow, CommentWithReplies } from "@/lib/types/comment";

export const dynamic = "force-dynamic";

/** 한 번에 미리보기 받을 카드 수 상한(피드 한 페이지 ~20장 + 여유). */
const MAX_CARDS = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("cardIds") ?? "";
    const cardIds = Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ).slice(0, MAX_CARDS);

    if (cardIds.length === 0) {
      return NextResponse.json(
        { previews: {} },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const supabase = await createSupabaseServerClient();

    // 1) 카드별 메타(total + 인기순 top3 root id) — 단일 RPC
    const metaRes = await supabase.rpc("get_cards_comment_preview_meta", {
      p_card_ids: cardIds,
    });
    if (metaRes.error) {
      return errorResponse(metaRes.error, "generic", "[comments preview] meta", 500);
    }
    const meta = (metaRes.data ?? []) as {
      card_id: number;
      total: number;
      top_root_ids: number[] | null;
    }[];

    const rootIds = meta.flatMap((m) => m.top_root_ids ?? []);

    // 미리보기 댓글이 0건이면(전부 댓글 없음) total 만 채워 조기 반환.
    if (rootIds.length === 0) {
      const previews: Record<number, { comments: CommentWithReplies[]; total: number }> = {};
      for (const m of meta) previews[m.card_id] = { comments: [], total: m.total ?? 0 };
      return NextResponse.json(
        { previews },
        { headers: { "cache-control": "no-store" } },
      );
    }

    // 2) root 본문 + 답글(visible) 조회
    const [rootRes, replyRes] = await Promise.all([
      supabase.from("comments").select("*").in("id", rootIds),
      supabase
        .from("comments")
        .select("*")
        .in("parent_id", rootIds)
        .eq("status", "visible")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    ]);
    if (rootRes.error) {
      return errorResponse(rootRes.error, "generic", "[comments preview] roots", 500);
    }
    if (replyRes.error) {
      return errorResponse(replyRes.error, "generic", "[comments preview] replies", 500);
    }
    const rootRows = (rootRes.data ?? []) as Omit<CommentRow, "author">[];
    const replyRows = (replyRes.data ?? []) as Omit<CommentRow, "author">[];

    // 3) 작성자 프로필 batch (의사 매핑 포함) — /api/comments GET 과 동일
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
      for (const [pid, m] of doctorMetaMap) {
        doctorByProfile.set(pid, m.doctorId);
        if (m.slug) {
          const photo = m.photoUrl ?? `/doctors/${m.slug}.png`;
          const existing = profilesById.get(pid);
          if (existing) profilesById.set(pid, { ...existing, doctor_photo_url: photo });
        }
      }
    }

    // 4) viewer 좋아요 prefetch (active 명함 기준 — /api/comments GET 정합)
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
    const allIds = [...rootRows, ...replyRows].map((r) => r.id);
    let likedSet = new Set<number>();
    if (viewer && allIds.length > 0) {
      const viewerProfileId = await readTargetProfileId(viewer.id);
      const { data: likedRows } = await supabase
        .from("comment_likes")
        .select("comment_id")
        .eq("profile_id", viewerProfileId)
        .in("comment_id", allIds);
      likedSet = new Set(
        (likedRows ?? []).map((r) => (r as { comment_id: number }).comment_id),
      );
    }

    function attach(r: Omit<CommentRow, "author">): CommentRow {
      const p = r.author_id ? profilesById.get(r.author_id) : undefined;
      return {
        ...r,
        viewer_liked: likedSet.has(r.id),
        author: p
          ? {
              id: p.id,
              display_name: p.display_name,
              avatar_url: p.doctor_photo_url ?? p.avatar_url,
              handle: p.handle,
              role: p.role,
              doctor_id: doctorByProfile.get(p.id) ?? null,
            }
          : r.author_id
            ? {
                id: r.author_id,
                display_name: null,
                avatar_url: null,
                handle: null,
                role: "user",
                doctor_id: null,
              }
            : null,
      };
    }

    // 5) 트리 조립 + 카드별 그룹 (root 순서는 RPC 의 인기순 top_root_ids 그대로)
    const rootById = new Map<number, CommentRow>();
    for (const r of rootRows) rootById.set(r.id, attach(r));
    const repliesByParent = new Map<number, CommentRow[]>();
    for (const r of replyRows) {
      if (r.parent_id == null) continue;
      const arr = repliesByParent.get(r.parent_id) ?? [];
      arr.push(attach(r));
      repliesByParent.set(r.parent_id, arr);
    }

    const previews: Record<number, { comments: CommentWithReplies[]; total: number }> = {};
    for (const m of meta) {
      const comments: CommentWithReplies[] = (m.top_root_ids ?? [])
        .map((id) => rootById.get(id))
        .filter((c): c is CommentRow => !!c)
        .map((c) => ({ ...c, replies: repliesByParent.get(c.id) ?? [] }));
      previews[m.card_id] = { comments, total: m.total ?? 0 };
    }

    return NextResponse.json(
      { previews },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "generic", "[comments preview]", 500);
  }
}
