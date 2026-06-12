"use client";

// 시술기록(개인 노트)은 목업 폼 재사용. 시술후기는 기존 실제 폼(/review/new 의 ReviewForm) 그대로 연결.
import { useRouter } from "next/navigation";
import { DiaryForm } from "../mockups/skin-diary/SkinDiaryMockup";
import ReviewForm, { type ProcedureOption } from "../review/new/ReviewForm";
// 끄적끄적은 기존 글쓰기 컴포넌트(WriteClient)를 그대로 사용.
import WriteClient from "./WriteClient";
import { showToast } from "@/lib/toast";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

const C = "#4cbff2";

function LoginGate() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-sm font-medium text-[var(--text)]">로그인 후 작성할 수 있어요.</p>
      <a href="/login" className="mt-4 rounded-full px-6 py-2.5 text-sm font-semibold text-white" style={{ background: C }}>로그인</a>
    </div>
  );
}

// 탭은 BetaNav 헤더(2차 바)에서 URL ?tab= 으로 전환 — 여기선 그 값으로 폼만 렌더.
export default function WriteTabs({
  tab,
  isLoggedIn,
  role,
  displayName,
  myDoctor,
  doctors,
  procedures,
  handle,
}: {
  tab?: string;
  isLoggedIn: boolean;
  role: "admin" | "doctor" | "user";
  displayName: string;
  myDoctor: { slug: string; name: string } | null;
  doctors: Doctor[];
  procedures: ProcedureOption[];
  handle: string;
}) {
  const router = useRouter();
  // Q&A 탭은 원장·관리자 전용. 권한 없는 사용자가 ?tab=qa 로 들어오면 기본(시술기록)으로.
  const canQa = isLoggedIn && (role === "admin" || role === "doctor");
  const cat =
    tab === "qa" ? (canQa ? "qa" : "시술기록")
    : tab === "review" ? "시술후기"
    : tab === "doodle" ? "끄적끄적"
    : "시술기록";
  return (
    <div className="mx-auto max-w-[680px]">
      {cat === "qa" && (
        <WriteClient role={role} myDoctor={myDoctor} doctors={doctors} displayName={displayName} initialCategory="qa" />
      )}
      {/* 시술기록(노트)은 비공개라 비로그인도 폼은 열림 — 저장 시 API 401 → "로그인 후 저장" 토스트로 안내. */}
      {cat === "시술기록" && <DiaryForm toast={(m) => showToast(m)} go={() => { void router.push("/record"); }} procedures={procedures} />}
      {cat === "시술후기" && (
        isLoggedIn ? <ReviewForm procedures={procedures} handle={handle} /> : <LoginGate />
      )}
      {cat === "끄적끄적" && (
        isLoggedIn ? (
          <WriteClient role={role} myDoctor={myDoctor} doctors={doctors} displayName={displayName} initialCategory="doodle" />
        ) : (
          <LoginGate />
        )
      )}
    </div>
  );
}
