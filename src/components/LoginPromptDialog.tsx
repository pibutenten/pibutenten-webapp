"use client";

/**
 * 비로그인 사용자가 로그인 필요 액션(좋아요/저장/댓글) 시도 시 띄우는 모달.
 *
 * 정책 (2026-05-16): 이전 router.push("/login") 페이지 이동을 모달로 교체.
 *   - 인스타·트위터·페이스북 표준 UX.
 *   - 현재 페이지 떠나지 않고 가입/로그인 후 돌아오기 자연스러움.
 *
 * 사용 패턴:
 *   const [authPrompt, setAuthPrompt] = useState<string | null>(null);
 *   ...
 *   if (!loggedIn) {
 *     setAuthPrompt("좋아요를 누르려면 로그인이 필요해요");
 *     return;
 *   }
 *   <LoginPromptDialog
 *     open={!!authPrompt}
 *     message={authPrompt ?? ""}
 *     onClose={() => setAuthPrompt(null)}
 *   />
 */

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

type Props = {
  open: boolean;
  message: string;
  onClose: () => void;
};

export default function LoginPromptDialog({ open, message, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Tab 순환 트랩 + 닫힐 때 이전 포커스 복원 (R5-2).
  useFocusTrap(cardRef, open);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nextParam =
    typeof window !== "undefined"
      ? `?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
      : "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-prompt-title"
    >
      <div
        ref={cardRef}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="login-prompt-title"
          className="text-center text-base font-bold text-[var(--text)]"
        >
          {message}
        </h3>
        <p className="mt-2 text-center text-[12.5px] leading-[1.55] text-[var(--text-secondary)]">
          피부텐텐 회원이 되면
          <br />더 많은 글과 기능을 이용할 수 있어요.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {/* 단일 CTA(2026-07-03) — 옛 '회원가입'(/signup 직링크)은 비로그인 클릭 시 /login 으로
              튕기는 잔재라 제거. /login = '시작하기' 통합 화면(소셜=가입/로그인 겸용 + 이메일)이라
              가입·로그인 둘 다 이 한 곳으로 모인다. */}
          <Link
            href={`/login${nextParam}`}
            aria-label="가입 또는 로그인하고 시작하기"
            className="block rounded-full bg-[var(--primary)] px-4 py-2.5 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)]"
            onClick={onClose}
          >
            3초 만에 시작하기 — 가입 / 로그인
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            나중에 할게요
          </button>
        </div>
      </div>
    </div>
  );
}
