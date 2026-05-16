/**
 * Next.js Turbopack의 env 로딩이 server runtime에서 일부 변수를 누락하는 경우가 있음
 * (dev 서버 시작 시점에 inline되거나 RSC build 캐시 영향).
 *
 * 해결: process.env에 없으면 .env.local 파일을 직접 fs로 읽어 fallback.
 * 결과는 in-memory 캐시.
 *
 * 운영 (Vercel) 환경에선 process.env가 항상 채워져 있어 fallback 안 탐.
 */

import fs from "node:fs";
import path from "node:path";

let envCache: Record<string, string> | null = null;

function loadEnvFile(): Record<string, string> {
  if (envCache) return envCache;
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "pibutenten-app/.env.local"),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, "utf8");
      const out: Record<string, string> = {};
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/^\uFEFF/, "");
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key) out[key] = val;
      }
      envCache = out;
      return out;
    } catch {
      /* try next */
    }
  }
  envCache = {};
  return envCache;
}

/**
 * env 변수 가져오기 — process.env가 비어있으면 .env.local 파일에서 읽음.
 *
 * 보안 가드 (2026-05-16 강화):
 *   - production / Vercel 환경에선 fs read 절대 시도 X (process.env만 신뢰)
 *   - dev 한정 fallback. .env.local fs read는 dev 서버 Turbopack env 누락 버그 대응 목적
 */
export function getEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v) return v;
  // production / Vercel: fs fallback 금지 — process.env만 신뢰
  if (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production"
  ) {
    return undefined;
  }
  // dev 한정: .env.local fs read (Turbopack 누락 대응)
  const file = loadEnvFile();
  return file[key] || undefined;
}
