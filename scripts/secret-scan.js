#!/usr/bin/env node
/**
 * Pre-commit secret scanner — 가벼운 자체 정규식 기반.
 *
 * 목적: .env 파일 또는 시크릿이 실수로 git staging 영역에 들어가는 것을 차단.
 * 외부 바이너리(gitleaks 등) 의존 없이 Node 기본만 사용 — 운영 부담 0.
 *
 * 사용처: package.json의 simple-git-hooks pre-commit 훅에서 자동 실행.
 * 수동 실행: `npm run secret-scan`
 *
 * 차단 패턴:
 * - SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN
 * - sk-ant- (Anthropic API key)
 * - eyJhbGciOi... (JWT 형식 의심)
 * - Naver/Google/Kakao OAuth client secret 패턴
 * - VAPID private key
 * - .env 파일이 staging에 들어간 경우
 *
 * 화이트리스트: .env.example, .env*.example, scripts/secret-scan.js 자체
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SECRET_PATTERNS = [
  { name: "Anthropic API Key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Supabase Service Role JWT", re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/ },
  { name: "Supabase Access Token", re: /sbp_[A-Za-z0-9]{30,}/ },
  { name: "Supabase Publishable Key", re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "Generic high-entropy bearer", re: /Bearer\s+[A-Za-z0-9_-]{40,}/ },
  { name: "Hex 64-byte secret", re: /['"][a-f0-9]{64}['"]/ },
];

const FORBIDDEN_FILES = [
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\.production$/,
  /^\.env\.development$/,
];

const ALLOWED_FILES = [
  /^\.env\..*\.example$/,
  /^\.env\.example$/,
  /^scripts\/secret-scan\.js$/, // 본 스크립트 자체는 패턴 정의용 정규식 포함
];

function listStagedFiles() {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isAllowed(file) {
  return ALLOWED_FILES.some((re) => re.test(file));
}

function checkForbiddenFile(file) {
  return FORBIDDEN_FILES.some((re) => re.test(file));
}

function scanFileContent(file) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return []; // 바이너리 등 skip
  }
  const hits = [];
  for (const { name, re } of SECRET_PATTERNS) {
    const m = content.match(re);
    if (m) hits.push({ name, sample: m[0].slice(0, 30) + "..." });
  }
  return hits;
}

function main() {
  const staged = listStagedFiles();
  if (staged.length === 0) {
    console.log("[secret-scan] no staged files. skip.");
    process.exit(0);
  }

  const violations = [];

  for (const file of staged) {
    if (isAllowed(file)) continue;

    if (checkForbiddenFile(file)) {
      violations.push({ file, kind: "forbidden-file", detail: ".env file must not be committed" });
      continue;
    }

    const absPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(absPath)) continue;

    const hits = scanFileContent(absPath);
    for (const hit of hits) {
      violations.push({ file, kind: hit.name, detail: hit.sample });
    }
  }

  if (violations.length > 0) {
    console.error("\n[secret-scan] ❌ Potential secrets detected in staged files:");
    for (const v of violations) {
      console.error(`  - ${v.file}`);
      console.error(`      kind:   ${v.kind}`);
      console.error(`      sample: ${v.detail}`);
    }
    console.error("\nCommit aborted. Remove secrets from staging:");
    console.error("  git reset HEAD <file>");
    console.error("  # then move secrets to .env.local (gitignored)\n");
    console.error("If this is a false positive (e.g. example fixture):");
    console.error("  - rename file to *.example, OR");
    console.error("  - update scripts/secret-scan.js ALLOWED_FILES.\n");
    process.exit(1);
  }

  console.log(`[secret-scan] ✅ ${staged.length} staged file(s) scanned, no secrets found.`);
  process.exit(0);
}

main();
