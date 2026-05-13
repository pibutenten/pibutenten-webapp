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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchPubmedCandidates } from "@/lib/ai/pubmed";
import { runStep2 } from "@/lib/ai/step2";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 카드 N개 * (PubMed ~3s + LLM ~10s) = 카드별 ~15s

type CardIn = {
  question: string;
  answer: string;
  pubmed_search_keywords: string[];
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: admin only" },
      { status: 403 },
    );
  }

  let body: { cards?: unknown; retmax?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.cards)) {
    return NextResponse.json({ error: "cards[] required" }, { status: 400 });
  }
  const retmax =
    typeof body.retmax === "number" && body.retmax > 0
      ? Math.min(Math.floor(body.retmax), 40)
      : 8;
  const cards = body.cards as CardIn[];

  type CardResult = {
    reference: Awaited<ReturnType<typeof runStep2>>["reference"];
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
    const kws = Array.isArray(c.pubmed_search_keywords)
      ? c.pubmed_search_keywords
      : [];
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
        question: c.question,
        answer: c.answer,
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
          question: c.question,
          answer: c.answer,
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
        `[step2] card failed q="${c.question?.slice(0, 40) ?? ""}" err=`,
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
      reference: step2.reference,
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
      model: "claude-opus-4-7",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
