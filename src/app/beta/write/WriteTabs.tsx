"use client";

import { useState } from "react";
// 우리 목업의 시술기록 작성 폼 / 시술후기 폼을 그대로 재사용.
import { DiaryForm, ReviewOnlyForm } from "../../mockups/skin-diary/SkinDiaryMockup";
// 끄적끄적은 기존 글쓰기 컴포넌트(WriteClient)를 그대로 사용.
import WriteClient from "../../write/WriteClient";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

const C = "#4cbff2";
const noop = () => {};

export default function WriteTabs({
  isLoggedIn,
  role,
  displayName,
  myDoctor,
  doctors,
}: {
  isLoggedIn: boolean;
  role: "admin" | "doctor" | "user";
  displayName: string;
  myDoctor: { slug: string; name: string } | null;
  doctors: Doctor[];
}) {
  const [cat, setCat] = useState<"시술기록" | "시술후기" | "끄적끄적">("시술기록");
  return (
    <div className="mx-auto max-w-[680px] pb-16 sm:pb-0">
      <div className="mb-4 flex gap-2">
        {(["시술기록", "시술후기", "끄적끄적"] as const).map((c) => (
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

      {cat === "시술기록" && <DiaryForm toast={noop} go={noop} />}
      {cat === "시술후기" && <ReviewOnlyForm toast={noop} go={noop} />}
      {cat === "끄적끄적" && (
        isLoggedIn ? (
          <WriteClient role={role} myDoctor={myDoctor} doctors={doctors} displayName={displayName} initialCategory="doodle" />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-medium text-[var(--text)]">로그인 후 작성할 수 있어요.</p>
            <a href="/login" className="mt-4 rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ background: C }}>로그인</a>
          </div>
        )
      )}
    </div>
  );
}
