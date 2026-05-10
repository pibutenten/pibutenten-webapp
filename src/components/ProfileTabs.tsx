"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import QAFeed from "@/components/QAFeed";
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
  qa_id: number;
  qa: {
    id: number;
    question: string;
    type: string | null;
    article_slug: string | null;
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
  if (qa.type === "article" && qa.article_slug)
    return `/article/${encodeURIComponent(qa.article_slug)}`;
  if (
    qa.posted_as === "doctor" &&
    qa.doctor?.slug &&
    qa.post_year &&
    qa.post_slug
  )
    return `/doctors/${qa.doctor.slug}/${qa.post_year}/${qa.post_slug}`;
  if (qa.shortcode && qa.post_year) {
    const handle =
      qa.posted_as === "self"
        ? qa.author?.alt_handle ?? qa.author?.handle
        : qa.author?.handle ?? null;
    if (handle) return `/${handle}/${qa.post_year}/${qa.shortcode}`;
  }
  return `/qa/${qa.id}`;
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
}: Props) {
  const [tab, setTab] = useState<Tab>("posts");
  const [sort, setSort] = useState<"latest" | "popular">("latest");

  // 정렬 적용 (작성 글 — client-side. 댓글·좋아요·저장은 서버 fetch 결과 그대로 사용)
  const sortedPosts = useMemo(() => {
    if (sort === "popular") {
      return [...posts].sort(
        (a, b) =>
          (b.like_count ?? 0) + (b.view_count ?? 0) / 100 -
          ((a.like_count ?? 0) + (a.view_count ?? 0) / 100),
      );
    }
    return posts;
  }, [posts, sort]);

  // 피부고민 탭은 공개된 항목 있을 때만
  const hasSkin = !!(
    skinInfo &&
    ((skinInfo.visibility.face_shape !== false && skinInfo.faceShape) ||
      (skinInfo.visibility.skin_type !== false && skinInfo.skinType) ||
      (skinInfo.visibility.skin_concerns !== false && skinInfo.skinConcerns.length) ||
      (skinInfo.visibility.interested_procedures !== false &&
        skinInfo.interestedProcedures.length) ||
      (skinInfo.visibility.liked_procedures !== false && skinInfo.likedProcedures.length))
  );

  const tabs: Tab[] = useMemo(() => {
    const base: Tab[] = ["posts"];
    if (hasSkin) base.push("skin");
    base.push("comments");
    if (isOwner) base.push("likes", "saves");
    return base;
  }, [isOwner, hasSkin]);

  // 댓글 lazy fetch
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    if (tab !== "comments" || comments !== null) return;
    setCommentsLoading(true);
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data } = await sb
        .from("comments")
        .select(
          `id, body, created_at, qa_id,
           qa:qas(id, question, type, article_slug, post_year, post_slug, shortcode, posted_as,
                  doctor:doctors(slug),
                  author:profiles!qas_author_id_profiles_fkey(handle, alt_handle))`,
        )
        .eq("author_id", profileId)
        .eq("posted_as", personaForPosts)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<CommentRow[]>();
      setComments(data ?? []);
      setCommentsLoading(false);
    })();
  }, [tab, comments, profileId, personaForPosts]);

  return (
    <div>
      {/* 탭 헤더 — 좌측 탭 목록 + 우측 정렬 */}
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
                  "relative px-4 py-2 text-sm font-medium outline-none transition-colors focus:outline-none focus-visible:ring-0 " +
                  (active
                    ? "text-[var(--primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text)]")
                }
              >
                {TAB_LABEL[t]}
                {count !== null && (
                  <span className="ml-1 text-[11px] text-[var(--text-muted)]">
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
        {/* 정렬 — 피부고민 탭에선 의미 없음 */}
        {tab !== "skin" && (
          <div className="ml-auto flex gap-1 pr-1 text-[11.5px]">
            {(["latest", "popular"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={
                  "rounded px-2 py-0.5 transition-colors " +
                  (sort === s
                    ? "font-semibold text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")
                }
              >
                {s === "latest" ? "최신순" : "인기순"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "posts" &&
        (sortedPosts.length === 0 ? (
          <Empty msg="아직 작성한 글이 없어요" />
        ) : (
          <QAFeed
            key={sort}
            initial={sortedPosts}
            pageSize={20}
          />
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {comments.map((c) => (
                <Link
                  key={c.id}
                  href={c.qa ? commentLink(c) : "/"}
                  className="block rounded-[var(--radius)] border border-[var(--border)] bg-white p-3 outline-none transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-soft)]/30 focus:outline-none focus-visible:ring-0"
                >
                  <p className="line-clamp-3 text-[14px] text-[var(--text)]">
                    {c.body}
                  </p>
                  {c.qa && (
                    <p className="mt-1.5 truncate text-[11.5px] text-[var(--text-muted)]">
                      → {c.qa.question}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "likes" && <Empty msg="좋아요한 글이 없어요" />}
      {tab === "saves" && <Empty msg="저장한 글이 없어요" />}
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
  lifting: "리프팅", laser: "피부레이저", booster: "스킨부스터",
  botox: "보톡스", filler: "필러", cosmetic: "화장품",
};

function SkinInfoBlock({ info }: { info: SkinInfo }) {
  const v = info.visibility ?? {};
  const sections: { title: string; chips: { label: string; q?: string }[] }[] = [];
  if (v.face_shape !== false && info.faceShape) {
    sections.push({
      title: "얼굴형",
      chips: [{ label: FACE_LABEL[info.faceShape] ?? info.faceShape }],
    });
  }
  if (v.skin_type !== false && info.skinType) {
    sections.push({
      title: "피부타입",
      chips: [{ label: SKIN_LABEL[info.skinType] ?? info.skinType }],
    });
  }
  if (v.skin_concerns !== false && info.skinConcerns.length) {
    sections.push({
      title: "피부고민",
      chips: info.skinConcerns.map((c) => {
        const lbl = CON_LABEL[c] ?? c;
        return { label: lbl, q: lbl };
      }),
    });
  }
  if (v.interested_procedures !== false && info.interestedProcedures.length) {
    sections.push({
      title: "관심 시술",
      chips: info.interestedProcedures.map((p) => {
        const lbl = PROC_LABEL[p] ?? p;
        return { label: lbl, q: lbl };
      }),
    });
  }
  if (v.liked_procedures !== false && info.likedProcedures.length) {
    sections.push({
      title: "좋아하는 시술",
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
          <h3 className="mb-2 text-[12px] font-semibold text-[var(--text-secondary)]">
            {s.title}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {s.chips.map((c, ci) =>
              c.q ? (
                <Link
                  key={ci}
                  href={`/search?q=${encodeURIComponent(c.q)}`}
                  className="rounded-full bg-[var(--bg-soft)] px-3 py-1 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[#E5E7EB] hover:text-[var(--text)]"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  key={ci}
                  className="rounded-full bg-[var(--bg-soft)] px-3 py-1 text-[12.5px] text-[var(--text-secondary)]"
                >
                  {c.label}
                </span>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
