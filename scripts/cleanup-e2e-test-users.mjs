/**
 * E2E 테스트 사용자 정리 스크립트 (2026-05-16).
 *
 * 대상: profiles.handle 이 e2e-test-* 로 시작하는 row.
 *
 * 동작:
 *  - cards.author_id / comments.author_id → sentinel 이관
 *  - profiles row DELETE (auth_user_id 가 있으면 admin.auth.admin.deleteUser 도 호출)
 *
 * 사용:
 *   cd pibutenten-app && node scripts/cleanup-e2e-test-users.mjs            # dry-run
 *   cd pibutenten-app && node scripts/cleanup-e2e-test-users.mjs --execute  # 실제 삭제
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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("ERROR: env 변수 누락");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");
const SENTINEL = "00000000-0000-0000-0000-000000000000";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("=".repeat(60));
console.log(`E2E 테스트 사용자 정리 — mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
console.log("=".repeat(60));

const { data: rows, error } = await admin
  .from("profiles")
  .select("id, auth_user_id, handle, display_name, role, created_at")
  .like("handle", "e2e-test-%");

if (error) {
  console.error("profiles 조회 실패:", error);
  process.exit(1);
}

if (!rows || rows.length === 0) {
  console.log("정리할 E2E 테스트 사용자 없음.");
  process.exit(0);
}

console.log(`\n대상 ${rows.length}건:`);
console.table(
  rows.map((r) => ({
    handle: r.handle,
    name: r.display_name,
    role: r.role,
    auth_id: r.auth_user_id?.slice(0, 8) ?? "(orphan)",
    created: r.created_at?.slice(0, 10),
  })),
);

if (!EXECUTE) {
  console.log("\nDRY-RUN — 실제 삭제 안함. 진행하려면 --execute 추가.");
  process.exit(0);
}

const profileIds = rows.map((r) => r.id);
const authIds = Array.from(
  new Set(rows.map((r) => r.auth_user_id).filter(Boolean)),
);

console.log(`\n1) cards/comments author_id → sentinel 이관...`);
const { error: cardsErr, count: cardsCount } = await admin
  .from("cards")
  .update({ author_id: SENTINEL }, { count: "exact" })
  .in("author_id", profileIds);
if (cardsErr) console.error("  cards 이관 실패:", cardsErr.message);
else console.log(`  cards: ${cardsCount ?? 0} 건 이관`);

const { error: commErr, count: commCount } = await admin
  .from("comments")
  .update({ author_id: SENTINEL }, { count: "exact" })
  .in("author_id", profileIds);
if (commErr) console.error("  comments 이관 실패:", commErr.message);
else console.log(`  comments: ${commCount ?? 0} 건 이관`);

console.log(`\n2) profiles 삭제 (${profileIds.length} 건)...`);
const { error: profErr } = await admin
  .from("profiles")
  .delete()
  .in("id", profileIds);
if (profErr) console.error("  profiles 삭제 실패:", profErr.message);
else console.log(`  profiles ${profileIds.length} 건 삭제 완료`);

if (authIds.length > 0) {
  console.log(`\n3) auth.users 삭제 (${authIds.length} 건)...`);
  for (const authId of authIds) {
    const { error: delErr } = await admin.auth.admin.deleteUser(authId);
    if (delErr) {
      console.error(`  ✗ ${authId.slice(0, 8)}:`, delErr.message);
    } else {
      console.log(`  ✓ ${authId.slice(0, 8)} 삭제`);
    }
  }
} else {
  console.log(`\n3) auth.users 삭제 대상 없음 (모두 orphan profile).`);
}

console.log("\n완료.");
