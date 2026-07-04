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
 * baseline 허용 목록 (migration-naming-baseline.json):
 *   pre-commit 배선(2026-07-04) 시점에 이미 존재하던 위반 파일을 등재.
 *   등재 파일만으로 구성된 기존 위반은 WARN 강등, 신규 파일이 만드는 위반만 FAIL.
 *   신규 파일을 목록에 추가해 통과시키는 것 금지(위반 자체를 만들지 말 것).
 *
 * 사용:
 *   node scripts/check-migration-naming.mjs
 *
 * CI 통합: package.json scripts 에 추가 후 vercel.json prebuild 또는 GitHub Actions 에서 실행.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");
const BASELINE_PATH = join(__dirname, "migration-naming-baseline.json");

let baseline = new Set();
try {
  baseline = new Set(JSON.parse(readFileSync(BASELINE_PATH, "utf8")).files);
  // 우회 방지 가드(검수 제안 2026-07-04): baseline 은 캡처 시점 30개 고정이 규약 —
  // 늘어나 있으면 누군가 신규 파일을 허용 목록에 넣었다는 신호. 차단은 아니되 눈에 띄게.
  const BASELINE_CAPTURED_COUNT = 30;
  if (baseline.size > BASELINE_CAPTURED_COUNT) {
    console.warn(
      `[WARN] baseline 파일 수 ${baseline.size} > 캡처 시점 ${BASELINE_CAPTURED_COUNT} — 신규 위반을 허용 목록에 넣지 않았는지 확인`,
    );
  }
} catch {
  console.warn(
    `[WARN] baseline 파일 없음/파싱 실패 (${BASELINE_PATH}) — 전체 파일을 신규로 간주`,
  );
}
function isBaselined(file) {
  return baseline.has(file);
}

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
    const newcomers = list.filter((f) => !isBaselined(f));
    // 신규 파일이 끼어 있을 때만 차단. 전원 baseline 이면 기존 위반 → 경고.
    const blocking = recent && newcomers.length > 0;
    const tag = blocking ? "ERROR" : "WARN ";
    const suffix = recent && !blocking ? " — baseline 허용 (기존 위반)" : "";
    console[blocking ? "error" : "warn"](
      `[${tag}] 동일 번호 ${num} 충돌 (${list.length}개)${suffix}:`,
    );
    for (const f of list)
      console[blocking ? "error" : "warn"](
        `  - ${f}${blocking && !isBaselined(f) ? "  ← 신규" : ""}`,
      );
    if (blocking) errors++;
    else warnings++;
  }
}

// 2. .template 박제 검사 (옛 파일도 차단 권장이나 0115 는 사용자 결정 필요 → 경고)
for (const file of files) {
  if (file.endsWith(".sql.template")) {
    const num = fileNumber(file);
    const recent = isRecent(num) && !isBaselined(file);
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
  // baseline 등재 파일의 기존 위반은 경고 강등 (신규 파일만 차단)
  const grandfathered = isBaselined(file);
  const tag = grandfathered ? "WARN " : "ERROR";
  const log = grandfathered ? "warn" : "error";
  const suffix = grandfathered ? " — baseline 허용 (기존 위반)" : "";

  const lower = file.toLowerCase();
  for (const kw of BANNED_KEYWORDS) {
    if (lower.includes(kw)) {
      console[log](`[${tag}] 금지 키워드 "${kw}" 포함: ${file}${suffix}`);
      console[log](`  → 마이그레이션 이름은 "무엇이 바뀌는지" 만 표현하세요`);
      if (grandfathered) warnings++;
      else errors++;
    }
  }
  for (const name of BANNED_PERSON_NAMES) {
    if (lower.includes(name)) {
      console[log](`[${tag}] 사람 이름 포함: ${file}${suffix}`);
      console[log](
        `  → 일회성 데이터 수정은 supabase/migrations/ 가 아닌 data-patches/ 로 이동하세요`,
      );
      if (grandfathered) warnings++;
      else errors++;
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
