import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

/**
 * GET /api/qas?offset=0&limit=20&q=쥬브젠
 *   - 발행된 Q&A를 created_at desc, id desc 정렬 (안정적)
 *   - q 있으면 question/answer ILIKE 부분일치 필터
 *   - doctor / video JOIN 결과 함께 반환
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));
  const q = (url.searchParams.get("q") ?? "").trim();
  const doctorSlug = (url.searchParams.get("doctor_slug") ?? "").trim();

  const supabase = await createSupabaseServerClient();

  // doctor_slug 필터링: doctor.slug → doctor.id 조회 후 doctor_id로 필터
  let doctorIdFilter: string | null = null;
  if (doctorSlug) {
    const { data: dRow } = await supabase
      .from("doctors")
      .select("id")
      .eq("slug", doctorSlug)
      .maybeSingle();
    if (!dRow) {
      return NextResponse.json({ qas: [] }, { headers: { "cache-control": "no-store" } });
    }
    doctorIdFilter = dRow.id;
  }

  let query = supabase
    .from("qas")
    .select(
      `
      id, question, answer, meta, keywords,
      like_count, view_count,
      doctor:doctors(slug, name, branch),
      video:videos(youtube_id, youtube_url, topic, upload_date)
    `,
    )
    .eq("published", true);

  if (doctorIdFilter) {
    query = query.eq("doctor_id", doctorIdFilter);
  }

  if (q) {
    // 공백으로 분리한 모든 단어가 매칭되는 글만 (AND). 각 단어는 question/answer/keywords 중 어느 곳에든 매칭되면 통과 (OR).
    const words = q.split(/\s+/).filter((w) => w.length > 0);
    for (const w of words) {
      const pattern = `%${escapeLike(w)}%`;
      query = query.or(
        `question.ilike.${pattern},answer.ilike.${pattern},keywords.cs.{${w}}`,
      );
    }
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { qas: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}

/** PostgREST .or 의 값에서 콤마·괄호·*·% 등 메타문자 escape. */
function escapeLike(s: string): string {
  // 콤마/괄호는 PostgREST 파서가 분리자로 쓰므로 제거 (검색에 영향 적음)
  // % _ * 는 LIKE 메타문자
  return s.replace(/[(),]/g, " ").replace(/[%_*]/g, "\\$&");
}
