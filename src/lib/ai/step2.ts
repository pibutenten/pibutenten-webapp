/**
 * Phase 8 Step2 — 카드 + PubMed 후보 → LLM이 best reference 1개 선택.
 *
 * 시스템 프롬프트: `src/lib/ai/prompts/step2_v2.md` (전달용 v2 그대로).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PubmedCandidate } from "./pubmed";
import { getEnv } from "./env-fallback";
import { extractJson } from "./extract-json";
import { loadSystemPrompt } from "./load-prompt";
import { truncate } from "@/lib/string-utils";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 2000;

export type Step2Reference = {
  pmid: string;
  doi: string;
  title: string;
  journal: string;
  year: string;
  authors_short: string;
  pubmed_url: string;
  doi_url: string;
};

export type Step2Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type Step2Result = {
  reference: Step2Reference | null;
  reasoning: string;
  usage?: Step2Usage;
  model?: string;
};

function buildUserMessage(opts: {
  question: string;
  answer: string;
  pubmedKeywords: string[];
  candidates: PubmedCandidate[];
}): string {
  const lite = opts.candidates.map((c) => ({
    pmid: c.pmid,
    title: c.title,
    abstract: truncate(c.abstract, 600),
    journal: c.journal,
    year: c.year,
    authors_short: c.authors_short,
    publication_types: c.publication_types,
    mesh_terms: (c.mesh_terms ?? []).slice(0, 8),
    doi: c.doi,
  }));
  return `다음 카드와 PubMed 후보들을 보고 best reference 1개를 선택해주세요.

[Q&A 카드]
question: ${opts.question}
answer: ${opts.answer}
pubmed_search_keywords: ${opts.pubmedKeywords.join(", ")}

[후보 (${lite.length}개)]
${JSON.stringify(lite, null, 2)}

위 step2 v2 룰에 따라 JSON 단일 객체 반환. 적합한 후보 없으면 reference=null. 마크다운 펜스 금지.`;
}

function normalize(parsed: unknown): Step2Result {
  if (!parsed || typeof parsed !== "object") {
    return { reference: null, reasoning: "잘못된 응답 형식" };
  }
  const root = parsed as Record<string, unknown>;
  const reasoning = typeof root.reasoning === "string" ? root.reasoning : "";
  const refRaw = root.reference;
  if (!refRaw || typeof refRaw !== "object") {
    return { reference: null, reasoning };
  }
  const r = refRaw as Record<string, unknown>;
  const pmid = typeof r.pmid === "string" ? r.pmid : "";
  if (!pmid) return { reference: null, reasoning };
  const doi = typeof r.doi === "string" ? r.doi : "";
  return {
    reference: {
      pmid,
      doi,
      title: typeof r.title === "string" ? r.title : "",
      journal: typeof r.journal === "string" ? r.journal : "",
      year: typeof r.year === "string" ? r.year : "",
      authors_short: typeof r.authors_short === "string" ? r.authors_short : "",
      pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doi_url: doi ? `https://doi.org/${doi}` : "",
    },
    reasoning,
  };
}

export async function runStep2(opts: {
  question: string;
  answer: string;
  pubmedKeywords: string[];
  candidates: PubmedCandidate[];
}): Promise<Step2Result> {
  if (opts.candidates.length === 0) {
    return { reference: null, reasoning: "PubMed 후보 없음" };
  }
  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const system = loadSystemPrompt("step2_v2.md");
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
  const usage: Step2Usage = {
    input_tokens: msg.usage?.input_tokens ?? 0,
    output_tokens: msg.usage?.output_tokens ?? 0,
    cache_creation_input_tokens: msg.usage?.cache_creation_input_tokens ?? undefined,
    cache_read_input_tokens: msg.usage?.cache_read_input_tokens ?? undefined,
  };
  try {
    const parsed = extractJson(text);
    const result = normalize(parsed);
    return { ...result, usage, model: MODEL };
  } catch (e) {
    return {
      reference: null,
      reasoning: `파싱 실패: ${e instanceof Error ? e.message : String(e)}`,
      usage,
      model: MODEL,
    };
  }
}
