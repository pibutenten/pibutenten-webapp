"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  initialValue?: string;
  onFocusChange?: (focused: boolean) => void;
};

export default function SearchBar({
  initialValue = "",
  onFocusChange,
}: Props) {
  const [q, setQ] = useState(initialValue);
  const router = useRouter();

  // initialValue가 외부에서 바뀌면 (URL ?q=... 변경 등) 동기화
  useEffect(() => {
    setQ(initialValue);
  }, [initialValue]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (!trimmed) {
          // 빈 검색은 홈으로 (검색 해제)
          router.push("/");
          return;
        }
        // submit 시 모바일 키보드 내림
        (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
        router.push(`/?q=${encodeURIComponent(trimmed)}`);
      }}
      className="relative mx-auto w-full max-w-[520px]"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => {
          if (!q.trim()) {
            setTimeout(() => onFocusChange?.(false), 100);
          }
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
