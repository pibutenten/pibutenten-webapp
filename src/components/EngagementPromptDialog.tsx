"use client";

/**
 * 비로그인 흥미 점수 임계점 도달 시 노출되는 회원가입 권유 모달 (2026-05-22 신설).
 *
 * LoginPromptDialog (좋아요/저장 인터럽트용) 와는 별개:
 *   - 사용자 의도 없이 누적된 점수로 노출 → 더 강한 가치 제안 필요
 *   - 트리거(reason) 별 카피 다변화
 *   - 트러스트 마이크로카피 + 상단 로고
 *   - 간편 로그인 버튼 직접 노출 (가입 허들 낮춤)
 *   - "나중에 할게요" 와 다른 CTA 사이 시각적 간격 확보
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import SocialLoginButtons from "@/components/SocialLoginButtons";
import type { EngagementReason } from "@/lib/engagement-score";

type Props = {
  open: boolean;
  reason: EngagementReason;
  onClose: () => void;
};

const COPY_PRESETS: Record<
  "soft" | "save" | "video" | "search",
  { title: string; sub: string }
> = {
  soft: {
    title: "피부과 가기 전, 실패 없는 시술 준비",
    sub: "회원가입하고 피부과 전문의가 검수한\n최신 리프팅·스킨부스터 Q&A를 무제한으로 만나보세요.",
  },
  save: {
    title: "나만의 피부 시술 노트",
    sub: "가입하시면 지금 보는 전문의 답변을 저장해두고,\n피부과 상담 갈 때 꺼내볼 수 있어요!",
  },
  video: {
    title: "영상으로 더 자세히",
    sub: "회원이 되면 좋아요·저장한 영상이\n한곳에 모여 다시 보기 쉬워요.",
  },
  search: {
    title: "찾는 답이 더 있어요",
    sub: "회원이면 검색한 글을 저장하고\n다시 찾기 쉬워져요.",
  },
};

function pickCopy(reason: EngagementReason): { title: string; sub: string } {
  switch (reason) {
    case "search":
      return COPY_PRESETS.search;
    case "video-click":
      return COPY_PRESETS.video;
    case "tag-click":
    case "chip-click":
      return COPY_PRESETS.search;
    default:
      return COPY_PRESETS.soft;
  }
}

// 트러스트 마이크로카피 — 매 mount 마다 랜덤 1개
const TRUST_PHRASES = [
  "피부가 예뻐지는 모든 이야기",
  "피부과 전문의가 직접 답변하는 커뮤니티",
  "리프팅·스킨부스터·안티에이징 Q&A",
  "검증된 전문의 답변, 한곳에",
];

export default function EngagementPromptDialog({ open, reason, onClose }: Props) {
  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const trustCopy = useMemo(
    () => TRUST_PHRASES[Math.floor(Math.random() * TRUST_PHRASES.length)],
    // open 토글 시점에만 새로 뽑기 위해 open 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  if (!open) return null;

  const nextPath =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/";
  const nextParam = `?next=${encodeURIComponent(nextPath)}`;

  const { title, sub } = pickCopy(reason);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="engagement-prompt-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 로고 + 트러스트 카피 */}
        <div className="flex flex-col items-center gap-2">
          {/* 브랜드 심볼 — 원형 transparent symbol.svg (PWA 사각 아이콘 X) */}
          <Image
            src="/icons/symbol.svg"
            alt="피부텐텐"
            width={48}
            height={48}
            className="h-12 w-12"
            priority
          />
          <p className="text-[12px] text-[var(--text-muted)]">{trustCopy}</p>
        </div>

        {/* 본 카피 */}
        <h3
          id="engagement-prompt-title"
          className="mt-4 text-center text-[18px] font-bold leading-[1.4] text-[var(--text)]"
        >
          {title}
        </h3>
        <p className="mt-2 whitespace-pre-line text-center text-[13px] leading-[1.55] text-[var(--text-secondary)]">
          {sub}
        </p>

        {/* 구분선 — 간편 가입 / 로그인 */}
        <div className="mt-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            3초만에 가입 / 로그인
          </span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* 소셜 로그인 (카카오/네이버/Google) */}
        <div className="mt-3" onClick={onClose}>
          <SocialLoginButtons next={nextPath} />
        </div>

        {/* primary CTA — 전문의 답변 무제한 보기 (= /signup) */}
        <Link
          href={`/signup${nextParam}`}
          className="mt-4 block rounded-full bg-[var(--primary)] px-4 py-2.5 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[var(--primary-dark)]"
          onClick={onClose}
        >
          전문의 답변 무제한 보기 →
        </Link>

        {/* secondary — 로그인 텍스트 링크 */}
        <Link
          href={`/login${nextParam}`}
          className="mt-2 block text-center text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--primary)]"
          onClick={onClose}
        >
          이미 회원이세요? 로그인
        </Link>

        {/* tertiary — 나중에 할게요 (간격 확보) */}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 block w-full py-2 text-center text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          나중에 할게요
        </button>
      </div>
    </div>
  );
}
