"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Feed from "@/components/Feed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
  posts: QACardData[];
  /** 본인 보기일 때만 [좋아요][저장] 탭 노출 */
  isOwner: boolean;
  postsCount: number;
  /** 댓글 카운트 (server-side prefetch) — 탭 미클릭 시에도 표시 */
  commentsCount?: number;
  likesCount?: number;
  savesCount?: number;
  /** 댓글 fetch 대상 — profile.id (author_id) */
  profileId: string;
  /** personal/official 페르소나로 작성한 댓글만 fetch */
  personaForPosts: "official" | "personal";
  /** 피부정보 (공개된 항목만 표시) — 비어있으면 탭 숨김 */
  skinInfo?: SkinInfo;
  /** v4 — viewer의 좋아요/저장/평점 prefetch (posts/saves/likes 카드에 즉시 반영) */
  viewerStates?: Record<number, { liked?: boolean; saved?: boolean; rating?: number }>;
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
  qa: {
    id: number;
    question: string;
    type: string | null;
    post_year: number | null;
    post_slug: string | null;
    shortcode: string | null;
    posted_as: string | null;
    doctor: { slug: string } | null;
    author: {
      handle: string | null;
      alt_handle: string | null;
    } | null;
  } | null;
};

function commentLink(c: CommentRow): string {
  const qa = c.qa;
  if (!qa) return "/";
  // posted_as DB enum: 'official' | 'personal'. 옛 'doctor'/'self' 값도 매핑.
  const isOfficial = qa.posted_as === "official" || qa.posted_as === "doctor";
  const isPersonal = qa.posted_as === "personal" || qa.posted_as === "self";
  if (isOfficial && qa.doctor?.slug && qa.post_year && qa.post_slug)
    return `/doctors/${qa.doctor.slug}/${qa.post_year}/${qa.post_slug}`;
  if (qa.shortcode) {
    const handle = isPersonal
      ? qa.author?.alt_handle ?? qa.author?.handle
      : qa.author?.handle ?? null;
    if (handle) return `/${handle}/${qa.shortcode}`;
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
  personaForPosts,
  skinInfo,
  viewerStates,
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
    return base;
  })();

  // 댓글 lazy fetch
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // v4 — 좋아요/저장 글 lazy fetch (본인 보기에서만 노출됨)
  const [savedPosts, setSavedPosts] = useState<QACardData[] | null>(null);
  const [likedPosts, setLikedPosts] = useState<QACardData[] | null>(null);

  useEffect(() => {
    if ((tab !== "saves" && tab !== "likes") || !isOwner) return;
    if (tab === "saves" && savedPosts !== null) return;
    if (tab === "likes" && likedPosts !== null) return;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const table = tab === "saves" ? "qa_saves" : "qa_likes";
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
      console.log(`[ProfileTabs ${tab}] profileId=${profileId} ids=`, ids);
      if (ids.length === 0) {
        if (tab === "saves") setSavedPosts([]);
        else setLikedPosts([]);
        return;
      }
      // 2) qas + 작성자/원장/영상 + 모든 v4 필드 join
      const { data: qas, error: qasErr } = await sb
        .from("cards")
        .select(
          `id, question, answer, meta, keywords, like_count, view_count, save_count, rating_avg, rating_count,
           type, posted_as, post_year, post_slug, shortcode, category, hide_doctor_credential, created_at,
           external_url, external_title, external_description, external_image, external_site_name,
           doctor:doctors(slug, name, branch),
           video:videos(youtube_id, youtube_url, topic, upload_date),
           author:profiles!qas_author_id_profiles_fkey(id, display_name, avatar_url, alt_display_name, alt_avatar_url, handle, alt_handle, updated_at)`,
        )
        .in("id", ids);
      if (qasErr) {
        console.error("[qas join for saves/likes]", qasErr);
      }
      console.log(`[ProfileTabs ${tab}] fetched qas=`, qas?.length ?? 0);
      // 저장/좋아요 시간 순서 유지
      const map = new Map<number, QACardData>();
      for (const q of qas ?? []) map.set((q as { id: number }).id, q as unknown as QACardData);
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as QACardData[];
      if (tab === "saves") setSavedPosts(ordered);
      else setLikedPosts(ordered);
    })();
  }, [tab, isOwner, profileId, savedPosts, likedPosts]);

  useEffect(() => {
    if (tab !== "comments" || comments !== null) return;
    setCommentsLoading(true);
    (async () => {
      const { getActiveIdentityId } = await import("@/lib/active-identity");
      const activeId = getActiveIdentityId();
      const sb = createSupabaseBrowserClient();
      // 멀티 ID 분리: active identity 가 있으면 identity_id 매칭
      // Phase 9: 댓글은 author_id (profile.id)로 직접 필터. identity_id 컬럼 폐기.
      //   active identity가 UUID 묶음 안의 다른 profile이면 그 id 사용, 아니면 profileId 그대로.
      const targetAuthorId =
        activeId &&
        activeId !== "primary" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeId)
          ? activeId
          : profileId;
      const query = sb
        .from("comments")
        .select(
          `id, body, created_at, card_id,
           qa:cards(id, question, type, post_year, post_slug, shortcode, posted_as,
                  doctor:doctors(slug),
                  author:profiles!qas_author_id_profiles_fkey(handle, alt_handle))`,
        )
        .eq("author_id", targetAuthorId)
        .eq("status", "visible");
      const { data } = await query
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<CommentRow[]>();
      setComments(data ?? []);
      setCommentsLoading(false);
    })();
  }, [tab, comments, profileId, personaForPosts]);

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

      {tab === "skin" && skinInfo && (
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
                  href={c.qa ? commentLink(c) : "/"}
                  className="block rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 outline-none transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-soft)]/30 focus:outline-none focus-visible:ring-0"
                >
                  {c.qa && (
                    <p className="mb-1.5 truncate text-[13px] font-semibold text-[var(--text)]">
                      {c.qa.question}
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

const FACE_LABEL: Record<string, string> = {
  oval: "달걀형", peanut: "땅콩형", oblong: "장방형",
  square: "각진형", round: "둥근형",
};
const SKIN_LABEL: Record<string, string> = {
  extreme_dry: "극건성", dry: "건성", normal: "중성",
  combination: "복합성", dehydrated_oily: "수부지",
  oily: "지성", extreme_oily: "극지성",
};
const CON_LABEL: Record<string, string> = {
  elasticity: "탄력", volume: "볼륨", wrinkle: "주름",
  tone: "피부톤", pores: "모공", contour: "윤곽",
  texture: "피부결", aging: "노안", trouble: "트러블",
  sensitive: "민감성",
};
const PROC_LABEL: Record<string, string> = {
  lifting: "리프팅", laser: "레이저", booster: "스킨부스터",
  botox: "보톡스", filler: "필러", cosmetic: "화장품",
};

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

  // 3) 저는 이런 시술에 관심이 있어요.. (자유 입력 → 한글 그대로)
  if (v.interested_procedures !== false && info.interestedProcedures.length) {
    sections.push({
      title: "저는 이런 시술에 관심 있어요~",
      chips: info.interestedProcedures.map((p) => ({ label: p, q: p })),
    });
  }

  // 4) 저는 이런 시술들을 좋아해요~
  if (v.liked_procedures !== false && info.likedProcedures.length) {
    sections.push({
      title: "제가 좋아하는 시술은요..",
      chips: info.likedProcedures.map((l) => ({ label: l, q: l })),
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
