"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import CommentsBlock from "@/components/CommentsBlock";

type Props = {
  articleId: number;
  slug: string;
  initialLike: number;
  initialView: number;
  doctorSlug: string | null;
  title: string;
};

/**
 * Article 단독 페이지의 인터랙션 영역.
 * - 마운트 시 view +1
 * - 좋아요 (브라우저 1회 제한, 기존 QACard 패턴 동일)
 * - 공유 (native / clipboard)
 * - 댓글 블록 (CommentsBlock 재사용)
 */
export default function ArticleViewClient({
  articleId,
  slug,
  initialLike,
  initialView,
  doctorSlug,
  title,
}: Props) {
  const [view, setView] = useState(initialView);
  const [like, setLike] = useState(initialLike);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);

  // mount 시 view +1
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createSupabaseBrowserClient();
    supabase
      .rpc("increment_qa_view", { p_qa_id: articleId })
      .then(({ data }: { data: number | null }) => {
        if (typeof data === "number") setView(data);
      });
  }, [articleId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLiked(localStorage.getItem(`qa-liked-${articleId}`) === "1");
  }, [articleId]);

  function handleLike() {
    if (typeof window === "undefined") return;
    const supabase = createSupabaseBrowserClient();
    if (liked) {
      setLiked(false);
      setLike((c) => Math.max(0, c - 1));
      localStorage.removeItem(`qa-liked-${articleId}`);
      supabase.rpc("decrement_qa_like", { p_qa_id: articleId }).then(
        ({ data, error }: { data: number | null; error: unknown }) => {
          if (error) {
            setLiked(true);
            setLike((c) => c + 1);
            localStorage.setItem(`qa-liked-${articleId}`, "1");
            return;
          }
          if (typeof data === "number") setLike(data);
        },
      );
    } else {
      setLiked(true);
      setLike((c) => c + 1);
      localStorage.setItem(`qa-liked-${articleId}`, "1");
      supabase.rpc("increment_qa_like", { p_qa_id: articleId }).then(
        ({ data, error }: { data: number | null; error: unknown }) => {
          if (error) {
            setLiked(false);
            setLike((c) => Math.max(0, c - 1));
            localStorage.removeItem(`qa-liked-${articleId}`);
            return;
          }
          if (typeof data === "number") setLike(data);
        },
      );
    }
  }

  async function share() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/article/${encodeURIComponent(slug)}`;
    const ua = window.navigator.userAgent;
    const isMobile =
      /android|iphone|ipad|ipod/i.test(ua) ||
      (navigator.maxTouchPoints > 1 && /macintosh/i.test(ua));
    const nav = window.navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (isMobile && nav.share) {
      try {
        await nav.share({ url, title, text: "피부텐텐 칼럼" });
        return;
      } catch {
        /* fallback */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("링크가 복사되었어요");
    } catch {
      toast("복사 실패");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-5 text-[14px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{view}</span>
        </span>

        <button
          type="button"
          onClick={handleLike}
          aria-label={liked ? "좋아요 취소" : "좋아요"}
          aria-pressed={liked}
          className="flex items-center gap-1.5 transition-colors hover:text-[var(--primary)]"
          style={liked ? { color: "#E91E63" } : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span>{like}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 transition-colors hover:text-[var(--primary)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{showComments ? "댓글 숨기기" : "댓글 보기"}</span>
        </button>

        <button
          type="button"
          onClick={share}
          className="ml-auto flex items-center gap-1.5 transition-colors hover:text-[var(--primary)]"
          aria-label="공유하기"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
            aria-hidden
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
      </div>

      {showComments && (
        <div className="mt-4">
          <CommentsBlock
            qaId={articleId}
            doctorSlug={doctorSlug}
            isPublishedQa={true}
          />
        </div>
      )}
    </div>
  );
}

function toast(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.9);" +
    "background:#FFFFFF;color:#1B4965;padding:14px 28px;" +
    "border:1px solid #E2E8EE;border-radius:9999px;" +
    "font-size:15px;font-weight:700;letter-spacing:-0.2px;z-index:9999;" +
    "box-shadow:0 12px 32px rgba(27,73,101,0.18),0 2px 6px rgba(0,0,0,0.06);" +
    "opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;" +
    "pointer-events:none;";
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translate(-50%,-50%) scale(1)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%,-50%) scale(0.95)";
    setTimeout(() => el.remove(), 220);
  }, 1500);
}
