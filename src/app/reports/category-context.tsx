"use client";

/**
 * ReportsCategoryContext — /reports 공유 layout(ReportsShell)이 들고 있는 카테고리 필터 상태를
 * 자식 페이지(허브 page / 시술 상세)가 읽도록 전달하는 컨텍스트.
 *
 * 사이드바 칩 클릭(onCategory)은 ReportsShell 에서 처리되고, 그 결과 선택 슬러그(null=전체)를
 * 이 Provider 가 내려보낸다. 자식은 useReportsCategory() 로 현재 필터를 구독해 목록을 거른다.
 */

import { createContext, useContext } from "react";
import type { ProcedureSlug } from "@/lib/categories";

export const ReportsCategoryContext = createContext<ProcedureSlug | null>(null);

export const useReportsCategory = () => useContext(ReportsCategoryContext);
