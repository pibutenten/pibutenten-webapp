"use client";

/**
 * DiaryEditView — /notes/[id]/edit 회원 시술노트 편집 본문(클라이언트, C4).
 *
 *  - DiaryForm(memberEditVisitId, memberInitial) 재사용 — 편집 분기는 PATCH /api/visits/{id}.
 *    후기 작성 UI 는 편집 모드에서 숨겨지고(diary 필드·시술목록만), 이탈 가드(뒤로·새로고침·내비 Link)는
 *    DiaryForm 내부 useUnsavedChangesGuard 가 자체 모달로 처리한다.
 *  - source='clinic' 노트는 병원 지점 스냅샷이 읽기전용(DiaryForm 이 병원 검색을 숨김) — DB(0353) 보존과 일관.
 *  - 저장 성공(onMemberSaved) 시 상세(/notes/{id})로 복귀 + 토스트. 삭제는 상세 페이지(DiaryDetailView)에서.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/skin/AppShell";
import styles from "@/components/skin/app.module.css";
import { DiaryForm, type MemberInitial } from "@/components/skin/record/SkinDiaryForms";
import type { ProcedureOption } from "@/app/review/new/ReviewForm";
import { showToast } from "@/lib/toast";

export default function DiaryEditView({
  visitId,
  initial,
  procedures,
}: {
  visitId: number;
  initial: MemberInitial;
  procedures: ProcedureOption[];
}) {
  const router = useRouter();
  const backHref = `/notes/${visitId}`;

  return (
    /* backHeader 미적용(R2-3 의도 제외): 이 화면의 폼(SkinDiaryForms)은 이탈 경고 가드
       (useUnsavedChangesGuard)를 상시 무장 — 셸 헤더의 plain 뒤로가기는 가드를 우회해
       입력 유실 위험. 폼 헤더 전환은 가드 연동 설계와 함께 후속. */
    <AppShell active="내 노트">
      <div className={styles.detailHead}>
        <Link href={backHref} className={styles.detailBack} aria-label="시술 기록으로 돌아가기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className={styles.detailTitle}>시술 기록 수정</h1>
      </div>

      <DiaryForm
        key={visitId}
        memberEditVisitId={visitId}
        memberInitial={initial}
        procedures={procedures}
        toast={(m) => showToast(m)}
        go={() => {
          /* 회원 편집 모드 화면 전환은 onMemberSaved 가 담당(더미) */
        }}
        onMemberSaved={() => {
          // DiaryForm 이 markSubmitted() 후 콜백하므로 가드 해제 상태 — 안전하게 이동.
          showToast("시술 기록을 수정했어요");
          router.push(backHref);
          router.refresh();
        }}
      />
    </AppShell>
  );
}
