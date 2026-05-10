"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Tab = "posts" | "comments" | "likes" | "saves";

type Props = {
  posts: QACardData[];
  /** 본인 보기일 때만 [좋아요][저장] 탭 노출 */
  isOwner: boolean;
  postsCount: number;
  /** 댓글 fetch 대상 — profile.id (author_id) */
  profileId: string;
  /** personal/official 페르소나로 작성한 댓글만 fetch */
  personaForPosts: "official" | "personal";
};

const TAB_LABEL: Record<Tab, string> = {
  posts: "작성 글",
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
  profileId,
  personaForPosts,
}: Props) {
  const [tab, setTab] = useState<Tab>("posts");

  const tabs: Tab[] = useMemo(() => {
    const base: Tab[] = ["posts", "comments"];
    if (isOwner) base.push("likes", "saves");
    return base;
  }, [isOwner]);

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
      {/* 탭 헤더 */}
      <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
        {tabs.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "relative px-4 py-2 text-sm font-medium transition-colors " +
                (active
                  ? "text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text)]")
              }
            >
              {TAB_LABEL[t]}
              {t === "posts" && (
                <span className="ml-1 text-[11px] text-[var(--text-muted)]">
                  {postsCount}
                </span>
              )}
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[var(--primary)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "posts" &&
        (posts.length === 0 ? (
          <Empty msg="아직 작성한 글이 없어요" />
        ) : (
          <QAFeed initial={posts} pageSize={20} />
        ))}

      {tab === "comments" && (
        <>
          {commentsLoading && comments === null ? (
            <Empty msg="불러오는 중…" />
          ) : !comments || comments.length === 0 ? (
            <Empty msg="작성한 댓글이 없어요" />
          ) : (
            <ul className="flex flex-col gap-2">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-3"
                >
                  <p className="line-clamp-3 text-[14px] text-[var(--text)]">
                    {c.body}
                  </p>
                  {c.qa && (
                    <Link
                      href={commentLink(c)}
                      className="mt-1.5 block truncate text-[11.5px] text-[var(--text-muted)] hover:text-[var(--primary)]"
                    >
                      → {c.qa.question}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
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
