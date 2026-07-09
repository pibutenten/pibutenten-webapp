/**
 * Python `youtube-transcript-api` 자막 fetch (외부 채널도 잘 잡힘).
 *
 * 두 가지 호출 모드:
 *   1) dev (로컬): child_process로 scripts/fetch_transcript.py 직접 실행
 *   2) prod (Vercel): /api/transcript Python serverless function 내부 fetch
 *
 * Vercel 감지: process.env.VERCEL === "1" — 자동으로 prod 모드 전환.
 * 둘 다 실패 시 null — 호출자가 다른 fallback로.
 */

import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export type PythonTranscriptResult = {
  text: string;
  source: "ko-manual" | "ko-auto" | "en" | "default";
  lang?: string;
};

/** 환경별로 자막 fetch 통로가 살아있는지 */
export function isPythonTranscriptAvailable(): boolean {
  if (process.env.PYTHON_TRANSCRIPT_DISABLED === "1") return false;
  if (isVercelEnv()) return true; // Vercel은 /api/transcript 항상 시도 가능
  // dev/로컬은 스크립트 파일 존재 여부로 판정
  return fs.existsSync(scriptPath());
}

function isVercelEnv(): boolean {
  return process.env.VERCEL === "1";
}

function scriptPath(): string {
  const candidates = [
    path.join(process.cwd(), "scripts/fetch_transcript.py"),
    path.join(process.cwd(), "pibutenten-app/scripts/fetch_transcript.py"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function pythonCmd(): string {
  // 우선순위: PYTHON_BIN 환경변수 → 공식 인스톨러 표준 경로 탐색 → bare python.
  // Windows 의 bare "python" 은 dev 서버 프로세스 PATH 에서 Microsoft Store stub 으로
  // 해석돼 조용히 실패할 수 있어(2026-07-09 자막 추출 회귀 원인) 실제 설치 경로를 먼저
  // 찾는다. 후보는 특정 사용자 하드코딩이 아니라 python.org 인스톨러의 두 가지 기본
  // 위치 패턴: 사용자별(%USERPROFILE%/AppData/Local/Programs/Python/PythonNNN, 기본
  // 선택지)과 시스템 전역(C:/PythonNNN, "Install for all users"). .env.local 의
  // PYTHON_BIN 설정은 비표준 경로 설치 시에만 필요.
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE;
    // 버전 상한 313 — 새 Python 메이저(3.14+) 설치 시 이 배열도 늘려야 탐색된다.
    const candidates = ["313", "312", "311", "310"].flatMap((v) => [
      ...(home
        ? [path.join(home, `AppData/Local/Programs/Python/Python${v}/python.exe`)]
        : []),
      path.join("C:/", `Python${v}`, "python.exe"),
    ]);
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        /* continue */
      }
    }
    return "python";
  }
  return "python3";
}

function vercelTranscriptUrl(): string {
  // 같은 도메인 — Vercel 환경에선 VERCEL_URL이 자동 주입 (예: pibutenten-webapp.vercel.app)
  const host = process.env.VERCEL_URL || "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}/api/transcript`;
}

async function fetchViaVercelEndpoint(
  videoId: string,
): Promise<PythonTranscriptResult | null> {
  try {
    const url = vercelTranscriptUrl();
    const secret = process.env.PYTHON_TRANSCRIPT_SECRET ?? "";
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 25000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Transcript-Secret": secret } : {}),
        },
        body: JSON.stringify({ videoId }),
        signal: ctrl.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[python-transcript] /api/transcript HTTP ${res.status}:`,
        text.slice(0, 200),
      );
      return null;
    }
    const j = (await res.json()) as {
      transcript?: string;
      source?: string;
      lang?: string;
      error?: string;
    };
    if (j.error || !j.transcript) return null;
    const source = ((): PythonTranscriptResult["source"] => {
      const s = j.source;
      if (s === "ko-manual" || s === "ko-auto" || s === "en" || s === "default")
        return s;
      return "default";
    })();
    return { text: j.transcript, source, lang: j.lang };
  } catch (e) {
    console.warn(
      `[python-transcript] vercel endpoint failed:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

async function fetchViaChildProcess(
  videoId: string,
): Promise<PythonTranscriptResult | null> {
  const script = scriptPath();
  const cmd = pythonCmd();

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(cmd, [script, videoId], {
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
        windowsHide: true,
      });
    } catch (e) {
      console.warn(
        `[python-transcript] spawn failed for ${videoId}:`,
        e instanceof Error ? e.message : String(e),
      );
      resolve(null);
      return;
    }

    let out = "";
    let err = "";
    let settled = false;
    const finish = (result: PythonTranscriptResult | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      console.warn(`[python-transcript] timeout for ${videoId}`);
      finish(null);
    }, 25000);

    proc.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf-8");
    });
    proc.stderr.on("data", (d: Buffer) => {
      err += d.toString("utf-8");
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      console.warn(`[python-transcript] proc error for ${videoId}:`, e.message);
      finish(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const line = (out.split("\n").find((l) => l.trim().startsWith("{")) ??
        "").trim();
      if (!line) {
        if (err) {
          console.warn(
            `[python-transcript] no JSON for ${videoId}, stderr:`,
            err.slice(0, 200),
          );
        }
        finish(null);
        return;
      }
      try {
        const j = JSON.parse(line) as {
          transcript?: string;
          source?: string;
          lang?: string;
          error?: string;
        };
        if (j.error || !j.transcript) {
          finish(null);
          return;
        }
        const source = ((): PythonTranscriptResult["source"] => {
          const s = j.source;
          if (
            s === "ko-manual" ||
            s === "ko-auto" ||
            s === "en" ||
            s === "default"
          )
            return s;
          return "default";
        })();
        finish({ text: j.transcript, source, lang: j.lang });
      } catch (e) {
        console.warn(
          `[python-transcript] JSON parse failed for ${videoId}:`,
          e instanceof Error ? e.message : String(e),
        );
        finish(null);
      }
    });
  });
}

/**
 * 외부 채널 영상도 한국어 자막 fetch 시도.
 * Vercel 환경: /api/transcript (Python serverless function) 내부 fetch.
 * 로컬 dev: scripts/fetch_transcript.py를 child_process로 실행.
 */
export async function fetchTranscriptViaPython(
  videoId: string,
): Promise<PythonTranscriptResult | null> {
  if (!isPythonTranscriptAvailable()) return null;
  if (isVercelEnv()) {
    return fetchViaVercelEndpoint(videoId);
  }
  return fetchViaChildProcess(videoId);
}
