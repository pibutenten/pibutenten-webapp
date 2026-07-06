/**
 * form-styles — 폼 공통 Tailwind 클래스 상수 (SSOT).
 *
 * SkinDiaryForms.tsx 의 인라인 상수를 추출했습니다(병원계정 B2, 2026-07-06).
 * 시술노트 폼(DiaryForm)·병원 대행입력 화면 등 폼 계열 컴포넌트가 공유합니다.
 *
 * 규칙:
 *  - 색은 globals.css CSS 변수만 사용합니다(하드코딩 금지). 그림자 미사용.
 *  - text-[16px]: iOS 사파리가 16px 미만 input 포커스 시 자동 줌하는 것을 막는 최소 크기입니다.
 */

/** 기본 input — 풀폭. */
export const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-[16px] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-0";

/** 소형 input — 행 내부 보조 입력(폭은 호출측이 지정). */
export const inputSm =
  "rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[16px] focus:border-[var(--primary)] focus:outline-none focus:ring-0";

/** textarea — 풀폭, 세로 리사이즈 허용. */
export const textareaCls =
  "w-full resize-y rounded-md border border-[var(--border)] bg-white p-3 text-[16px] leading-[1.6] focus:border-[var(--primary)] focus:outline-none focus:ring-0";

/** 필드 라벨 — "필수/선택" 글자 라벨은 표기하지 않습니다(2026-05-23 정책, 검증만). */
export const labelCls = "mb-2 block text-sm font-semibold text-[var(--text)]";
