/**
 * POST /api/admin/draft/pubmed-by-pmid
 *
 * 운영자가 PMID를 직접 입력하면 PubMed eutils로 efetch해서 reference 객체 반환.
 * 편집 페이지의 "참고문헌 추가" 기능에서 사용.
 *
 * 입력:  { pmid: string }
 * 출력:  { reference: {pmid,doi,title,journal,year,authors_short,pubmed_url,doi_url} | null,
 *          error?: string }
 */

import { NextResponse } from "next/server";
import { requireAdminOrDoctor } from "@/lib/admin-guard";
import { fetchPubmedByPmid } from "@/lib/ai/pubmed";
import { errorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  // 편집 페이지 접근 가능한 admin·doctor 둘 다 허용
  const guard = await requireAdminOrDoctor();
  if (!guard.ok) return guard.response;

  let body: { pmid?: unknown };
  try {
    body = (await req.json()) as { pmid?: unknown };
  } catch (e) {
    return errorResponse(e, "invalid_input", "[admin/draft/pubmed-by-pmid] body parse", 400, undefined, { userMessage: "Invalid JSON" });
  }
  const raw = typeof body.pmid === "string" ? body.pmid.trim() : "";
  const pmid = raw.replace(/^PMID[:\s]*/i, "").trim();
  if (!/^\d{1,9}$/.test(pmid)) {
    return errorResponse(null, "invalid_input", "[admin/draft/pubmed-by-pmid] pmid format", 400, undefined, { userMessage: "PMID는 1-9자리 숫자여야 합니다." });
  }

  try {
    const ref = await fetchPubmedByPmid(pmid);
    if (!ref) {
      return errorResponse(null, "not_found", "[admin/draft/pubmed-by-pmid] not found", 404, undefined, { userMessage: `PMID ${pmid}에 해당하는 PubMed 논문을 찾을 수 없습니다.` });
    }
    return NextResponse.json({ reference: ref });
  } catch (e) {
    return errorResponse(e, "network_failed", "[admin/draft/pubmed-by-pmid] fetch failed", 502);
  }
}
