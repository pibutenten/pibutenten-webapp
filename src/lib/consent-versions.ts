/**
 * 동의 문서 버전 SSOT (F-1, 2026-06-04).
 *
 * 약관·개인정보 처리방침의 "버전 = 시행일자(ISO)" 를 한 곳에서 관리한다.
 *   - 가입 동의 기록: SignupForm 이 동의 시 이 상수값을 profiles.{terms,privacy}_agreed_version 에 저장.
 *   - 페이지 렌더: terms/page.tsx · privacy/page.tsx 의 "시행일자" 표기가 이 상수를 import 해서 렌더.
 *   → 문서 개정 시 이 파일의 버전 1곳만 바꾸면 페이지 표기와 신규 동의 기록 버전이 동시에 갱신된다.
 *
 * client/server 양쪽에서 import 가능 (next/headers 등 server-only 의존 없음).
 *
 * ⚠ 버전을 올리면 기존 회원의 저장된 버전과 달라진다 — 재동의 정책이 필요하면 별도 안건.
 *   백필 마이그(0223)의 리터럴 버전 문자열도 이 값과 일치해야 한다.
 */

/** 이용약관 현재 버전 (시행일자 ISO). */
export const TERMS_VERSION = "2026-05-28";

/** 개인정보 처리방침 현재 버전 (시행일자 ISO). */
export const PRIVACY_VERSION = "2026-05-19";

/** "2026-05-28" → "2026년 5월 28일" (페이지 시행일자 표기용). */
export function toKoreanDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
}

/** 시행일자 옆 괄호 안내문 (편집성 메모 — 버전과 무관하게 변경 가능). */
export const TERMS_EFFECTIVE_NOTE = "의료광고 검수 사전 고지·영구 숨김 정책 정합";
export const PRIVACY_EFFECTIVE_NOTE = "국외이전 고지 보완 · 탈퇴 절차 명문화";
