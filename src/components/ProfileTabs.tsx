"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Feed from "@/components/Feed";
import type { CardData } from "@/components/Card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  FACE_LABEL,
  SKIN_LABEL,
  CONCERN_LABEL as CON_LABEL,
  PROCEDURE_LABEL as PROC_LABEL,
} from "@/lib/profile-options";

// procedure key (영어, ex: lifting/laser/booster) → 한글 label 매핑.
// 자유 입력 키는 그대로 표시.
function localizeProcedure(v: string): string {
  return PROC_LABEL[v] ?? v;
}

type Tab = "posts" | "skin" | "comments" | "likes" | "saves";

export type SkinInfo = {
  faceShape: string | null;
  skinType: string | null;
  skinConcerns: string[];
  interestedProcedures: string[];
  likedProcedures: string[];
  visibility: Record<string, boolean>;
};

type Props = {
  posts: CardData[];
  /** 본인 보기일 때만 [좋아요][저장] 탭 노출 */
  isOwner: boolean;
  postsCount: number;
  /** 댓글 카운트 (server-side prefetch) — 탭 미클릭 시에도 표시 */
  commentsCount?: number;
  likesCount?: number;
  savesCount?: number;
  /** 댓글 fetch 대상 — profile.id (author_id) */
  profileId: string;
  /** 피부정보 (공개된 항목만 표시) — 비어있으면 탭 숨김 */
  skinInfo?: SkinInfo;
  /** v4 — viewer의 좋아요/저장 prefetch (posts/saves/likes 카드에 즉시 반영) */
  viewerStates?: Record<number, { liked?: boolean; saved?: boolean }>;
  /**
   * 비로그인(anon) 보기 여부 — true 면 피부고민 탭에 PII 대신 로그인 CTA 표시.
   * 0122 마이그레이션으로 anon 은 PII 컬럼을 select 자체 못함 → server 가 빈 skinInfo 전달.
   * A1 (2026-05-17).
   */
  viewerIsAnon?: boolean;
};

const TAB_LABEL: Record<Tab, string> = {
  posts: "작성 글",
  skin: "피부고민",
  comments: "댓글",
  likes: "좋아요",
  saves: "저장",
};

type CommentRow = {
  id: number;
  body: string;
  created_at: string;
  card_id: number;
  card: {
    id: number;
    title: string;
    type: string | null;
    post_year: number | null;
    post_slug: string | null;
    shortcode: string | null;
    doctor: { slug: string } | null;
    author: {
      handle: string | null;
    } | null;
  } | null;
};

function commentLink(c: CommentRow): string {
  const card = c.card;
  if (!card) return "/";
  // 의사 글 — keyword slug
  if (card.doctor?.slug && card.post_year && card.post_slug)
    return `/doctors/${card.doctor.slug}/${card.post_year}/${card.post_slug}`;
  // 회원 글 — handle + shortcode
  if (card.shortcode && card.author?.handle) {
    return `/${card.author.handle}/${card.shortcode}`;
  }
  return "/";
}

/**
 * 프로필 페이지 탭 — 작성 글 / 댓글 / 좋아요 / 저장.
 * 좋아요·저장 탭은 본인 보기에만 노출.
 * 댓글 탭: 활성화 시 fetch.
 */
export default function ProfileTabs({
  posts,
  isOwner,
  postsCount,
  commentsCount,
  likesCount,
  savesCount,
  profileId,
  skinInfo,
  viewerStates,
  viewerIsAnon,
}: Props) {
  const [tab, setTab] = useState<Tab>("posts");

  // visibility flag — owner는 항상 모든 탭 표시. 외부인은 visibility !== false일 때만.
  const v = skinInfo?.visibility ?? {};
  const showTab = (key: string) => isOwner || v[key] !== false;
  // 피부고민 탭은 공개된 항목이 있을 때만 (각 항목별 visibility는 SkinInfoBlock에서 다시 필터)
  const hasSkinContent = !!(
    skinInfo &&
    (skinInfo.faceShape ||
      skinInfo.skinType ||
      skinInfo.skinConcerns.length ||
      skinInfo.interestedProcedures.length ||
      skinInfo.likedProcedures.length)
  );
  // anon 은 PII 컬럼을 못 받으므로 피부고민 탭 자체는 "로그인 안내" 용도로 표시.
  // field_visibility 도 안 받았을 수 있어 보수적으로 탭 노출.
  const showSkinTabForAnon = !!viewerIsAnon && !isOwner;

  // 탭 순서: 작성 글 → 댓글 → 좋아요·저장 → 피부고민
  // - likes/saves는 RLS상 외부인이 raw 데이터 fetch 불가 → 외부인이 visibility on 봐도 빈 상태
  // - 그래도 visibility 컨트롤 일관성을 위해 5개 모두 flag 적용
  const tabs: Tab[] = (() => {
    const base: Tab[] = [];
    if (showTab("tab_posts")) base.push("posts");
    if (showTab("tab_comments")) base.push("comments");
    if (showTab("tab_likes") && isOwner) base.push("likes");
    if (showTab("tab_saves") && isOwner) base.push("saves");
    if (hasSkinContent && showTab("tab_skin")) base.push("skin");
    // anon 보기에 한해, 피부고민이 있는지 모름 → 무조건 탭 노출 (클릭 시 로그인 CTA).
    else if (showSkinTabForAnon) base.push("skin");
    return base;
  })();

  // 댓글 lazy fetch
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // v4 — 좋아요/저장 글 lazy fetch (본인 보기에서만 노출됨)
  const [savedPosts, setSavedPosts] = useState<CardData[] | null>(null);
  const [likedPosts, setLikedPosts] = useState<CardData[] | null>(null);

  useEffect(() => {
    if ((tab !== "saves" && tab !== "likes") || !isOwner) return;
    if (tab === "saves" && savedPosts !== null) return;
    if (tab === "likes" && likedPosts !== null) return;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const table = tab === "saves" ? "card_saves" : "card_likes";
      // 1) 내가 저장/좋아요한 card_id 목록
      const { data: rows, error: rowsErr } = await sb
        .from(table)
        .select("card_id, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (rowsErr) {
        console.error(`[${table} list]`, rowsErr);
      }
      const ids = (rows ?? []).map((r) => (r as { card_id: number }).card_id);
      if (ids.length === 0) {
        if (tab === "saves") setSavedPosts([]);
        else setLikedPosts([]);
        return;
      }
      // 2) cards + 작성자/원장/영상 + 모든 v4 필드 join
      const { data: cardRows, error: cardErr } = await sb
        .from("cards")
        .select(
          `id, title, body, meta, keywords, like_count, view_count, save_count,
           type, post_year, post_slug, shortcode, category, hide_doctor_credential, created_at,
           external_url, external_title, external_description, external_image, external_site_name,
           doctor:doctors(slug, name, branch),
           video:videos(youtube_id, youtube_url, topic, upload_date),
           author:profiles!cards_author_id_profiles_fkey(id, display_name, avatar_url, handle, updated_at)`,
        )
        .in("id", ids)
        .returns<CardData[]>();
      if (cardErr) {
        console.error("[cards join for saves/likes]", cardErr);
      }
      // 저장/좋아요 시간 순서 유지.
      // Critical-5 (C-2 fix, 2026-05-27): 강제 캐스팅 `as unknown as CardData` 폐기 → `.returns<CardData[]>()` 로 타입 안전 좁힘.
      const map = new Map<number, CardData>();
      for (const q of cardRows ?? []) map.set(q.id, q);
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as CardData[];
      if (tab === "saves") setSavedPosts(ordered);
      else setLikedPosts(ordered);
    })();
  }, [tab, isOwner, profileId, savedPosts, likedPosts]);

  useEffect(() => {
    if (tab !== "comments" || comments !== null) return;
    setCommentsLoading(true);
    (async () => {
      const sb = createSupabaseBrowserClient();
      // URL handle 페이지의 author_id == profileId.
      // 이전: viewer 의 active identity 로 분기 → viewer 본인 댓글로 fetch 되어
      //       서버 prefetch 카운트(=URL 주인의 댓글)와 mismatch (예: 1 → 3 으로 변동).
      //       이 페이지는 명확히 URL handle 의 profile 댓글만 보여줘야 한다.
      const query = sb
        .from("comments")
        .select(
          `id, body, created_at, card_id,
           card:cards(id, title, type, post_year, post_slug, shortcode,
                  doctor:doctors(slug),
                  author:profiles!cards_author_id_profiles_fkey(handle))`,
        )
        .eq("author_id", profileId)
        .eq("status", "visible");
      const { data } = await query
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<CommentRow[]>();
      setComments(data ?? []);
      setCommentsLoading(false);
    })();
  }, [tab, comments, profileId]);

  return (
    <div>
      {/* 탭 헤더 — 정렬 토글 제거, 최신순 고정 */}
      <div className="mb-4 flex items-center gap-1 border-b border-[var(--border)]">
        <div className="flex gap-1">
          {tabs.map((t) => {
            const active = t === tab;
            const count =
              t === "posts"
                ? postsCount
                : t === "skin"
                  ? null
                  : t === "comments"
                    ? comments?.length ?? commentsCount ?? 0
                    : t === "likes"
                      ? likesCount ?? 0
                      : savesCount ?? 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  "relative px-2 py-2 text-sm font-medium outline-none transition-colors focus:outline-none focus-visible:ring-0 sm:px-2.5 " +
                  (active
                    ? "text-[var(--primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text)]")
                }
              >
                {TAB_LABEL[t]}
                {count !== null && count > 0 && (
                  <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">
                    {count}
                  </span>
                )}
                {active && (
                  <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[var(--primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "posts" &&
        (posts.length === 0 ? (
          <Empty msg="아직 작성한 글이 없어요" />
        ) : (
          <Feed initial={posts} pageSize={20} viewerStates={viewerStates} />
        ))}

      {tab === "skin" && viewerIsAnon && !isOwner && (
        <LoginPromptForPII />
      )}
      {tab === "skin" && !viewerIsAnon && skinInfo && (
        <SkinInfoBlock info={skinInfo} />
      )}

      {tab === "comments" && (
        <>
          {commentsLoading && comments === null ? (
            <Empty msg="불러오는 중…" />
          ) : !comments || comments.length === 0 ? (
            <Empty msg="작성한 댓글이 없어요" />
          ) : (
            // 데스크탑 2단 / 모바일 1단. 박스 어디든 클릭 → 원본 글로 이동.
            // 원본 글 제목을 위에, 그 아래 "댓글:" 라벨 + 댓글 본문.
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {comments.map((c) => (
                <Link
                  key={c.id}
                  href={c.card ? commentLink(c) : "/"}
                  className="block rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 outline-none transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-soft)]/30 focus:outline-none focus-visible:ring-0"
                >
                  {c.card && (
                    <p className="mb-1.5 truncate text-[13px] font-semibold text-[var(--text)]">
                      {c.card.title}
                    </p>
                  )}
                  <div className="flex items-start gap-1.5 text-[13.5px] text-[var(--text-secondary)]">
                    <span
                      className="shrink-0 text-[15px] leading-[1.4] text-[var(--text-muted)]"
                      aria-label="댓글"
                    >
                      ↳
                    </span>
                    <p className="line-clamp-2">{c.body}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "likes" &&
        (likedPosts === null ? (
          <Empty msg="불러오는 중…" />
        ) : likedPosts.length === 0 ? (
          <Empty msg="좋아요한 글이 없어요" />
        ) : (
          <Feed initial={likedPosts} pageSize={20} viewerStates={viewerStates} />
        ))}
      {tab === "saves" &&
        (savedPosts === null ? (
          <Empty msg="불러오는 중…" />
        ) : savedPosts.length === 0 ? (
          <Empty msg="저장한 글이 없어요" />
        ) : (
          <Feed initial={savedPosts} pageSize={20} viewerStates={viewerStates} />
        ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text-muted)]">
      {msg}
    </div>
  );
}

/**
 * 비로그인 사용자에게 PII(피부정보) 영역을 가리고 로그인/회원가입 CTA 노출.
 * A1 (2026-05-17) — 0122 마이그레이션으로 anon 은 PII 컬럼 SELECT 자체 불가.
 * 단순한 차단이 아닌 회원가입 유도 (그로스 hook).
 */
function LoginPromptForPII() {
  const nextPath =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-soft)]/40 px-6 py-10 text-center">
      <div className="mb-2 text-2xl">🔒</div>
      <p className="mb-1 text-sm font-semibold text-[var(--text)]">
        피부 고민·관심 시술 정보는 회원에게만 공개돼요
      </p>
      <p className="mb-5 text-xs text-[var(--text-muted)]">
        같은 피부 고민을 가진 회원들과 정보를 나눠 보세요.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href={signupHref}
          className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          1초 만에 가입하기
        </Link>
        <Link
          href={loginHref}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white"
        >
          이미 회원이라면 로그인
        </Link>
      </div>
    </div>
  );
}


function SkinInfoBlock({ info }: { info: SkinInfo }) {
  const v = info.visibility ?? {};

  // 4개 섹션 — 친근한 문구 라벨, 안에 태그만
  const sections: { title: string; chips: { label: string; q?: string }[] }[] = [];

  // 1) 내 피부는요.. (얼굴형 + 피부타입)
  const myChips: { label: string; q?: string }[] = [];
  if (v.face_shape !== false && info.faceShape) {
    const lbl = FACE_LABEL[info.faceShape] ?? info.faceShape;
    myChips.push({ label: lbl, q: lbl });
  }
  if (v.skin_type !== false && info.skinType) {
    const lbl = SKIN_LABEL[info.skinType] ?? info.skinType;
    myChips.push({ label: lbl, q: lbl });
  }
  if (myChips.length) sections.push({ title: "내 피부는요..", chips: myChips });

  // 2) 내 피부고민은요..
  if (v.skin_concerns !== false && info.skinConcerns.length) {
    sections.push({
      title: "내 피부고민은요..",
      chips: info.skinConcerns.map((c) => {
        const lbl = CON_LABEL[c] ?? c;
        return { label: lbl, q: lbl };
      }),
    });
  }

  // 3) 저는 이런 시술에 관심이 있어요..
  //    PROCEDURES dictionary key (lifting/laser/booster 등 영어) → 한글 label 변환.
  //    자유 입력(매핑 없음) 은 그대로 노출.
  if (v.interested_procedures !== false && info.interestedProcedures.length) {
    sections.push({
      title: "저는 이런 시술에 관심 있어요~",
      chips: info.interestedProcedures.map((p) => {
        const label = localizeProcedure(p);
        return { label, q: label };
      }),
    });
  }

  // 4) 저는 이런 시술들을 좋아해요~
  if (v.liked_procedures !== false && info.likedProcedures.length) {
    sections.push({
      title: "제가 좋아하는 시술은요..",
      chips: info.likedProcedures.map((l) => {
        const label = localizeProcedure(l);
        return { label, q: label };
      }),
    });
  }

  return (
    <div className="space-y-4">
      {sections.map((s, i) => (
        <div
          key={i}
          className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4"
        >
          <h3 className="mb-2.5 text-[13px] font-medium text-[var(--text-secondary)]">
            {s.title}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {s.chips.map((c, ci) => (
              <ChipLink key={ci} c={c} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChipLink({ c }: { c: { label: string; q?: string } }) {
  if (c.q) {
    return (
      <Link
        href={`/search?q=${encodeURIComponent(c.q)}`}
        className="rounded-full bg-[var(--bg-soft)] px-3 py-1 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[#E5E7EB] hover:text-[var(--text)]"
      >
        {c.label}
      </Link>
    );
  }
  return (
    <span className="rounded-full bg-[var(--bg-soft)] px-3 py-1 text-[12.5px] text-[var(--text-secondary)]">
      {c.label}
    </span>
  );
}
