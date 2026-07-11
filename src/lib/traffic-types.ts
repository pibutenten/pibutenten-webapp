/**
 * 유입 분석(Acquisition) 공유 타입/상수 — 서버(admin/page.tsx)·클라(TrafficPanel) 공용 SSOT.
 * (서버 모듈에서 값 import 시 클라 번들에 서버 코드가 딸려오는 문제 방지 — 순수 타입/상수만.)
 *
 * get_traffic_overview(p_days) RPC(jsonb) 반환 형태(§마이그 0357).
 */
export type TrafficOverview = {
  total: number;
  by_channel: { channel: string; count: number; pct: number }[];
  top_referrers: { host: string; count: number }[];
  top_landings: { path: string; count: number }[];
  by_device: { device: string; count: number }[];
  by_os: { os: string; count: number }[];
  by_in_app: { in_app: string; count: number }[];
  by_campaign: { campaign: string; source: string | null; count: number }[];
  daily: { d: string; count: number }[];
};

export const EMPTY_TRAFFIC: TrafficOverview = {
  total: 0,
  by_channel: [],
  top_referrers: [],
  top_landings: [],
  by_device: [],
  by_os: [],
  by_in_app: [],
  by_campaign: [],
  daily: [],
};

/**
 * 구글 서치콘솔 상위 검색어 1행 — 서버(search-console.ts·admin/page.tsx)·클라(SearchConsolePanel) 공용.
 * search-console.ts 는 server-only 라 클라(SearchConsolePanel)가 값/타입 import 불가 → 여기(클라 안전)로 통합.
 * ctr 은 0~1 비율.
 */
export type ScRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
