/**
 * POST /api/admin/draft/step2
 *
 * Phase 8 위저드 Step2 — 카드 N개를 받아 각 카드별 PubMed 후보 fetch + LLM 선택.
 *
 * 입력: {
 *   cards: [{ question, answer, pubmed_search_keywords }],
 *   retmax?: number (기본 8, expand 시 20/40)
 * }
 * 출력: {
 *   results: [{
 *     reference: {pmid,doi,title,journal,year,authors_short,pubmed_url,doi_url} | null,
 *     reasoning: string,
 *     candidates: [{pmid,title,journal,year,authors_short,doi}, ...]  // UI 교체 dropdown용
 *   }]
 * }
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { fetchPubmedCandidates } from "@/lib/ai/pubmed";
import { runStep2 } from "@/lib/ai/step2";
import { MODEL_ID } from "@/lib/ai/pricing";
import { rateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/error-response";
import {
  normalizePubmedRefWire,
  type PubmedRefObj,
} from "@/lib/schema/api/articles";
import { pubmedKeywordsFor, normalizeTags } from "@/lib/procedure-dict";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 카드 N개 * (PubMed ~3s + LLM ~10s) = 카드별 ~15s

type CardIn = {
  // P2-4 (2026-05-27): AI 파이프라인도 title/body 통일.
  title: string;
  body: string;
  pubmed_search_keywords: string[];
  keywords?: string[]; // 카드 태그(한글) — 시술 사전 검색어 보강용 (2026-07-14)
};

/** 대소문자·공백 무시 중복 제거(원문 보존). */
function dedupeKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = (raw || "").trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/** 사전 fallback 검색어 카드당 상한 — PubMed 순차호출(각 재시도·타임아웃) 폭주 방지. */
const MAX_DICT_KEYWORDS = 8;

/**
 * PubMed 검색어 = LLM 검색어(카드 특이적) + 시술 사전 검색어(전문가 큐레이션).
 *   fetchPubmedCandidates 는 first-hit-wins 이므로 LLM 검색어를 앞에 두어 특이성 우선,
 *   사전 검색어는 뒤에 두어 "LLM 검색어가 부실/무히트여도" 결정론적으로 후보 확보(fallback).
 *   카드 태그(한글)를 정규화(별칭·표기 흡수) 후 tag_dictionary.pubmed_keywords 로 조회.
 *   (2026-07-14 사전 활용)
 */
function effectiveKeywords(llmKeywords: string[], tags: string[]): string[] {
  const dictKws: string[] = [];
  for (const t of normalizeTags(tags)) {
    const found = pubmedKeywordsFor(t);
    if (found) dictKws.push(...found);
  }
  const cappedDict = dedupeKeywords(dictKws).slice(0, MAX_DICT_KEYWORDS);
  return dedupeKeywords([...llmKeywords, ...cappedDict]);
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // PR-B E6: PubMed × N + LLM 호출 비용 폭주 방어. admin 당 분당 5회.
  const limited = await rateLimit({
    request: req,
    bucketPrefix: "admin-draft-step2",
    userId: guard.userId,
    max: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let body: { cards?: unknown; retmax?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch (e) {
    return errorResponse(e, "invalid_input", "[admin/draft/step2] body parse", 400, undefined, { userMessage: "Invalid JSON body" });
  }
  if (!Array.isArray(body.cards)) {
    return errorResponse(null, "invalid_input", "[admin/draft/step2] cards[] required", 400, undefined, { userMessage: "cards[] required" });
  }
  const retmax =
    typeof body.retmax === "number" && body.retmax > 0
      ? Math.min(Math.floor(body.retmax), 40)
      : 8;
  const cards = body.cards as CardIn[];

  // Critical-4: 응답 reference 는 SSOT (PubmedRefObj) 형식으로 정규화한 뒤 내보낸다.
  // candidates 는 dropdown 표시용 wire-format 유지 (사용자가 선택해 reference 로
  // 승격될 때 클라이언트가 normalizePubmedRefWire 로 변환).
  type CardResult = {
    reference: PubmedRefObj | null;
    reasoning: string;
    candidates: Array<{
      pmid: string;
      title: string;
      journal: string;
      year: string;
      authors_short: string;
      doi: string;
    }>;
    usage: { input_tokens: number; output_tokens: number };
    llm_calls: number;
  };
  const results: CardResult[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalCalls = 0;

  for (const c of cards) {
    const llmKws = Array.isArray(c.pubmed_search_keywords)
      ? c.pubmed_search_keywords
      : [];
    const tags = Array.isArray(c.keywords) ? c.keywords : [];
    // LLM 검색어 + 시술 사전 검색어(fallback). 사전은 카드 태그로 조회.
    const kws = effectiveKeywords(llmKws, tags);
    // 카드별 try/catch — 한 카드의 PubMed/LLM 실패가 전체 응답을 막지 않도록 격리.
    // NCBI 타임아웃·rate limit·Anthropic 일시 오류에서도 다음 카드는 계속 처리.
    let candidates: Awaited<ReturnType<typeof fetchPubmedCandidates>> = [];
    let step2: Awaited<ReturnType<typeof runStep2>> = {
      reference: null,
      reasoning: "",
    };
    let cardIn = 0;
    let cardOut = 0;
    let calls = 0;
    try {
      candidates = await fetchPubmedCandidates(kws, retmax);
      step2 = await runStep2({
        title: c.title,
        body: c.body,
        pubmedKeywords: kws,
        candidates,
      });
      cardIn = step2.usage?.input_tokens ?? 0;
      cardOut = step2.usage?.output_tokens ?? 0;
      calls = 1;
      // 후보 0 또는 null reference면 retmax 확장 1단계 (8 → 20)
      if (!step2.reference && retmax === 8 && candidates.length < 20) {
        candidates = await fetchPubmedCandidates(kws, 20);
        step2 = await runStep2({
          title: c.title,
          body: c.body,
          pubmedKeywords: kws,
          candidates,
        });
        cardIn += step2.usage?.input_tokens ?? 0;
        cardOut += step2.usage?.output_tokens ?? 0;
        calls += 1;
      }
    } catch (e) {
      // 한 카드 실패는 격리 — 다음 카드 계속 처리.
      console.warn(
        `[step2] card failed title="${c.title?.slice(0, 40) ?? ""}" err=`,
        e,
      );
      step2 = {
        reference: null,
        reasoning: `PubMed/LLM 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    totalIn += cardIn;
    totalOut += cardOut;
    totalCalls += calls;

    results.push({
      reference: normalizePubmedRefWire(step2.reference),
      reasoning: step2.reasoning,
      candidates: candidates.map((x) => ({
        pmid: x.pmid,
        title: x.title,
        journal: x.journal,
        year: x.year,
        authors_short: x.authors_short,
        doi: x.doi,
      })),
      usage: { input_tokens: cardIn, output_tokens: cardOut },
      llm_calls: calls,
    });
  }

  console.log(
    `[step2] cards=${cards.length} llm_calls=${totalCalls} ` +
      `usage_input=${totalIn} usage_output=${totalOut}`,
  );

  return NextResponse.json(
    {
      results,
      usage: { input_tokens: totalIn, output_tokens: totalOut },
      llm_calls: totalCalls,
      model: MODEL_ID,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
