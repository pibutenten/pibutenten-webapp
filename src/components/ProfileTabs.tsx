"use client";

import { useState, useMemo } from "react";
import QAFeed from "@/components/QAFeed";
import type { QACardData } from "@/components/QACard";

type Tab = "posts" | "comments" | "likes" | "saves";

type Props = {
  posts: QACardData[];
  /** 본인 보기일 때만 [좋아요][저장] 탭 노출 */
  isOwner: boolean;
  /** 댓글·좋아요·저장 탭 콘텐츠는 추후 추가 (placeholder) */
  postsCount: number;
};

const TAB_LABEL: Record<Tab, string> = {
  posts: "작성 글",
  comments: "댓글",
  likes: "좋아요",
  saves: "저장",
};

/**
 * 프로필 페이지 탭 — 작성 글 / 댓글 / 좋아요 / 저장.
 * 좋아요·저장 탭은 본인 보기에만 노출.
 * 작성 글 탭은 메인 피드와 동일한 2단(QAFeed) 레이아웃.
 * 댓글·좋아요·저장 탭은 추후 구현 예정 (placeholder).
 */
export default function ProfileTabs({ posts, isOwner, postsCount }: Props) {
  const [tab, setTab] = useState<Tab>("posts");

  const tabs: Tab[] = useMemo(() => {
    const base: Tab[] = ["posts", "comments"];
    if (isOwner) base.push("likes", "saves");
    return base;
  }, [isOwner]);

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
      {tab === "comments" && <Empty msg="작성한 댓글이 없어요" />}
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
