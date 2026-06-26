"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import SearchPanel from "@/components/search/SearchPanel";
import { addRecent } from "@/lib/recent-search";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = query.trim();
    if (!t) return;
    addRecent(t);
    router.push(`/?q=${encodeURIComponent(t)}`);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 헤더: 뒤로가기 + 검색 입력 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid #edf2f5",
          background: "#ffffff",
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            border: "none",
            background: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3c4856"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <form onSubmit={handleSubmit} role="search" style={{ flex: 1, display: "flex" }}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="시술, 고민, 키워드 검색"
            autoComplete="off"
            style={{
              flex: 1,
              height: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: "1.5px solid #cdebfa",
              background: "#f7fafc",
              fontSize: 15,
              color: "#1e2a35",
              outline: "none",
            }}
          />
        </form>
      </div>
      {/* 검색 발견 패널 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        <SearchPanel
          query={query}
          basePath="/"
          onPicked={(t) => {
            setQuery(t);
          }}
        />
      </div>
    </div>
  );
}
