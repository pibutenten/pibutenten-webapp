/**
 * 시스템 프롬프트 파일 로더 — `src/lib/ai/prompts/*.md` 를 process.cwd() 기준으로 읽기.
 *
 * Next.js 서버 환경에서 app 루트가 cwd 가 되므로 두 가지 후보 경로를 시도:
 *  1. <cwd>/src/lib/ai/prompts/<filename>
 *  2. <cwd>/pibutenten-app/src/lib/ai/prompts/<filename>  (monorepo 루트에서 실행 시)
 *
 * 파일별 내용은 module-level Map 에 캐시 — 동일 프로세스 내 중복 I/O 방지.
 */

import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

export function loadSystemPrompt(filename: string): string {
  const cached = cache.get(filename);
  if (cached) return cached;

  const candidates = [
    path.join(process.cwd(), "src/lib/ai/prompts", filename),
    path.join(process.cwd(), "pibutenten-app/src/lib/ai/prompts", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      cache.set(filename, content);
      return content;
    }
  }
  throw new Error(
    `${filename} not found (tried: ${candidates.join(", ")})`,
  );
}
