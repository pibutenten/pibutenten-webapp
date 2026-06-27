"use client";

// 후기·시술일기 통합(Phase 3b): "시술기록"·"시술후기" 둘 다 통합 visit 폼(DiaryForm → POST /api/visits)으로 수렴.
//   "시술후기"는 같은 폼을 reviewOnly 로 시작(병원·방문 블록 접힘). 끄적끄적·Q&A 는 기존 WriteClient 그대로.
//
// ★FIX-3: 비로그인 정책 통일 — "글쓰기 전체 로그인 필요"로 확정(정책 (b)).
//   유일 호출자 WriteView 가 !isLoggedIn 일 때 전 탭을 로그인 게이트로 막고 WriteTabs 자체를
//   렌더하지 않으므로, WriteTabs 는 항상 isLoggedIn=true 로 진입한다. 따라서 기존의
//   "시술기록은 비로그인도 폼 열림", LoginGate, 비로그인 분기는 전부 도달 불가 죽은 코드였다.
//   이를 제거해 두 컴포넌트의 정책 모순을 해소한다(저장 시 401 토스트는 DiaryForm 에 잔존 —
//   직접 API 호출 방어용 심층 방어).
import { useRouter } from "next/navigation";
import { DiaryForm } from "@/components/skin/record/SkinDiaryForms";
import { type ProcedureOption } from "../review/new/ReviewForm";
// 끄적끄적은 기존 글쓰기 컴포넌트(WriteClient)를 그대로 사용.
import WriteClient from "./WriteClient";
import { showToast } from "@/lib/toast";

type Doctor = { id: string; slug: string; name: string; branch: string | null };

// 탭은 BottomNav 헤더(2차 바)에서 URL ?tab= 으로 전환 — 여기선 그 값으로 폼만 렌더.
export default function WriteTabs({
  tab,
  isLoggedIn,
  role,
  displayName,
  myDoctor,
  doctors,
  procedures,
  initialProcedure,
}: {
  tab?: string;
  isLoggedIn: boolean;
  role: "admin" | "doctor" | "user";
  displayName: string;
  myDoctor: { slug: string; name: string } | null;
  doctors: Doctor[];
  procedures: ProcedureOption[];
  /** 통합 후기 제출 후 이동 등에 쓰이는 active 명함 handle(현재 미사용, 호출 호환 유지). */
  handle?: string;
  /** 시술노트 저장 후 후기 유도 시 미리 정해진 시술 ko (?proc=). */
  initialProcedure?: string;
}) {
  const router = useRouter();
  // Q&A 탭은 원장·관리자 전용. 권한 없는 사용자가 ?tab=qa 로 들어오면 기본(시술기록)으로.
  const canQa = isLoggedIn && (role === "admin" || role === "doctor");
  const cat =
    tab === "qa" ? (canQa ? "qa" : "시술기록")
    : tab === "review" ? "시술후기"
    : tab === "doodle" ? "끄적끄적"
    : "시술기록";
  // ★FIX-3: 로그인은 유일 호출자 WriteView 가 이미 강제(전 탭 게이트). 여기 도달 = 로그인 확정.
  //   탭별 비로그인 분기·LoginGate 제거 — 정책 (b)"글쓰기 전체 로그인 필요"로 일관 적용.
  return (
    <div className="mx-auto max-w-[680px]">
      {cat === "qa" && (
        <WriteClient role={role} myDoctor={myDoctor} doctors={doctors} displayName={displayName} initialCategory="qa" />
      )}
      {/* 시술기록(노트) — 통합 visit 폼. */}
      {cat === "시술기록" && <DiaryForm toast={(m) => showToast(m)} go={() => { void router.push("/notes"); }} procedures={procedures} initialProcedure={initialProcedure} />}
      {/* 시술후기 — 통합 visit 폼을 reviewOnly 로(병원·방문 접힘). */}
      {cat === "시술후기" && (
        <DiaryForm toast={(m) => showToast(m)} go={() => { void router.push("/notes"); }} procedures={procedures} reviewOnly initialProcedure={initialProcedure} />
      )}
      {cat === "끄적끄적" && (
        <WriteClient role={role} myDoctor={myDoctor} doctors={doctors} displayName={displayName} initialCategory="doodle" />
      )}
    </div>
  );
}
