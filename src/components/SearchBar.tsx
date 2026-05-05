"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initialValue?: string;
};

export default function SearchBar({ initialValue = "" }: Props) {
  const [q, setQ] = useState(initialValue);
  const router = useRouter();

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (!trimmed) return;
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
      className="relative mx-auto w-full max-w-xl"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="피부과 전문의가 솔직하게 답해드립니다!"
        aria-label="Q&A 검색"
        className="w-full rounded-full border border-[var(--border)] bg-white px-5 py-3 pr-12 text-center text-[15px] font-bold text-[var(--text)] outline-none placeholder:font-normal placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:shadow-[var(--shadow-sm)]"
      />
      <button
        type="submit"
        aria-label="검색"
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--primary)] text-white transition-colors hover:bg-[var(--primary-dark)]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </form>
  );
}
