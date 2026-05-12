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
 * Vercel 환경 (VERCEL=1)에선 process.env만 사용 (fallback 시도 X).
 */
export function getEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v) return v;
  if (process.env.VERCEL === "1") return undefined;
  const file = loadEnvFile();
  return file[key] || undefined;
}
