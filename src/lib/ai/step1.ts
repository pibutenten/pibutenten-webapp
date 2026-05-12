/**
 * Phase 8 Step1 — 자막 → Q&A 카드 추출.
 *
 * 시스템 프롬프트: `src/lib/ai/prompts/step1_v5.md` (전달용 v5 그대로 복사).
 * 모델: claude-opus-4-7, max_tokens 8192.
 * 출력: { drafts: DraftCard[] } JSON 단일 객체.
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { getEnv } from "./env-fallback";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 8192;

export type DraftCard = {
  question: string;
  answer: string;
  keywords: string[];
  category?: string;
  source: {
    video_id: string;
    video_title: string;
    source_file: string;
    video_url: string;
  };
  timestamp: {
    start: string;
    end?: string;
    start_seconds: number;
  } | null;
  pubmed_search_keywords: string[];
  script_evidence?: string;
};

let cachedSystemPrompt: string | null = null;
function loadSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  // process.cwd() 기준 — Next.js 서버 환경에서 항상 app 루트
  const candidates = [
    path.join(process.cwd(), "src/lib/ai/prompts/step1_v5.md"),
    path.join(process.cwd(), "pibutenten-app/src/lib/ai/prompts/step1_v5.md"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedSystemPrompt = fs.readFileSync(p, "utf8");
      return cachedSystemPrompt;
    }
  }
  throw new Error(
    `step1_v5.md not found (tried: ${candidates.join(", ")})`,
  );
}

function buildUserMessage(opts: {
  transcript: string;
  videoId: string;
  videoTitle: string;
  sourceFile: string;
}): string {
  return `다음 영상 자막을 Step1 v5 룰에 맞춰 Q&A 카드로 추출하세요.

[입력 메타]
- video_id: ${opts.videoId}
- video_title: ${opts.videoTitle}
- source_file: ${opts.sourceFile}

[transcript]
${opts.transcript}

JSON 단일 객체만 출력. 마크다운 펜스 금지.`;
}

/** 응답 텍스트에서 JSON 추출 — 코드펜스/잡문 섞여도 첫 { ... } 매칭. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* continue */
    }
  }
  throw new Error("Failed to parse JSON from Step1 output");
}

function normalize(parsed: unknown): DraftCard[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Step1 output is not an object");
  }
  const root = parsed as { drafts?: unknown };
  if (!Array.isArray(root.drafts)) {
    throw new Error("Step1 output missing drafts[]");
  }
  const out: DraftCard[] = [];
  for (const item of root.drafts) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    const answer = typeof obj.answer === "string" ? obj.answer.trim() : "";
    if (!question || !answer) continue;
    const keywords = Array.isArray(obj.keywords)
      ? (obj.keywords as unknown[])
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
    const pubmedKw = Array.isArray(obj.pubmed_search_keywords)
      ? (obj.pubmed_search_keywords as unknown[])
          .filter((k): k is string => typeof k === "string")
      : [];
    const src = (obj.source ?? {}) as Record<string, unknown>;
    const tsRaw = obj.timestamp;
    let timestamp: DraftCard["timestamp"] = null;
    if (tsRaw && typeof tsRaw === "object") {
      const t = tsRaw as Record<string, unknown>;
      const start = typeof t.start === "string" ? t.start : "00:00";
      const startSec =
        typeof t.start_seconds === "number" ? t.start_seconds : 0;
      const end = typeof t.end === "string" ? t.end : undefined;
      timestamp = {
        start,
        ...(end ? { end } : {}),
        start_seconds: startSec,
      };
    }
    out.push({
      question,
      answer,
      keywords,
      category: typeof obj.category === "string" ? obj.category : undefined,
      source: {
        video_id: typeof src.video_id === "string" ? src.video_id : "",
        video_title: typeof src.video_title === "string" ? src.video_title : "",
        source_file: typeof src.source_file === "string" ? src.source_file : "",
        video_url: typeof src.video_url === "string" ? src.video_url : "",
      },
      timestamp,
      pubmed_search_keywords: pubmedKw,
      script_evidence:
        typeof obj.script_evidence === "string" ? obj.script_evidence : undefined,
    });
  }
  if (!out.length) throw new Error("Step1 produced 0 valid cards");
  return out;
}

export async function runStep1(opts: {
  transcript: string;
  videoId: string;
  videoTitle: string;
  sourceFile: string;
}): Promise<DraftCard[]> {
  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!opts.transcript || opts.transcript.trim().length < 100) {
    throw new Error("Transcript is too short for Step1");
  }
  const system = loadSystemPrompt();
  const user = buildUserMessage(opts);

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Step1 returned empty content");
  const parsed = extractJson(text);
  return normalize(parsed);
}
