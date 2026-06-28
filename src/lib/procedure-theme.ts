/**
 * 시술 분류별 테마 색 SSOT — 리포트 카드 헤더 톤 등에서 공용 사용.
 *
 * CATEGORIES 에서 동적 조회. 미발견(null)=기본 파란 톤(var(--primary)).
 */
import { CATEGORIES } from "@/lib/categories";
import type { ProcedureCategory } from "@/lib/procedure-report";

export type CategoryTheme = {
  /** 강조 글자색 (브랜드 라벨·시술명) */
  color: string;
  /** 헤더 칸 솔리드 배경 틴트 (그라디언트 아님). null 분류는 'transparent'. */
  soft: string;
};

function hexToSoft(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.12)`;
}

export function categoryTheme(
  category: ProcedureCategory | null | undefined,
): CategoryTheme {
  const found = CATEGORIES.find((c) => c.slug === category);
  if (!found) return { color: "var(--primary)", soft: "transparent" };
  return { color: found.color, soft: hexToSoft(found.color) };
}
