"use client";

import { useCallback, useEffect, useRef } from "react";
import { saveDraft, deleteDraft, type DraftFormType } from "@/lib/draft-storage";

/**
 * 폼 데이터 자동 임시저장 — 2초 디바운스로 localStorage에 저장.
 *
 * @param formType  draft 키 구분자
 * @param isDirty   true 일 때만 저장 (false 면 타이머 비활성)
 * @param deps      변경 감지 대상 값 배열. **길이가 마운트 후 변경되면 안 됩니다.**
 * @param getFields 저장 시점에 호출해 현재 필드를 수집하는 함수
 */
export function useDraftAutoSave(
  formType: DraftFormType,
  isDirty: boolean,
  deps: unknown[],
  getFields: () => Record<string, unknown>,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const getFieldsRef = useRef(getFields);
  getFieldsRef.current = getFields;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isDirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(formType, getFieldsRef.current());
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [formType, isDirty, ...deps]);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    deleteDraft(formType);
  }, [formType]);

  return { clear };
}
