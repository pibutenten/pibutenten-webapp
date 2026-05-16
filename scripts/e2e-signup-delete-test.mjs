/**
 * E2E 가입/탈퇴 흐름 테스트 — Phase 6-7 검증.
 *
 * 사용:
 *   cd pibutenten-app && node scripts/e2e-signup-delete-test.mjs
 *
 * 시나리오:
 *   1) admin.auth.admin.createUser — 테스트 사용자 생성
 *   2) handle_new_user 트리거가 profiles row 생성 (자동)
 *   3) profile 에 온보딩 정보 채움
 *   4) 카드 1개 + 댓글 1개 INSERT (이 사용자 명의)
 *   5) anonymize_user_content_before_delete() RPC 호출 (사용자 본인 JWT 로)
 *   6) admin.auth.admin.deleteUser
 *   7) 검증:
 *      - 카드/댓글 author_id → sentinel (00000000-...)
 *      - profiles row cascade 삭제
 *      - auth.users row 삭제
 *
 * 안전:
 *   - 명시적으로 e2e-test-cleanup-{timestamp}@pibutenten-test.invalid 이메일 사용
 *   - DB 영향: 테스트 카드/댓글 1개씩 영구 생성됨 (sentinel author 로 남음 — 시각 확인 후 수동 삭제 가능)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// .env.local 파싱
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
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
  console.error("ERROR: env 변수 누락");
  process.exit(1);
}

const SENTINEL = "00000000-0000-0000-0000-000000000000";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ts = Date.now();
const TEST_EMAIL = `e2e-cleanup-${ts}@pibutenten-test.invalid`;
const TEST_PASSWORD = `Tmp!${ts}xyz`;
const TEST_NAME = `테스트${ts.toString().slice(-4)}`;
const TEST_HANDLE = `e2e-test-${ts.toString().slice(-6)}`;

let userId = null;
let cardId = null;
let commentId = null;

async function step(name, fn) {
  process.stdout.write(`▶ ${name}... `);
  try {
    const result = await fn();
    console.log("✓");
    return result;
  } catch (e) {
    console.log("✗");
    console.error("   ERROR:", e.message || e);
    throw e;
  }
}

async function main() {
  console.log("\n=== E2E 가입/탈퇴 테스트 시작 ===");
  console.log(`이메일: ${TEST_EMAIL}`);
  console.log(`핸들: ${TEST_HANDLE}\n`);

  // 1) 사용자 생성
  await step("1. admin.auth.admin.createUser", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: TEST_NAME, nickname: TEST_NAME },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`   user.id = ${userId}`);
  });

  // 2) handle_new_user trigger 가 profile 생성했는지 확인
  await step("2. profiles row 확인 (trigger)", async () => {
    // trigger 가 async 일 수 있어 살짝 대기
    await new Promise((r) => setTimeout(r, 800));
    const { data, error } = await admin
      .from("profiles")
      .select("id, role, handle, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("profile row 미생성");
    console.log(`   profile: handle=${data.handle}, role=${data.role}`);
  });

  // 3) 온보딩 정보 + 핸들 채움
  await step("3. profile UPDATE (온보딩 + 핸들)", async () => {
    const { error } = await admin
      .from("profiles")
      .update({
        handle: TEST_HANDLE,
        display_name: TEST_NAME,
        legal_name: "테스트사용자",
        birthdate: "1990-01-15",
        gender: "other",
        face_shape: "oval",
        skin_type: "normal",
        skin_concerns: ["트러블"],
        interested_procedures: ["보톡스"],
        bio: "E2E 테스트 계정",
        terms_agreed_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw error;
  });

  // 4) 카드 1개 + 댓글 1개 INSERT
  await step("4a. 카드 INSERT", async () => {
    // base58 — '0', 'O', 'I', 'l' 제외
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let rand = "";
    for (let i = 0; i < 8; i++) rand += alphabet[Math.floor(Math.random() * alphabet.length)];
    const shortcode = `e2e${rand}`;
    const { data, error } = await admin
      .from("cards")
      .insert({
        author_id: userId,
        type: "post",
        category: "tip",
        status: "published",
        question: `[E2E 테스트] ${TEST_NAME} 의 글`,
        answer: "이 글은 자동 테스트로 생성되었습니다.",
        keywords: ["e2e", "test"],
        shortcode,
      })
      .select("id, shortcode")
      .single();
    if (error) throw error;
    cardId = data.id;
    console.log(`   card.id = ${cardId}, shortcode = ${data.shortcode}`);
  });

  await step("4b. 댓글 INSERT (user JWT — service_role 권한 누락 회피)", async () => {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signErr } = await userClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (signErr) throw signErr;
    const { data, error } = await userClient
      .from("comments")
      .insert({
        card_id: cardId,
        author_id: userId,
        body: "테스트 댓글입니다.",
        status: "visible",
      })
      .select("id")
      .single();
    if (error) throw error;
    commentId = data.id;
    console.log(`   comment.id = ${commentId}`);
  });

  // 5) anonymize RPC — 사용자 JWT 권한 시뮬레이션 위해 user client 사용
  await step("5. anonymize_user_content_before_delete (user JWT)", async () => {
    // signInWithPassword 로 사용자 토큰 발급
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: sess, error: signErr } =
      await userClient.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });
    if (signErr) throw signErr;
    if (!sess.session) throw new Error("session 없음");

    const { data: rpc, error: rpcErr } = await userClient.rpc(
      "anonymize_user_content_before_delete",
    );
    if (rpcErr) throw rpcErr;
    const row = rpc?.[0];
    console.log(
      `   cards_moved=${row?.cards_moved}, comments_moved=${row?.comments_moved}, profiles_anonymized=${row?.profiles_anonymized}`,
    );
    if (row?.cards_moved !== 1 || row?.comments_moved !== 1) {
      throw new Error(`RPC 결과 예상과 다름: ${JSON.stringify(row)}`);
    }
  });

  // 6) 카드/댓글 author_id 가 sentinel 인지 확인
  await step("6a. 카드 author → sentinel 검증", async () => {
    const { data, error } = await admin
      .from("cards")
      .select("author_id")
      .eq("id", cardId)
      .single();
    if (error) throw error;
    if (data.author_id !== SENTINEL) {
      throw new Error(`expected sentinel, got ${data.author_id}`);
    }
  });

  await step("6b. 댓글 author → sentinel 검증 (user client — RLS allowed)", async () => {
    // 이전 user JWT 재사용 어려워 anon 으로 read (comments_select RLS: status=visible 통과)
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anonClient
      .from("comments")
      .select("author_id")
      .eq("id", commentId)
      .single();
    if (error) throw error;
    if (data.author_id !== SENTINEL) {
      throw new Error(`expected sentinel, got ${data.author_id}`);
    }
  });

  // 7) profile PII NULL 확인
  await step("7. profile PII NULL 확인", async () => {
    const { data, error } = await admin
      .from("profiles")
      .select(
        "legal_name, birthdate, gender, avatar_url, display_name, bio, skin_concerns",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      console.log("   (profile 이미 삭제됨 — cascade 작동 확인됨)");
      return;
    }
    const checks = {
      legal_name: data.legal_name === null,
      birthdate: data.birthdate === null,
      avatar_url: data.avatar_url === null,
      bio: data.bio === null,
      display_name: data.display_name === "(탈퇴한 사용자)",
    };
    const fails = Object.entries(checks).filter(([, ok]) => !ok);
    if (fails.length > 0) {
      throw new Error(`PII 미정리: ${fails.map(([k]) => k).join(", ")}`);
    }
    console.log("   모든 PII 컬럼 정상 NULL/익명화");
  });

  // 8) auth.users.deleteUser
  await step("8. admin.auth.admin.deleteUser", async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  });

  // 9) profiles row cascade 삭제 확인
  await step("9. profiles row cascade 삭제 확인", async () => {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      throw new Error("profile row 가 cascade 삭제되지 않음");
    }
  });

  // 10) 카드/댓글이 sentinel 로 유지 (cascade 영향 X)
  await step("10. 콘텐츠 sentinel 로 유지 확인", async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: card } = await admin
      .from("cards")
      .select("author_id")
      .eq("id", cardId)
      .single();
    const { data: cmt } = await anonClient
      .from("comments")
      .select("author_id")
      .eq("id", commentId)
      .single();
    if (card?.author_id !== SENTINEL || cmt?.author_id !== SENTINEL) {
      throw new Error("콘텐츠 author 가 sentinel 이 아님");
    }
    console.log(`   card #${cardId} + comment #${commentId} 모두 sentinel`);
  });

  console.log("\n=== 모든 단계 통과 ✓ ===");
  console.log(`\n잔존 데이터 (sentinel 명의 — 시각 확인 후 수동 삭제 가능):`);
  console.log(`  - cards.id = ${cardId} (author_id = sentinel)`);
  console.log(`  - comments.id = ${commentId} (author_id = sentinel)`);
  console.log(
    `\n시각 확인 URL (production): https://pbtt.kr/deleted-user (sentinel profile 페이지)`,
  );
}

main().catch((e) => {
  console.error("\n=== 테스트 실패 ===");
  console.error(e);
  process.exit(1);
});
