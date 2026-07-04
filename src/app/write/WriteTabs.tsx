"use client";

// 탭 매핑(2026-06-27 교정): "시술기록"=DiaryForm(시술노트, POST /api/visits), "시술후기"=ReviewForm
//   (시술 선택+평가+단답+어림시기, POST /api/reviews) — /review/new 와 같은 폼 재사용. 끄적끄적·Q&A 는
//   기존 WriteClient 그대로.
//   (이전엔 "시술후기"가 DiaryForm reviewOnly 로 잘못 합쳐져 가격·병원을 묻던 것을 ReviewForm 으로 교체.)
//
// ★FIX-3: 비로그인 정책 통일 — "글쓰기 전체 로그인 필요"로 확정(정책 (b)).
//   유일 호출자 WriteView 가 !isLoggedIn 일 때 전 탭을 로그인 게이트로 막고 WriteTabs 자체를
//   렌더하지 않으므로, WriteTabs 는 항상 isLoggedIn=true 로 진입한다. 따라서 기존의
//   "시술기록은 비로그인도 폼 열림", LoginGate, 비로그인 분기는 전부 도달 불가 죽은 코드였다.
//   이를 제거해 두 컴포넌트의 정책 모순을 해소한다(저장 시 401 토스트는 DiaryForm 에 잔존 —
//   직접 API 호출 방어용 심층 방어).
import { useRouter } from "next/navigation";
import { DiaryForm } from "@/components/skin/record/SkinDiaryForms";
import ReviewForm, { type ProcedureOption } from "../review/new/ReviewForm";
import type { ShortAnswerQuestion } from "@/components/review/ShortAnswerFields";
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
  handle,
  initialProcedure,
  shortAnswerQuestions,
  onDirtyChange,
}: {
  tab?: string;
  isLoggedIn: boolean;
  role: "admin" | "doctor" | "user";
  displayName: string;
  myDoctor: { slug: string; name: string } | null;
  doctors: Doctor[];
  procedures: ProcedureOption[];
  /** 시술후기(ReviewForm) 제출 성공 시 사용하는 active 명함 handle. */
  handle?: string;
  /** 시술노트 저장 후 후기 유도 시 미리 정해진 시술 ko (?proc=). */
  initialProcedure?: string;
  /** 단답 질문 풀(question_pool timepoint='any', is_active) — 시술후기 탭 ReviewForm 단답 2칸용. */
  shortAnswerQuestions?: ShortAnswerQuestion[];
  /** R2-2: 현재 폼의 dirty 여부 보고 — WriteView 가 탭 전환 시 이탈 확인 모달에 사용. */
  onDirtyChange?: (dirty: boolean) => void;
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
        <WriteClient role={role} myDoctor={myDoctor} doctors={doctors} displayName={displayName} initialCategory="qa" onDirtyChange={onDirtyChange} />
      )}
      {/* 시술기록(노트) — 통합 visit 폼(DiaryForm). 일기·시점별 경과는 본 작업 범위 밖(무수정). */}
      {cat === "시술기록" && <DiaryForm toast={(m) => showToast(m)} go={() => { void router.push("/notes"); }} procedures={procedures} initialProcedure={initialProcedure} onDirtyChange={onDirtyChange} />}
      {/* 시술후기 — 후기 전용 폼(ReviewForm). /review/new 와 같은 폼 재사용(시술 선택+평가+단답+어림시기).
          가격·병원 등 visit 메타는 묻지 않음. 제출 성공 시 ReviewForm 이 자체적으로 "/" 로 이동·refresh. */}
      {cat === "시술후기" && (
        <ReviewForm
          procedures={procedures}
          handle={handle ?? ""}
          initialProcedure={initialProcedure}
          shortAnswerQuestions={shortAnswerQuestions}
          onDirtyChange={onDirtyChange}
        />
      )}
      {cat === "끄적끄적" && (
        <WriteClient role={role} myDoctor={myDoctor} doctors={doctors} displayName={displayName} initialCategory="doodle" onDirtyChange={onDirtyChange} />
      )}
    </div>
  );
}
