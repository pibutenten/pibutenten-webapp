/**
 * Apple Sign-in Client Secret 자동 갱신 스크립트.
 *
 * Apple 의 Client Secret(JWT)은 최대 6개월만 유효하다. 만료되면 Apple 로그인만
 * 작동을 멈추므로, GitHub Actions(.github/workflows/refresh-apple-secret.yml)가
 * 매월 1회 이 스크립트를 실행해 새 JWT 를 생성하고 Supabase 에 등록한다.
 *
 * 입력은 전부 환경변수(=GitHub Secrets). 비밀값을 코드/저장소에 두지 않는다.
 *   - APPLE_SIGNIN_KEY        : .p8 개인키 PEM 전문 (BEGIN/END PRIVATE KEY 포함)
 *   - APPLE_TEAM_ID           : Apple Developer Team ID (10자)
 *   - APPLE_KEY_ID            : Sign in with Apple Key ID (10자)
 *   - APPLE_SERVICES_ID       : 웹 Services ID (= web client_id, JWT 의 sub)
 *   - APPLE_NATIVE_BUNDLE_ID  : (선택) iOS 네이티브 Bundle ID — client_id 목록에 함께 등록
 *   - SUPABASE_ACCESS_TOKEN   : Supabase Management API 토큰
 *   - SUPABASE_PROJECT_REF    : Supabase 프로젝트 ref
 *
 * 성공 시 exit 0, 실패 시 exit 1 (Actions 가 실패로 표시 → 알림).
 * 비밀값(JWT/키)은 절대 stdout 에 출력하지 않는다.
 */
import crypto from "crypto";

const {
  APPLE_SIGNIN_KEY,
  APPLE_TEAM_ID,
  APPLE_KEY_ID,
  APPLE_SERVICES_ID,
  APPLE_NATIVE_BUNDLE_ID,
  SUPABASE_ACCESS_TOKEN,
  SUPABASE_PROJECT_REF,
} = process.env;

function fail(msg) {
  console.error(`[refresh-apple-secret] ERROR: ${msg}`);
  process.exit(1);
}

// 1) 필수 env 검증
const required = {
  APPLE_SIGNIN_KEY,
  APPLE_TEAM_ID,
  APPLE_KEY_ID,
  APPLE_SERVICES_ID,
  SUPABASE_ACCESS_TOKEN,
  SUPABASE_PROJECT_REF,
};
const missing = Object.entries(required)
  .filter(([, v]) => !v || !String(v).trim())
  .map(([k]) => k);
if (missing.length > 0) fail(`필수 환경변수 누락: ${missing.join(", ")}`);

// 2) .p8 키 정규화 — GitHub Secret 주입 시 리터럴 \n / Windows \r 혼입을 모두 복원
if (!APPLE_SIGNIN_KEY.includes("-----BEGIN")) {
  fail("APPLE_SIGNIN_KEY 가 PEM 형식이 아님 (-----BEGIN PRIVATE KEY----- 누락)");
}
const pem = APPLE_SIGNIN_KEY.replace(/\\n/g, "\n").replace(/\r/g, "");

// 3) JWT(ES256) 생성 — Apple Client Secret 규격
const now = Math.floor(Date.now() / 1000);
const exp = now + 15552000; // 180일 (Apple 최대 6개월 한도 내)
const b64 = (s) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let jwt;
try {
  const header = b64(JSON.stringify({ alg: "ES256", kid: APPLE_KEY_ID }));
  const payload = b64(
    JSON.stringify({
      iss: APPLE_TEAM_ID,
      iat: now,
      exp,
      aud: "https://appleid.apple.com",
      sub: APPLE_SERVICES_ID,
    }),
  );
  const input = `${header}.${payload}`;
  const key = crypto.createPrivateKey(pem);
  const sig = crypto.sign("SHA256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  jwt = `${input}.${b64(sig)}`;
} catch (e) {
  fail(`JWT 생성 실패: ${e instanceof Error ? e.message : e}`);
}

// 4) Supabase Auth config 갱신 (Management API)
const clientIds = [APPLE_SERVICES_ID, APPLE_NATIVE_BUNDLE_ID]
  .filter((v) => v && String(v).trim())
  .join(",");

let res;
try {
  res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_apple_enabled: true,
      external_apple_client_id: clientIds,
      external_apple_secret: jwt,
    }),
  });
} catch (e) {
  fail(`Supabase API 호출 실패: ${e instanceof Error ? e.message : e}`);
}

if (!res.ok) {
  // 응답 본문은 민감값 echo 가능성을 배제할 수 없어 status code 만 로깅.
  //   (401=토큰 문제, 400=요청 바디 문제, 5xx=Supabase 측 — status 로 진단 충분)
  fail(`Supabase API 응답 오류 (status ${res.status})`);
}

// 5) 성공 — 비밀값 미노출, 메타만 출력
const j = await res.json().catch(() => ({}));
console.log("[refresh-apple-secret] OK");
console.log("  external_apple_enabled:", j.external_apple_enabled);
console.log("  external_apple_client_id:", j.external_apple_client_id);
console.log("  secret_set:", typeof j.external_apple_secret === "string" && j.external_apple_secret.length > 0);
console.log("  new_secret_expires_utc:", new Date(exp * 1000).toISOString());
