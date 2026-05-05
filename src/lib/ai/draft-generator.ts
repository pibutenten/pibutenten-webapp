/**
 * Anthropic Claude API 로 영상 자막 → Q&A 초안 5~10개 생성.
 *
 * Q&A 작성 규칙 (MEMORY.md 발췌):
 *  - 분량: 7~8문장 / 350~450자
 *  - 두괄식: 첫 문장에 결론·핵심 답
 *  - 단독 이해: 다른 Q&A 없이도 시술 정의·핵심 정보 매번 포함
 *  - 금지: 마크다운 강조(**), 불필요한 부연·반복
 *  - 전문 용어: 괄호로 짧게 풀어주기
 *  - 답변 톤: 친근하지만 전문적 ("효과가 있을 수 있어요/추천드려요")
 *
 * 결과는 JSON object { drafts: [...] } 로 받아 파싱.
 */

import Anthropic from "@anthropic-ai/sdk";

export type DraftQA = {
  question: string;
  answer: string;
  keywords: string[];
};

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 8192;

const SYSTEM_PROMPT = `당신은 피부과 전문의 콘텐츠 사이트 "피부텐텐"의 편집 에디터입니다.
주어진 유튜브 영상 자막을 바탕으로, 환자/일반인 독자를 위한 Q&A 초안을 5~10개 생성합니다.

[Q&A 작성 규칙 — 반드시 모두 지킬 것]
1. 분량: 답변은 7~8문장, 350~450자(공백 포함). 너무 짧거나 길면 안 됩니다.
2. 두괄식: 첫 문장에 결론과 핵심 답을 먼저 제시.
3. 단독 이해: 다른 Q&A 없이도 이해되도록 시술 정의·핵심 정보를 매번 포함.
4. 금지: 마크다운 강조(**굵게**), 리스트 마크(-, *, 1.), 불필요한 부연·반복.
5. 전문 용어: 괄호로 짧게 풀어주기. 예) "히알루로니다제(필러 분해 효소)".
6. 답변 톤: 친근하지만 전문적. "~할 수 있어요", "~추천드려요", "~좋아요" 같은 부드러운 존댓말.
7. 의학적 단정 금지. 일반적인 정보 안내 톤. 시술 효과는 개인차가 있음을 자연스럽게 반영.

[질문 작성 규칙]
- 자막에서 실제로 다뤄진 내용에 대한 질문만 생성. 자막에 없는 내용 추측 금지.
- 질문은 일반인이 검색창에 칠 법한 자연스러운 한국어 1~2문장.
- 시술명/성분/고민 단어가 들어가도록.

[키워드 규칙]
- 각 Q&A 마다 keywords 3~6개 추출.
- 한국어, 시술명/성분명/부위/고민/장비명 등.
- 짧은 명사구 (1~3 단어).

[출력 형식 — 매우 중요]
JSON 객체 하나만 출력. 마크다운 코드펜스(\`\`\`)나 설명 텍스트 절대 금지.
형식:
{"drafts":[{"question":"...","answer":"...","keywords":["...","..."]}, ...]}

drafts 배열 길이는 5~10. 자막 분량이 적으면 적게, 풍부하면 많이.`;

function buildUserPrompt(transcript: string, doctorName: string): string {
  return `원장: ${doctorName} 원장님

[영상 자막]
${transcript}

[지시]
위 자막을 분석해 Q&A 초안 5~10개를 위 시스템 규칙에 맞게 생성하세요.
답변에서 원장 본인을 지칭할 필요 없음 (자연스러운 정보 안내 톤).
JSON 객체만 출력. 다른 어떤 텍스트도 출력하지 마세요.`;
}

/** 응답 텍스트에서 JSON 객체를 안전 파싱. 코드펜스/잡문이 섞여도 첫 { ... } 매칭 시도. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // 1) 그대로 파싱 시도
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  // 2) 코드펜스 제거
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }
  // 3) 첫 { 부터 마지막 } 까지 잘라보기
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = trimmed.slice(first, last + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // fallthrough
    }
  }
  throw new Error("Failed to parse JSON from model output");
}

/** 모델 응답 검증 → DraftQA[]. 형식 어긋난 항목은 제외. */
function normalizeDrafts(parsed: unknown): DraftQA[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model output is not an object");
  }
  const root = parsed as Record<string, unknown>;
  const drafts = root.drafts;
  if (!Array.isArray(drafts)) {
    throw new Error("Model output missing 'drafts' array");
  }

  const out: DraftQA[] = [];
  for (const item of drafts) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    const answer = typeof obj.answer === "string" ? obj.answer.trim() : "";
    const kwRaw = obj.keywords;
    const keywords = Array.isArray(kwRaw)
      ? kwRaw
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
    if (!question || !answer) continue;
    out.push({ question, answer, keywords });
  }

  if (!out.length) {
    throw new Error("No valid drafts after normalization");
  }
  return out;
}

/**
 * 자막 → Q&A 초안 생성.
 * @param transcript YouTube 자막 텍스트 (이미 한 줄로 합쳐진 형태)
 * @param doctorName "정한미" 같은 원장 이름 (호칭 없이)
 */
export async function generateQADrafts(
  transcript: string,
  doctorName: string,
): Promise<DraftQA[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const trimmed = transcript.trim();
  if (trimmed.length < 50) {
    throw new Error("Transcript is too short to generate Q&A");
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(trimmed, doctorName),
      },
    ],
  });

  // text 블록 모두 합치기
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Model returned empty content");
  }

  const parsed = extractJson(text);
  return normalizeDrafts(parsed);
}
