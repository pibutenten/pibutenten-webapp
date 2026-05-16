/**
 * 오늘 (2026-05-16) card_impressions 적재 현황 확인.
 *
 * 가설: 회귀 fix (impression-queue.ts onConflict 변경) 가 commit f7a3f15 으로 배포된 후
 *   새 카드 노출은 정상 INSERT 되어야 함.
 * 실측 → 시간대별 분포로 어디서 적재 끊긴 건지 확인.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx), l.slice(idx + 1)];
    }),
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

console.log("=== card_impressions 시간대별 적재 (최근 36h, KST) ===");
const { data: rows, error } = await admin
  .from("card_impressions")
  .select("created_at, session_id, card_id, user_id")
  .gte("created_at", new Date(Date.now() - 36 * 3600 * 1000).toISOString())
  .order("created_at", { ascending: false });

if (error) {
  console.error("조회 실패:", error);
  process.exit(1);
}

console.log(`총 ${rows?.length ?? 0}건\n`);

// 시간대별 buckets (KST = UTC+9)
const buckets = new Map();
for (const r of rows ?? []) {
  const d = new Date(r.created_at);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const hourKey = `${kst.toISOString().slice(0, 13)}:00`;
  buckets.set(hourKey, (buckets.get(hourKey) ?? 0) + 1);
}

console.log("시간대 (KST)      | 적재 건수");
console.log("─".repeat(40));
const keys = Array.from(buckets.keys()).sort();
for (const k of keys) {
  console.log(`${k}  | ${buckets.get(k)}`);
}

// session 별 unique 계산 — 24h 방문자 추정치
const cutoff24h = Date.now() - 24 * 3600 * 1000;
const sessions24h = new Set();
for (const r of rows ?? []) {
  if (new Date(r.created_at).getTime() >= cutoff24h && r.session_id) {
    sessions24h.add(r.session_id);
  }
}
console.log(`\n최근 24h 고유 session_id (≈ 방문자) : ${sessions24h.size}`);

// 마지막 적재
if (rows && rows.length > 0) {
  console.log(`\n가장 최근 INSERT: ${rows[0].created_at} (session=${rows[0].session_id?.slice(0, 8)})`);
}
