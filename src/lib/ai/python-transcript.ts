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
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  // Windows: Microsoft Store stub 회피 — 알려진 Python 절대경로 우선 탐색
  if (process.platform === "win32") {
    const candidates = [
      "C:/Users/Bae/AppData/Local/Programs/Python/Python312/python.exe",
      "C:/Python312/python.exe",
      "C:/Python311/python.exe",
      "C:/Python310/python.exe",
    ];
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
