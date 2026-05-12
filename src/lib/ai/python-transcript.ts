/**
 * Python `youtube-transcript-api` 라이브러리를 child_process로 호출.
 *
 * 장점: YouTube가 막아둔 외부 채널 영상도 안정적으로 자막 fetch.
 * 단점: 서버에 Python 3 + `youtube-transcript-api` 패키지 필요.
 *
 * dev: 사용자 로컬에 Python 3.12 + pip install youtube-transcript-api 설치 시 작동.
 * prod (Vercel): 별도 Python serverless function 또는 worker로 분리 필요 (향후).
 *
 * Python 미설치/실패 시 null 반환 — 호출자가 다른 fallback로.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export type PythonTranscriptResult = {
  text: string;
  source: "ko-manual" | "ko-auto" | "en" | "default";
  lang?: string;
};

/** scripts/fetch_transcript.py 가 존재하는지 (= 통합되어 있는지) */
export function isPythonTranscriptAvailable(): boolean {
  const script = scriptPath();
  if (!fs.existsSync(script)) return false;
  // env로 비활성 강제 가능
  if (process.env.PYTHON_TRANSCRIPT_DISABLED === "1") return false;
  return true;
}

function scriptPath(): string {
  // process.cwd() 기준
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
  // env로 override 가능. Windows는 보통 `python`, *nix는 `python3`.
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * 외부 채널 영상도 한국어 자막 fetch 시도.
 * 성공: {text, source, lang}
 * 실패: null (호출자가 다른 fallback로)
 *
 * 타임아웃 25초 — 일반적으로 1~5초 소요. timedtext API가 느리면 길어질 수 있음.
 */
export async function fetchTranscriptViaPython(
  videoId: string,
): Promise<PythonTranscriptResult | null> {
  if (!isPythonTranscriptAvailable()) return null;

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
      // stdout은 JSON 한 줄 — 첫 줄만 사용
      const line = (out.split("\n").find((l) => l.trim().startsWith("{")) ??
        "").trim();
      if (!line) {
        if (err) {
          console.warn(`[python-transcript] no JSON for ${videoId}, stderr:`, err.slice(0, 200));
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
