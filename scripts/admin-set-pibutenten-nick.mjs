/**
 * 관리자 계정 (@pibutenten) display_name 을 '피부텐텐' 으로 변경 (2026-05-16).
 *
 * 사용:
 *   cd pibutenten-app && node scripts/admin-set-pibutenten-nick.mjs
 *
 * 정책: role='admin' 그대로 유지. display_name 만 갱신.
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

const { data: rows, error } = await admin
  .from("profiles")
  .select("id, handle, display_name, role")
  .eq("handle", "pibutenten");

if (error) {
  console.error("조회 실패:", error);
  process.exit(1);
}

if (!rows || rows.length === 0) {
  console.error("@pibutenten profile 없음");
  process.exit(1);
}

console.log("대상:", rows);

const { error: upErr } = await admin
  .from("profiles")
  .update({ display_name: "피부텐텐" })
  .eq("handle", "pibutenten");

if (upErr) {
  console.error("업데이트 실패:", upErr);
  process.exit(1);
}

const { data: after } = await admin
  .from("profiles")
  .select("id, handle, display_name, role")
  .eq("handle", "pibutenten");

console.log("\n완료:", after);
