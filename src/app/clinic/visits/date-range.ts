/**
 * 병원 대장 기본 기간 헬퍼 — page.tsx(서버) · ClinicVisitsView(클라) 공유 SSOT.
 *   'use client' 없는 순수 유틸이라 서버/클라 양쪽에서 import 가능. 두 파일에 중복 정의돼 있던
 *   last3MonthsRange 를 여기로 통합(중복 로직 제거·규칙 드리프트 차단 — 코드검수 반영).
 */

/**
 * 오늘 포함 최근 3개월(오늘-3개월 ~ 오늘) "YYYY-MM-DD" 범위 — KST(UTC+9) 오늘 기준, 미래 미포함.
 *   초기 SSR 기본 기간(page.tsx)과 클라 activeQuick('최근 3개월', ClinicVisitsView)이 이 단일 소스로 항상 일치.
 */
export function last3MonthsRange(): { from: string; to: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST(UTC+9)
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const fromD = new Date(to);
  fromD.setUTCMonth(fromD.getUTCMonth() - 3);
  const fmt = (dt: Date): string =>
    `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
      dt.getUTCDate(),
    ).padStart(2, "0")}`;
  return { from: fmt(fromD), to: fmt(to) };
}
