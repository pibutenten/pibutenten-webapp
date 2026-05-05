"use client";

import { useState, useEffect, type CSSProperties } from "react";
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

/**
 * 카테고리 탭. 정적 사이트(.cat-tabs) 스펙 그대로 매칭.
 * - 하단 1px 회색 가로선 (border-b)
 * - 활성 탭은 2px 카테고리색 밑줄 (margin-bottom -1px로 부모 선과 겹침)
 * - 모바일: 한 줄 고정 + 가로 스크롤, padding 6px·font 13px·gap 14px
 * - 데스크탑: 줄바꿈 가능, padding 7px·font 14px·gap 28px
 * - 탭 line 아래 여백: 모바일 12px / 데스크탑 14px
 */
export default function CategoryTabs({ value, onChange }: Props) {
  const [internal, setInternal] = useState<CategorySlug | null>(null);

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
      className="-mx-4 flex justify-center gap-x-[14px] overflow-x-auto border-b border-[var(--border)] px-4 mb-3 sm:mx-0 sm:flex-wrap sm:gap-x-7 sm:gap-y-2 sm:overflow-visible sm:px-0 sm:mb-[14px] [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" } as CSSProperties}
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
            className="shrink-0 -mb-px border-b-2 px-1 py-[6px] text-[13px] font-semibold transition-[color,border-color,transform] active:scale-[0.96] sm:py-[7px] sm:text-[14px]"
            style={{
              color: isActive ? cat.color : "var(--text-secondary)",
              borderBottomColor: isActive ? cat.color : "transparent",
            }}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
