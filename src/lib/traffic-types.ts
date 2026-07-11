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
