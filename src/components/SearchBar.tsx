"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  initialValue?: string;
  onFocusChange?: (focused: boolean) => void;
  /** 데스크탑(>768px)에서 마운트 시 자동 포커스 (모바일에선 무시) */
  autoFocusOnDesktop?: boolean;
};

export default function SearchBar({
  initialValue = "",
  onFocusChange,
  autoFocusOnDesktop = false,
}: Props) {
  const [q, setQ] = useState(initialValue);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // initialValue가 외부에서 바뀌면 (URL ?q=... 변경 등) 동기화
  useEffect(() => {
    setQ(initialValue);
  }, [initialValue]);

  // 데스크탑 자동 포커스 — preventScroll로 페이지 스크롤 일어나지 않게
  useEffect(() => {
    if (!autoFocusOnDesktop) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth <= 768) return; // 모바일 안 함 (자동 키보드 OFF)
    inputRef.current?.focus({ preventScroll: true });
  }, [autoFocusOnDesktop]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (!trimmed) {
          router.push("/");
          return;
        }
        // submit 시 모바일 키보드 내림
        (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
        // v3 URL 정책: 검색은 /search 로 분리됨
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
      className="relative mx-auto w-full max-w-[520px]"
    >
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          // 입력 중 자동완성 카테고리 강조용 — CategoryWithChips가 리스너로 받음
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("pbtt:search-input", { detail: v }),
            );
          }
        }}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => {
          // 항상 콜백 호출 — HeroSearch가 내부에서 main reset 여부 결정
          // (blur 시에는 main 유지, 진짜 키보드 닫힘 시에만 reset)
          onFocusChange?.(false);
        }}
        placeholder="피부과 전문의가 솔직하게 답해드립니다!"
        aria-label="Q&A 검색"
        className="h-[50px] w-full rounded-full border-2 border-[var(--secondary)] bg-white px-6 pr-14 text-center text-[15px] font-bold text-[var(--text)] outline-none shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] placeholder:text-[16px] placeholder:font-normal placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:shadow-[0_0_0_4px_rgba(95,168,211,0.15)] sm:h-14 sm:text-[17px]"
      />
      <button
        type="submit"
        aria-label="검색"
        className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-dark)]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </form>
  );
}
