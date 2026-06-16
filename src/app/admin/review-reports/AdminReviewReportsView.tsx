"use client";

/**
 * AdminReviewReportsView — /admin/review-reports "시술 리포트" 본문 (앱 셸 래퍼).
 *
 * 원칙(Phase 3 ②): 상단 바·배경만 앱 셸(AppShell)로 통일하고,
 *   본문 골격(요약 표)은 그대로 유지하되 radius·color 토큰만 앱 톤(var(--ink-*)·var(--tt-blue*)·var(--line))으로 재조정.
 *   - 데이터(RPC)·가드·그룹핑은 서버 page.tsx 가 담당하고, 그룹·error 를 props 로 내려준다.
 *   - 표 구조(grid 컬럼·행 클릭 → /reports/{en})는 운영과 100% 동일.
 *
 * 격리: 내부 링크는 모두 /reports/* (공개 리포트) — 앱 셸 라우트 미사용.
 */

import Link from "next/link";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";

export type ReviewOverviewRow = {
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

type Props = {
  groups: { category: string; rows: ReviewOverviewRow[] }[];
  rowCount: number;
  errorMessage: string | null;
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

// grid 컬럼: 시술명 | 후기수 | 재시술의향% | 만족도 | 통증 | 조회 | 저장 | 공유
const GRID =
  "grid grid-cols-[minmax(7rem,1.6fr)_repeat(7,minmax(3rem,1fr))] gap-x-2";

export default function AdminReviewReportsView({
  groups,
  rowCount,
  errorMessage,
}: Props) {
  const search = useSearchRouting();

  return (
    <AppShell active="마이" wide back="/admin" {...search}>
      {/* 제목 + noindex 설명 (앱 톤) */}
      <div style={{ marginBottom: 20, paddingLeft: 4 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--ink-900)",
            margin: 0,
          }}
        >
          시술 리포트
        </h1>
        <p style={{ marginTop: 4, fontSize: 12, color: "var(--ink-500)" }}>
          시술별 후기 집계 요약 (읽기 전용 · 영구 noindex) · 행 클릭 시 공개
          리포트로 이동
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          데이터를 불러오지 못했어요.
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
            {errorMessage}
          </pre>
        </div>
      )}

      {!errorMessage && rowCount === 0 ? (
        <div
          className="rounded-[12px] border bg-white p-10 text-center text-sm"
          style={{ borderColor: "var(--line)", color: "var(--ink-500)" }}
        >
          아직 후기가 집계된 시술 리포트가 없어요.
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-[12px] border bg-white"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="min-w-[760px]">
            {/* 헤더 */}
            <div
              className={GRID + " border-b px-3 py-2 text-xs font-medium"}
              style={{
                borderColor: "var(--line)",
                background: "var(--tt-blue-tint)",
                color: "var(--ink-700)",
              }}
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
                <div
                  className="border-b px-3 py-1.5 text-xs font-semibold"
                  style={{
                    borderColor: "var(--line)",
                    background: "#fff",
                    color: "var(--ink-700)",
                  }}
                >
                  {CATEGORY_LABEL[g.category] ?? g.category}
                  <span
                    className="ml-1.5 font-normal"
                    style={{ color: "var(--ink-500)" }}
                  >
                    {g.rows.length}종
                  </span>
                </div>
                {/* 시술 행 — 전체 클릭 → /reports/{en} */}
                {g.rows.map((r) => {
                  const pct = revisitPct(
                    r.revisit_yes,
                    r.revisit_maybe,
                    r.revisit_no,
                  );
                  const inner = (
                    <>
                      <div
                        className="truncate text-left font-medium"
                        style={{ color: "var(--ink-900)" }}
                      >
                        {r.ko}
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ color: "var(--ink-700)" }}
                      >
                        {r.review_count.toLocaleString()}
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ color: "var(--ink-700)" }}
                      >
                        {pct}%
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ color: "var(--ink-700)" }}
                      >
                        {fmtAvg(r.sat_avg)}
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ color: "var(--ink-700)" }}
                      >
                        {fmtAvg(r.pain_avg)}
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ color: "var(--ink-700)" }}
                      >
                        {(r.view_count ?? 0).toLocaleString()}
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ color: "var(--ink-700)" }}
                      >
                        {(r.save_count ?? 0).toLocaleString()}
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ color: "var(--ink-700)" }}
                      >
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
                        " items-center border-b px-3 py-2 text-sm transition-colors hover:bg-[var(--tt-blue-tint)]"
                      }
                      style={{ borderColor: "var(--line)" }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={r.ko}
                      className={GRID + " items-center border-b px-3 py-2 text-sm"}
                      style={{ borderColor: "var(--line)" }}
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
    </AppShell>
  );
}
