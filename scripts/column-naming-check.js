#!/usr/bin/env node
/**
 * Pre-commit column-naming check — ADR 0014 자동 준수 강제.
 *
 * 목적: profiles.id 를 가리키는 컬럼 명명 규칙 위반을 staging 단계에서 차단.
 *  - cards/comments 테이블 쿼리에서 user_id 참조 → 차단 (author_id 여야 함)
 *  - 그 외 테이블에 신규 user_id 컬럼 참조 추가 → 경고 (profile_id 권장)
 *  - *.tmp.* 파일 staging → 차단 (Windows + Dropbox sync 잔재 방지)
 *
 * 우회: 정당한 false positive 인 경우 `git commit --no-verify` 로 우회 가능.
 *       단 우회 사유는 commit message 본문에 명시 권장.
 *
 * 패턴 (정규식 단순화 — 의도적):
 *   차단 패턴 A — cards/comments 에서 user_id:
 *     .from("cards") 또는 .from("comments") 뒤에 .select() 또는 .eq() 또는
 *     .update() 또는 .insert() 인자에 "user_id" 문자열 등장.
 *     단순 패턴 매칭이라 PostgREST 가 아닌 다른 곳의 user_id 일 수도 — false
 *     positive 시 ADR 0014 § 6 마이그 번호 표 참조 후 --no-verify 또는 hook
 *     본 파일 PATTERN_A_WHITELIST 에 등록.
 *
 *   경고 패턴 B — 새 SQL 파일 (supabase/migrations/*.sql) 에 user_id 컬럼 신규 정의:
 *     'CREATE TABLE ... user_id ...' 또는 'ADD COLUMN user_id'.
 *
 *   차단 패턴 C — *.tmp.* 파일이 staging 된 경우.
 *
 * 사용처: simple-git-hooks 의 pre-commit (secret-scan 직후).
 * 수동 실행: `npm run column-naming-check`
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// ─── 패턴 A: cards/comments 테이블에서 user_id 참조 ──────────────────────────
//
// 정규식: .from("cards") 또는 .from("comments") 호출 후 400자 윈도 안에 user_id
// (단어 경계) 등장. AST 파싱 없이 줄 단위 매칭. 의도적 단순함 (운영 부담 0).
//
// 2026-05-29 보정 (Phase 5):
//   1) `\buser_id\b` 는 본래 `auth_user_id` 와 매칭 안 됨 (`_` 와 `u` 사이 word
//      boundary 없음) — 이 부분은 false alarm 아니었음.
//   2) 진짜 false positive 는 .from("comments") 윈도 안 **주석** ("// card_likes/
//      saves.user_id → profile_id" 같은 마이그 이력 안내) 매칭. 해결: 매칭 전에
//      줄 주석 (`// ...`) + 블록 주석 (`/* ... */`) 을 먼저 제거 (stripComments).
//
// 매칭 예 (차단):
//   .from("comments").select("id, user_id")
//   .from("cards").eq("user_id", ...)
//
// 매칭 안 됨 (의도):
//   .from("card_likes").eq("user_id", ...) — card_likes 는 패턴 외 (정상)
//   // ... user_id ...                     — 주석은 사전 제거됨
//   auth_user_id: string                   — \b 가 _u 사이에 없어서 매칭 X
const PATTERN_A_FILE_TYPES = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PATTERN_A_REGEX =
  /\.from\(\s*['"`](cards|comments)['"`]\s*\)[\s\S]{0,400}?\buser_id\b/m;

/** 줄 주석 + 블록 주석 제거 (인용부호 안 //, /* 는 그대로 두는 단순 휴리스틱). */
function stripComments(src) {
  // 블록 주석 제거
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // 줄 주석 제거 (인용부호 안의 // 까지 잘릴 수 있으나, false positive 회피가
  // 본 hook 의 더 큰 가치라 허용. 실제 코드에서 .from("...") 내부에 // 가 들어가는
  // 경우는 사실상 없음.)
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return out;
}

// 본 파일은 hook 자체 — 본문에 user_id 정규식이 포함되어 자기 자신을 차단함. 화이트리스트.
const PATTERN_A_WHITELIST = [
  /^scripts\/column-naming-check\.js$/,
  // ADR 0014, CHANGELOG, docs/decisions 등 문서 영역은 grep 대상 외
  /^docs\//,
  /\.md$/,
];

// ─── 패턴 B: 신규 마이그레이션 SQL 에 user_id 컬럼 정의 ───────────────────────
const PATTERN_B_FILE_TYPES = /supabase\/migrations\/.*\.sql$/;
const PATTERN_B_REGEX = /\b(CREATE\s+TABLE|ADD\s+COLUMN)\b[^;]*\buser_id\b/im;

// ─── 패턴 C: *.tmp.* 파일 staging 차단 ───────────────────────────────────────
const PATTERN_C_REGEX = /\.tmp\.\d/;

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

function isWhitelisted(file) {
  return PATTERN_A_WHITELIST.some((re) => re.test(file));
}

function main() {
  const staged = listStagedFiles();
  if (staged.length === 0) {
    console.log("[column-naming] no staged files. skip.");
    process.exit(0);
  }

  const blockers = []; // 차단
  const warnings = []; // 경고 (차단 X)

  for (const file of staged) {
    // 패턴 C — *.tmp.* 파일은 무조건 차단 (화이트리스트도 무시)
    if (PATTERN_C_REGEX.test(file)) {
      blockers.push({
        file,
        rule: "C",
        msg: ".tmp.* 임시 파일은 commit 불가 (Windows + Dropbox sync 잔재 차단).",
      });
      continue;
    }

    if (isWhitelisted(file)) continue;

    const absPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(absPath)) continue;

    let content;
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch {
      continue; // 바이너리 skip
    }

    // 패턴 A — cards/comments 에서 user_id (TS/JS 파일만)
    if (PATTERN_A_FILE_TYPES.test(file)) {
      const stripped = stripComments(content);
      if (PATTERN_A_REGEX.test(stripped)) {
        blockers.push({
          file,
          rule: "A",
          msg:
            "cards/comments 테이블 쿼리에 user_id 가 포함됨. ADR 0014 위반 — author_id 사용 필수.",
        });
      }
    }

    // 패턴 B — 마이그레이션 SQL 에 user_id 컬럼 신규 정의
    if (PATTERN_B_FILE_TYPES.test(file)) {
      if (PATTERN_B_REGEX.test(content)) {
        warnings.push({
          file,
          rule: "B",
          msg:
            "신규 마이그레이션에 user_id 컬럼 정의 감지. ADR 0014 권고: profile_id 사용. RENAME 마이그면 무시.",
        });
      }
    }
  }

  if (warnings.length > 0) {
    console.warn("\n[column-naming]  Warnings (commit 계속 진행):");
    for (const w of warnings) {
      console.warn(`  - ${w.file}  [rule ${w.rule}]`);
      console.warn(`      ${w.msg}`);
    }
  }

  if (blockers.length > 0) {
    console.error("\n[column-naming] X ADR 0014 위반 — commit 차단:");
    for (const b of blockers) {
      console.error(`  - ${b.file}  [rule ${b.rule}]`);
      console.error(`      ${b.msg}`);
    }
    console.error("\n수정 방법:");
    console.error("  - 패턴 A (cards/comments user_id): user_id -> author_id 로 치환");
    console.error("  - 패턴 C (.tmp.* 파일): git reset HEAD <file> 후 파일 삭제");
    console.error("\n정당한 false positive 시 우회:");
    console.error("  git commit --no-verify");
    console.error("  단 사유를 commit body 에 명시 권장.\n");
    console.error("ADR 0014 본문 참조: docs/decisions/0014-unify-profile-id-naming.md\n");
    process.exit(1);
  }

  console.log(
    `[column-naming] OK ${staged.length} staged file(s) scanned. ADR 0014 정합 확인.`,
  );
  process.exit(0);
}

main();
