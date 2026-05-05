"use client";

import { useState, useEffect } from "react";
import {
  CATEGORIES,
  pickDefaultCategory,
  type CategorySlug,
} from "@/lib/categories";

type Props = {
  /** 외부에서 활성 카테고리 통제할 때 (검색어 매칭 시 자동 전환 등) */
  value?: CategorySlug;
  onChange?: (slug: CategorySlug) => void;
};

export default function CategoryTabs({ value, onChange }: Props) {
  const [internal, setInternal] = useState<CategorySlug | null>(null);

  // 페이지 진입 시 한 번만 랜덤 디폴트. SSR-CSR mismatch 방지로 effect에서.
  useEffect(() => {
    if (!value && internal === null) {
      setInternal(pickDefaultCategory());
    }
  }, [value, internal]);

  const active = value ?? internal;

  function select(slug: CategorySlug) {
    if (value === undefined) setInternal(slug);
    onChange?.(slug);
  }

  return (
    <div
      role="tablist"
      aria-label="카테고리"
      className="-mx-4 flex justify-center gap-5 overflow-x-auto px-4 sm:gap-7"
    >
      {CATEGORIES.map((cat) => {
        const isActive = active === cat.slug;
        return (
          <button
            key={cat.slug}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(cat.slug)}
            className="shrink-0 px-1 py-2 text-[15px] font-medium transition-colors"
            style={{
              color: isActive ? cat.color : "var(--text-secondary)",
              borderBottom: `2px solid ${isActive ? cat.color : "transparent"}`,
            }}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
