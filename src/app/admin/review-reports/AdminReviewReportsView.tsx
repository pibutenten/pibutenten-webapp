"use client";

/**
 * AdminReviewReportsView — /admin/review-reports "시술 리포트" 본문 (앱 셸 래퍼).
 *
 * 원칙(Phase 3 ②): 상단 바·배경만 앱 셸(AppShell)로 통일하고,
 *   본문 골격(요약 표)은 그대로 유지하되 radius·color 토큰만 앱 톤(var(--ink-*)·var(--tt-blue*)·var(--line))으로 재조정.
 *   - 데이터(RPC)·가드·그룹핑은 서버 page.tsx 가 담당하고, 그룹·error 를 props 로 내려준다.
 *   - 행 클릭 → /reports/{en} 은 운영과 동일 유지.
 *
 * 확장(2026-07-04 원장 요청):
 *   - 컬럼 +3칸: 다운타임(최빈 라벨) · 효과(top3) · 생성일(YY.MM.DD).
 *     만족도는 기존 칸을 "평균 + 5→1점 미니 분포바"로 확장(칸 수 증가 없이 정보만 추가 — 옆으로 무리 금지).
 *   - 헤더 클릭 정렬: 숫자 칸 전체(후기수·재시술%·만족도·통증·조회·저장·공유·생성일).
 *     /admin/cards SortTh 관례와 동일하게 첫 클릭 내림차순 → 재클릭 오름차순.
 *     61행 규모라 서버 왕복 없이 클라 정렬(useState). 정렬 활성 시 카테고리 그룹을 풀어
 *     플랫 목록으로 전환(그룹 유지한 채 그룹 내 정렬은 혼란) — 같은 칸 3번째 클릭
 *     또는 '기본 순서' 버튼으로 원래 카테고리 그룹 복귀.
 *   - 신규 데이터(sat_dist·downtime_dist·effect_top·anchor_created_at)는 RPC 마이그 적용 전
 *     빈 배열/null 로 내려오므로(page.tsx 정규화) 전부 '—' 폴백 — 페이지가 죽지 않는다.
 *
 * 격리: 내부 링크는 모두 /reports/* (공개 리포트) — 앱 셸 라우트 미사용.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import { DOWNTIME_OPTIONS } from "@/lib/review-options";
import { formatYmd } from "@/lib/format-date";

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
  // page.tsx 가 Number(?? 0) 로 정규화해 내려주므로 null 없음(검수 반영: 타입-정규화 일치).
  view_count: number;
  save_count: number;
  share_count: number;
  /** 앵커 카드 생성일 — RPC 마이그 적용 전엔 null (page.tsx 폴백). */
  anchor_created_at: string | null;
  /** 만족도 분포 [5점,4점,3점,2점,1점] 5칸 — 마이그 전·응답 없음이면 빈 배열/0들. */
  sat_dist: number[];
  /** 다운타임 분포 — DOWNTIME_OPTIONS 순서 5칸 (SSOT: lib/review-options.ts). */
  downtime_dist: number[];
  /** 효과 상위 3개 [{label,n}] 내림차순 — '없음' 제외(RPC 책임). */
  effect_top: { label: string; n: number }[];
};

type Props = {
  groups: { category: string; rows: ReviewOverviewRow[] }[];
  rowCount: number;
  errorMessage: string | null;
};

// 카테고리 표시 라벨 — 알려진 값만 매핑하고 미지정 카테고리는 원문 그대로(자동 반영).
const CATEGORY_LABEL: Record<string, string> = {
  lifting: "리프팅",
  skinbooster: "스킨부스터",
  filler: "필러·볼륨",
  contour: "주름·윤곽",
  laser: "레이저",
  other: "기타",
};

function revisitPct(yes: number, maybe: number, no: number): number {
  const total = yes + maybe + no;
  return total > 0 ? Math.round((yes / total) * 100) : 0;
}

function fmtAvg(v: number | null): string {
  return v == null ? "—" : Number(v).toFixed(1);
}

/**
 * 다운타임 최빈값 라벨 — dist 는 DOWNTIME_OPTIONS 순(짧은 순) 정렬이므로
 * strict `>` 갱신이 동률 시 자동으로 앞 인덱스(더 짧은 쪽)를 유지한다(원장 확정 규칙).
 * 응답 0(전부 NULL)이면 '—'.
 */
function downtimeModeLabel(dist: number[]): string {
  const total = dist.reduce((a, b) => a + b, 0);
  if (total === 0) return "—";
  let best = 0;
  for (let i = 1; i < dist.length; i++) if (dist[i] > dist[best]) best = i;
  return DOWNTIME_OPTIONS[best]?.label ?? "—";
}

// 정렬 가능한 숫자 칸 키 — 후기수·재시술%·만족도·통증·조회·저장·공유·생성일(원장 확정).
type SortKey =
  | "review"
  | "revisit"
  | "sat"
  | "pain"
  | "view"
  | "save"
  | "share"
  | "created";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/** 정렬 비교값 — null 은 '응답/데이터 없음'으로 방향과 무관하게 항상 뒤로 보낸다. */
function sortValue(r: ReviewOverviewRow, key: SortKey): number | null {
  switch (key) {
    case "review":
      return r.review_count;
    case "revisit":
      return revisitPct(r.revisit_yes, r.revisit_maybe, r.revisit_no);
    case "sat":
      return r.sat_avg;
    case "pain":
      return r.pain_avg;
    case "view":
      return r.view_count ?? 0;
    case "save":
      return r.save_count ?? 0;
    case "share":
      return r.share_count ?? 0;
    case "created": {
      if (!r.anchor_created_at) return null;
      const t = Date.parse(r.anchor_created_at);
      return Number.isNaN(t) ? null : t;
    }
  }
}

// grid 컬럼: 시술명 | 후기수 | 재시술% | 만족도(평균+분포바) | 통증 | 다운타임 | 효과 | 조회 | 저장 | 공유 | 생성일
// 기본 데스크탑(1280px)에서 가로 스크롤 없이 들어가도록 min 폭 절제 — min 합계 ≈ 752px,
//   래퍼는 min-w-[800px] + overflow-x-auto(좁은 창 대비). (검수 반영: 수치 주석 정정)
const GRID =
  "grid grid-cols-[minmax(6.5rem,1.5fr)_minmax(3rem,0.6fr)_minmax(3.4rem,0.7fr)_minmax(5.5rem,0.9fr)_minmax(2.6rem,0.5fr)_minmax(3.6rem,0.7fr)_minmax(6rem,1.4fr)_minmax(2.6rem,0.5fr)_minmax(2.6rem,0.5fr)_minmax(2.6rem,0.5fr)_minmax(3.6rem,0.6fr)] gap-x-2";

// 만족도 미니 분포바 5점→1점(좌→우) 농도 단계 — 별도 팔레트 없이 앱 파랑 토큰의 opacity 로 구분.
const SAT_BAR_OPACITY = [1, 0.75, 0.55, 0.35, 0.18];

/** 만족도 칸 — 평균 숫자 + 아래 폭 48px 미니 분포바(응답 없으면 바 생략). 상세 수치는 title 툴팁. */
function SatCell({ avg, dist }: { avg: number | null; dist: number[] }) {
  const total = dist.reduce((a, b) => a + b, 0);
  const title =
    total > 0 ? dist.map((n, i) => `${5 - i}점 ${n}`).join(" · ") : undefined;
  return (
    <div className="flex flex-col items-end gap-[3px] text-right" title={title}>
      <span className="tabular-nums" style={{ color: "var(--ink-700)" }}>
        {fmtAvg(avg)}
      </span>
      {total > 0 && (
        <span
          className="flex overflow-hidden"
          style={{
            width: 48,
            height: 4,
            borderRadius: 2,
            background: "var(--tt-blue-tint)",
          }}
        >
          {dist.map((n, i) => (
            <span
              key={i}
              style={{
                flex: `${n} 1 0%`,
                background: "var(--tt-blue-deep)",
                opacity: SAT_BAR_OPACITY[i] ?? 0.18,
              }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

export default function AdminReviewReportsView({
  groups,
  rowCount,
  errorMessage,
}: Props) {
  const search = useSearchRouting();
  const [sort, setSort] = useState<SortState>(null);

  // /admin/cards SortTh(desc↔asc 2단계 토글)에 "3번째 클릭 해제"를 더한 3단계 —
  //   이 표는 기본 상태가 '카테고리 그룹'이라 그룹 복귀용 해제 단계가 필요(검수 반영: 비교 문구 정정).
  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  // 정렬 활성 시 카테고리 그룹을 풀어 전체 플랫 정렬(그룹 내 정렬은 혼란 — 원장 확정).
  const sortedRows = useMemo(() => {
    if (!sort) return null;
    const all = groups.flatMap((g) => g.rows);
    const dirMul = sort.dir === "desc" ? -1 : 1;
    return [...all].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dirMul;
    });
  }, [groups, sort]);

  /** 정렬 가능한 헤더 칸 — 행(Link)과 이벤트가 충돌하지 않도록 헤더에만 버튼을 둔다. */
  function HeadCell({
    col,
    label,
    align = "right",
  }: {
    col: SortKey;
    label: string;
    align?: "left" | "right";
  }) {
    const active = sort !== null && sort.key === col;
    const arrow = active ? (sort?.dir === "desc" ? "↓" : "↑") : "";
    return (
      <div className={align === "right" ? "text-right" : "text-left"}>
        <button
          type="button"
          aria-label={`${label} 정렬${active ? (sort?.dir === "desc" ? " (내림차순)" : " (오름차순)") : ""}`}
          onClick={() => toggleSort(col)}
          className="inline-flex cursor-pointer items-center whitespace-nowrap"
          style={{
            font: "inherit",
            color: active ? "var(--tt-blue-deep)" : "inherit",
            background: "none",
            border: 0,
            padding: 0,
          }}
        >
          {label}
          <span style={{ width: 10, fontSize: 10 }}>{arrow}</span>
        </button>
      </div>
    );
  }

  /** 시술 행 — 그룹 모드·플랫(정렬) 모드가 동일 렌더 공유. 전체 클릭 → /reports/{en}. */
  function renderRow(r: ReviewOverviewRow) {
    const pct = revisitPct(r.revisit_yes, r.revisit_maybe, r.revisit_no);
    const effectLabels = r.effect_top.map((e) => e.label).join("·");
    const effectTitle = r.effect_top.map((e) => `${e.label} ${e.n}`).join(" · ");
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
        <SatCell avg={r.sat_avg} dist={r.sat_dist} />
        <div
          className="text-right tabular-nums"
          style={{ color: "var(--ink-700)" }}
        >
          {fmtAvg(r.pain_avg)}
        </div>
        <div
          className="text-right whitespace-nowrap"
          style={{ color: "var(--ink-700)" }}
        >
          {downtimeModeLabel(r.downtime_dist)}
        </div>
        <div
          className="truncate text-left"
          style={{ color: "var(--ink-700)" }}
          title={effectTitle || undefined}
        >
          {effectLabels || "—"}
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
        <div
          className="text-right tabular-nums whitespace-nowrap"
          style={{ fontSize: 12, color: "var(--ink-300)" }}
        >
          {r.anchor_created_at ? formatYmd(r.anchor_created_at) : "—"}
        </div>
      </>
    );
    return r.en ? (
      <Link
        key={r.en ?? r.ko}
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
        key={r.en ?? r.ko}
        className={GRID + " items-center border-b px-3 py-2 text-sm"}
        style={{ borderColor: "var(--line)" }}
      >
        {inner}
      </div>
    );
  }

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
          리포트로 이동 · 헤더 클릭 시 정렬
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
        <>
          {/* 정렬 활성 시에만 노출 — 카테고리 그룹(기본 순서) 복귀 버튼. */}
          {sort && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSort(null)}
                className="cursor-pointer rounded-[8px] border bg-white px-2.5 py-1 text-xs"
                style={{ borderColor: "var(--line)", color: "var(--ink-500)" }}
              >
                기본 순서
              </button>
            </div>
          )}
          <div
            className="overflow-x-auto rounded-[12px] border bg-white"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="min-w-[800px]">
              {/* 헤더 — 숫자 칸은 클릭 정렬(HeadCell), 텍스트 칸(시술명·다운타임·효과)은 정적. */}
              <div
                className={GRID + " border-b px-3 py-2 text-xs font-medium"}
                style={{
                  borderColor: "var(--line)",
                  background: "var(--tt-blue-tint)",
                  color: "var(--ink-700)",
                }}
              >
                <div className="text-left">시술명</div>
                <HeadCell col="review" label="후기수" />
                <HeadCell col="revisit" label="재시술의향" />
                <HeadCell col="sat" label="만족도" />
                <HeadCell col="pain" label="통증" />
                <div className="text-right whitespace-nowrap">다운타임</div>
                <div className="text-left whitespace-nowrap">효과</div>
                <HeadCell col="view" label="조회" />
                <HeadCell col="save" label="저장" />
                <HeadCell col="share" label="공유" />
                <HeadCell col="created" label="생성일" />
              </div>

              {sortedRows ? (
                // 정렬 모드 — 카테고리 그룹 헤더 숨기고 전체 플랫 목록.
                sortedRows.map((r) => renderRow(r))
              ) : (
                groups.map((g) => (
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
                    {g.rows.map((r) => renderRow(r))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
