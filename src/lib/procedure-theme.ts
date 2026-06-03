/**
 * 시술 분류별 테마 색 SSOT — 리포트 카드 헤더 톤 등에서 공용 사용.
 *
 * lifting=하늘(진한 톤), injectables=핑크(진한 톤), 그 외/미발견(null)=기본 파란 톤(var(--primary)).
 * 색을 못 찾으면 기존 파란 톤을 그대로 돌려준다.
 */
import type { ProcedureCategory } from "@/lib/procedure-report";

export type CategoryTheme = {
  /** 강조 글자색 (브랜드 라벨·시술명) */
  color: string;
  /** 헤더 칸 솔리드 배경 틴트 (그라디언트 아님). null 분류는 'transparent'. */
  soft: string;
};

export function categoryTheme(
  category: ProcedureCategory | null | undefined,
): CategoryTheme {
  if (category === "lifting") return { color: "#1E9FD8", soft: "#EAF5FC" };
  if (category === "injectables") return { color: "#E5689B", soft: "#FCEFF5" };
  return { color: "var(--primary)", soft: "transparent" };
}
