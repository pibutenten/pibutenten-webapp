"use client";

/**
 * ReportsCategoryContext / ReportsSortContext — /reports 공유 layout(ReportsShell)이 들고 있는
 * 필터·정렬 상태를 자식 페이지(허브 page / 시술 상세)가 읽도록 전달하는 컨텍스트.
 *
 * - 카테고리: 사이드바 칩 클릭(onCategory)을 ReportsShell 에서 처리 → 선택 슬러그(null=전체)를
 *   내려보냄. 자식은 useReportsCategory() 로 구독해 목록을 거른다.
 * - 정렬(허브 전용, 2026-07-09): 정렬 칩을 **셸 헤더 칩바 슬롯(AppShell chips)** 에 렌더해 피드처럼
 *   헤더와 한 덩어리(.topStack)로 붙여 함께 이동시키기 위해, 정렬 상태를 셸이 소유하고 이 컨텍스트로
 *   허브 본문(ReportsIndexView)에 내려준다(본문은 sort 로 목록을 정렬, setSort 로 뒤로가기 스냅샷 복원).
 *   상세(/reports/[시술])의 '후기 정렬'은 도메인이 달라(rec/high/low/new) 이 컨텍스트를 쓰지 않고 자체 소유.
 */

import { createContext, useContext } from "react";
import type { ProcedureSlug } from "@/lib/categories";

export const ReportsCategoryContext = createContext<ProcedureSlug | null>(null);

export const useReportsCategory = () => useContext(ReportsCategoryContext);

/** 허브 정렬 키 — 컴팩트 풀로 계산 가능한 5종(셸·허브 본문 공유 SSOT). */
export type SortKey = "recent" | "count" | "revisit" | "satisfaction" | "pain";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "최신순" },
  { key: "count", label: "후기 많은 순" },
  { key: "revisit", label: "재시술의향 높은 순" },
  { key: "satisfaction", label: "만족도 높은 순" },
  { key: "pain", label: "통증 적은 순" },
];

type SortCtx = { sort: SortKey; setSort: (k: SortKey) => void };

/** 기본값은 no-op — Provider(셸) 밖에서 호출될 일이 없으나 타입 안전용. */
export const ReportsSortContext = createContext<SortCtx>({
  sort: "recent",
  setSort: () => {},
});

export const useReportsSort = () => useContext(ReportsSortContext);
