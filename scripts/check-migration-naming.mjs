#!/usr/bin/env node
/**
 * Migration naming + 충돌 검사 스크립트.
 *
 * ADR 0012 운영 룰:
 *   - 동일 번호 충돌 금지 (Supabase CLI 알파벳순 처리 의존 → 신뢰성 부족)
 *   - "fix" / "hotfix" / "again" / "revert" / 사람 이름 금지 (의도 불명확)
 *   - `.template` 영구 박제 금지
 *
 * 옛 파일 (< 0164) 의 누적 누더기는 baseline squash 전까지 경고만 출력.
 * 신규 파일 (>= 0164) 부터 모든 룰 차단.
 *
 * 사용:
 *   node scripts/check-migration-naming.mjs
 *
 * CI 통합: package.json scripts 에 추가 후 vercel.json prebuild 또는 GitHub Actions 에서 실행.
 */
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

/** 본 ADR 이후 신규 파일부터 모든 룰 차단. 이전은 경고만. */
const RECENT_FILE_THRESHOLD = "0164";

const BANNED_KEYWORDS = ["_fix_", "_hotfix_", "_again", "_revert"];

// 사람 이름 패턴 — production 데이터 단건 fix 가 마이그레이션에 박힌 케이스 차단
const BANNED_PERSON_NAMES = [
  "bae_jungmin",
  "jung_hanmi",
  "kim_jongsic",
  "kimjongsic",
  "kim_sooheung",
  "lee_doyoung",
  "doyoung",
];

let errors = 0;
let warnings = 0;

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => statSync(join(MIGRATIONS_DIR, f)).isFile())
  .sort();

function fileNumber(file) {
  const match = file.match(/^(\d{4})/);
  return match ? match[1] : null;
}
function isRecent(num) {
  return num !== null && num >= RECENT_FILE_THRESHOLD;
}

// 1. 동일 번호 충돌 검사 (앞 4자리)
const numberMap = new Map();
for (const file of files) {
  const num = fileNumber(file);
  if (!num) continue;
  if (!numberMap.has(num)) numberMap.set(num, []);
  numberMap.get(num).push(file);
}
for (const [num, list] of numberMap) {
  if (list.length > 1) {
    const recent = isRecent(num);
    const tag = recent ? "ERROR" : "WARN ";
    console[recent ? "error" : "warn"](
      `[${tag}] 동일 번호 ${num} 충돌 (${list.length}개):`,
    );
    for (const f of list) console[recent ? "error" : "warn"](`  - ${f}`);
    if (recent) errors++;
    else warnings++;
  }
}

// 2. .template 박제 검사 (옛 파일도 차단 권장이나 0115 는 사용자 결정 필요 → 경고)
for (const file of files) {
  if (file.endsWith(".sql.template")) {
    const num = fileNumber(file);
    const recent = isRecent(num);
    const tag = recent ? "ERROR" : "WARN ";
    console[recent ? "error" : "warn"](
      `[${tag}] .template 영구 박제: ${file}`,
    );
    console[recent ? "error" : "warn"](
      `  → 적용 결정 시 .sql 로 rename, 폐기 결정 시 _archive/ 로 이동`,
    );
    if (recent) errors++;
    else warnings++;
  }
}

// 3. 금지 키워드 검사 (신규 파일만 — 옛 파일은 이미 production 적용됨)
for (const file of files) {
  const num = fileNumber(file);
  if (!isRecent(num)) continue;

  const lower = file.toLowerCase();
  for (const kw of BANNED_KEYWORDS) {
    if (lower.includes(kw)) {
      console.error(`[ERROR] 금지 키워드 "${kw}" 포함: ${file}`);
      console.error(`  → 마이그레이션 이름은 "무엇이 바뀌는지" 만 표현하세요`);
      errors++;
    }
  }
  for (const name of BANNED_PERSON_NAMES) {
    if (lower.includes(name)) {
      console.error(`[ERROR] 사람 이름 포함: ${file}`);
      console.error(
        `  → 일회성 데이터 수정은 supabase/migrations/ 가 아닌 data-patches/ 로 이동하세요`,
      );
      errors++;
    }
  }
}

if (warnings > 0) {
  console.warn(
    `\n[WARN] ${warnings}개 경고 (옛 누적 누더기 — baseline squash 전까지 허용)`,
  );
}

if (errors > 0) {
  console.error(
    `\n[FAIL] ${errors}개 에러 — PR 차단 (참고: docs/decisions/0012-profile-unit-complete-independence.md)`,
  );
  process.exit(1);
}

console.log(`[OK] 마이그레이션 ${files.length}개 검사 통과`);
