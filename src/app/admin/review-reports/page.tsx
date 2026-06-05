import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/admin-page-guard";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "시술 리포트",
  robots: { index: false, follow: false },
};

/**
 * /admin/review-reports — 운영자 전용 '시술 리포트' 요약 표 (읽기 전용).
 *
 * 데이터: get_review_report_overview() RPC (0238, admin 전용 SECURITY DEFINER).
 *   시술별 1행 — 후기수·재시술의향%·만족도·통증 + 조회/저장/공유(engagement).
 * 그룹핑: procedure_taxonomy.category 동적 (카테고리 늘어도 자동 반영, 하드코딩 없음).
 * 행 클릭 → /reports/{en} (공개 리포트).
 */

type OverviewRow = {
  en: string | null;
  ko: string;
  category: string;
  sort_order: number | null;
  review_count: number;
  revisit_yes: number;
  revisit_maybe: number;
  revisit_no: number;
  sat_avg: number | null;
  pain_avg: number | null;
  view_count: number | null;
  save_count: number | null;
  share_count: number | null;
};

// 카테고리 표시 라벨 — 알려진 값만 매핑하고 미지정 카테고리는 원문 그대로(자동 반영).
const CATEGORY_LABEL: Record<string, string> = {
  injectables: "주사·스킨부스터",
  lifting: "리프팅",
};

function revisitPct(yes: number, maybe: number, no: number): number {
  const total = yes + maybe + no;
  return total > 0 ? Math.round((yes / total) * 100) : 0;
}

function fmtAvg(v: number | null): string {
  return v == null ? "—" : Number(v).toFixed(1);
}

export default async function AdminReviewReportsPage() {
  await requireAdminPage("/admin/review-reports");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_review_report_overview");
  const rows = ((data ?? []) as OverviewRow[]).map((r) => ({
    ...r,
    review_count: Number(r.review_count ?? 0),
    revisit_yes: Number(r.revisit_yes ?? 0),
    revisit_maybe: Number(r.revisit_maybe ?? 0),
    revisit_no: Number(r.revisit_no ?? 0),
    view_count: Number(r.view_count ?? 0),
    save_count: Number(r.save_count ?? 0),
    share_count: Number(r.share_count ?? 0),
  }));

  // 카테고리별 그룹핑 — RPC 가 category, sort_order, ko 순으로 정렬해 반환하므로 순서 보존.
  const groups: { category: string; rows: typeof rows }[] = [];
  for (const row of rows) {
    let g = groups.find((x) => x.category === row.category);
    if (!g) {
      g = { category: row.category, rows: [] };
      groups.push(g);
    }
    g.rows.push(row);
  }

  // grid 컬럼: 시술명 | 후기수 | 재시술의향% | 만족도 | 통증 | 조회 | 저장 | 공유
  const GRID = "grid grid-cols-[minmax(7rem,1.6fr)_repeat(7,minmax(3rem,1fr))] gap-x-2";

  return (
    <section className="w-full py-6">
      <div className="mb-1 -ml-1"><BackButton /></div>
      <div className="mb-5 pl-1">
        <h1 className="text-2xl font-bold text-[var(--text)]">시술 리포트</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          시술별 후기 집계 요약 (읽기 전용 · 영구 noindex) · 행 클릭 시 공개 리포트로 이동
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          데이터를 불러오지 못했어요.
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{error.message}</pre>
        </div>
      )}

      {!error && rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--text-secondary)]">
          아직 후기가 집계된 시술 리포트가 없어요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="min-w-[760px]">
            {/* 헤더 */}
            <div
              className={
                GRID +
                " border-b border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]"
              }
            >
              <div className="text-left">시술명</div>
              <div className="text-right whitespace-nowrap">후기수</div>
              <div className="text-right whitespace-nowrap">재시술의향</div>
              <div className="text-right whitespace-nowrap">만족도</div>
              <div className="text-right whitespace-nowrap">통증</div>
              <div className="text-right whitespace-nowrap">조회</div>
              <div className="text-right whitespace-nowrap">저장</div>
              <div className="text-right whitespace-nowrap">공유</div>
            </div>

            {groups.map((g) => (
              <div key={g.category}>
                {/* 카테고리 헤더 */}
                <div className="border-b border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  {CATEGORY_LABEL[g.category] ?? g.category}
                  <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                    {g.rows.length}종
                  </span>
                </div>
                {/* 시술 행 — 전체 클릭 → /reports/{en} */}
                {g.rows.map((r) => {
                  const pct = revisitPct(r.revisit_yes, r.revisit_maybe, r.revisit_no);
                  const inner = (
                    <>
                      <div className="truncate text-left font-medium text-[var(--text)]">
                        {r.ko}
                      </div>
                      <div className="text-right tabular-nums text-[var(--text-secondary)]">
                        {r.review_count.toLocaleString()}
                      </div>
                      <div className="text-right tabular-nums text-[var(--text-secondary)]">
                        {pct}%
                      </div>
                      <div className="text-right tabular-nums text-[var(--text-secondary)]">
                        {fmtAvg(r.sat_avg)}
                      </div>
                      <div className="text-right tabular-nums text-[var(--text-secondary)]">
                        {fmtAvg(r.pain_avg)}
                      </div>
                      <div className="text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.view_count ?? 0).toLocaleString()}
                      </div>
                      <div className="text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.save_count ?? 0).toLocaleString()}
                      </div>
                      <div className="text-right tabular-nums text-[var(--text-secondary)]">
                        {(r.share_count ?? 0).toLocaleString()}
                      </div>
                    </>
                  );
                  return r.en ? (
                    <Link
                      key={r.ko}
                      href={`/reports/${r.en}`}
                      className={
                        GRID +
                        " items-center border-b border-[var(--border)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-soft)]"
                      }
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={r.ko}
                      className={
                        GRID +
                        " items-center border-b border-[var(--border)] px-3 py-2 text-sm"
                      }
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
