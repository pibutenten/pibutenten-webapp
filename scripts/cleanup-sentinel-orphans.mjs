/**
 * sentinel(@deleted-user) 에 연결된 잔여 cards/comments 정리 (2026-05-16).
 *
 * 정책:
 *  - profiles row (id = 00000000-...) 는 **보존** (system row — 향후 탈퇴 처리 sentinel)
 *  - 가리키는 cards/comments 만 삭제 (E2E 테스트 잔여)
 *
 * 사용:
 *   cd pibutenten-app && node scripts/cleanup-sentinel-orphans.mjs            # dry-run
 *   cd pibutenten-app && node scripts/cleanup-sentinel-orphans.mjs --execute  # 실제 삭제
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

const SENTINEL = "00000000-0000-0000-0000-000000000000";
const EXECUTE = process.argv.includes("--execute");

console.log(`mode = ${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);

const { data: cards } = await admin
  .from("cards")
  .select("id, type, title, created_at")
  .eq("author_id", SENTINEL);
const { data: comments } = await admin
  .from("comments")
  .select("id, card_id, body, created_at")
  .eq("author_id", SENTINEL);

console.log(`cards 대상: ${cards?.length ?? 0}건`);
if (cards && cards.length > 0) {
  console.table(
    cards.map((c) => ({
      id: c.id,
      type: c.type,
      title: (c.title ?? "").slice(0, 30),
      created: c.created_at?.slice(0, 10),
    })),
  );
}
console.log(`\ncomments 대상: ${comments?.length ?? 0}건`);
if (comments && comments.length > 0) {
  console.table(
    comments.map((c) => ({
      id: c.id,
      card_id: c.card_id,
      body: (c.body ?? "").slice(0, 30),
      created: c.created_at?.slice(0, 10),
    })),
  );
}

if (!EXECUTE) {
  console.log("\nDRY-RUN — 진행하려면 --execute 추가.");
  process.exit(0);
}

if (comments && comments.length > 0) {
  const { error } = await admin
    .from("comments")
    .delete()
    .eq("author_id", SENTINEL);
  console.log(error ? `comments 삭제 실패: ${error.message}` : `comments ${comments.length} 건 삭제`);
}
if (cards && cards.length > 0) {
  const { error } = await admin
    .from("cards")
    .delete()
    .eq("author_id", SENTINEL);
  console.log(error ? `cards 삭제 실패: ${error.message}` : `cards ${cards.length} 건 삭제`);
}
console.log("\n완료. sentinel profile row 는 보존됨.");
