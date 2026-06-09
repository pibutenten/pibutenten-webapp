"use client";

import { useState } from "react";
// 우리 목업의 시술기록 작성 폼 / 시술후기 폼을 그대로 재사용.
import { DiaryForm, ReviewOnlyForm } from "../../mockups/skin-diary/SkinDiaryMockup";

const C = "#4cbff2";
const noop = () => {};

export default function WriteTabs() {
  const [cat, setCat] = useState<"끄적끄적" | "시술기록하기" | "시술후기">("시술기록하기");
  return (
    <div className="pb-16 sm:pb-0">
      <div className="mb-4 flex gap-2">
        {(["끄적끄적", "시술기록하기", "시술후기"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className="rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
            style={cat === c ? { background: C, color: "#fff", borderColor: C } : { background: "#fff", color: "#4b5563", borderColor: "#e5e7eb" }}
          >
            {c}
          </button>
        ))}
      </div>

      {cat === "끄적끄적" && (
        <div className="rounded-[var(--radius)] bg-white p-6 text-center text-sm text-[var(--text-secondary)]">
          끄적끄적(자유 글쓰기)은 기존 글쓰기(/write)를 사용합니다.
          <div className="mt-3"><a href="/write" className="inline-block rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ background: C }}>기존 글쓰기로 이동</a></div>
        </div>
      )}
      {cat === "시술기록하기" && <DiaryForm toast={noop} go={noop} />}
      {cat === "시술후기" && <ReviewOnlyForm toast={noop} go={noop} />}
    </div>
  );
}
