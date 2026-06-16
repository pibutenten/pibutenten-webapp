"use client";

/**
 * AdminTagsView — /admin/tags 의 앱 스킨 셸 래퍼 (클라이언트).
 *
 * 원칙(Agent 5):
 *   - 상단바·배경만 AppShell 로 교체. 본문(요약 탭 + 분류/상태/기간 칩 + 검색폼 + TagAdminTable + 페이지네이션)은 운영 구조 유지.
 *   - 운영 클라 컴포넌트 TagAdminTable 은 로직 변경 없이 import 해서 그대로 임베드.
 *   - 데이터 fetch·필터·정렬·페이지네이션 계산은 server page.tsx 가 담당. 이 뷰는 계산된 값만 props 로 받아 렌더.
 *   - 색/라운드 토큰만 운영 클래스 그대로 둠(운영 토큰은 앱 스킨 .root 스코프에서도 정의됨) + 제목·칩 등은 운영 유틸 클래스 유지.
 *   - import 절대경로(@/appapp skin), 모든 링크 /admin/tags (qs 헬퍼가 /admin/tags 로 생성).
 */

import Link from "next/link";
import AppShell from "@/components/skin/AppShell";
import { useSearchRouting } from "@/components/skin/ui";
import styles from "@/components/skin/app.module.css";
import TagAdminTable, { type TagRow } from "./TagAdminTable";

const CATEGORIES = ["피부고민", "리프팅", "스킨부스터", "홈케어", "피부상식", "미지정"] as const;
const PERIODS: { label: string; days: number }[] = [
  { label: "24시간", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "90일", days: 90 },
  { label: "1년", days: 365 },
  { label: "전체", days: 0 },
];

type SortCol =
  | "usage"
  | "search"
  | "created"
  | "onb_name"
  | "parent_name"
  | "ko_name"
  | "cat_name"
  | "en_name";

// 칩 — 운영 /admin/tags 와 1:1 동일 클래스(앱 스킨 .root 스코프에 운영 토큰도 정의됨).
const chipGroup =
  "inline-flex flex-wrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-0.5";
function chipCls(active: boolean) {
  return (
    "rounded-[var(--radius-sm)] px-3 py-1 text-xs transition-colors " +
    (active
      ? "font-semibold text-[var(--text)]"
      : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
  );
}
const chipStyle = (active: boolean) =>
  active ? { backgroundColor: "var(--chip-active-bg)" } : undefined;

// qs — 운영 page.tsx 와 동일. 항상 /admin/tags 경로로 생성(앱 셸 경로 미사용).
function qs(
  base: Record<string, string | undefined>,
  override: Record<string, string | undefined>,
) {
  const merged = { ...base, ...override };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "" && v !== null) p.set(k, v);
  }
  const s = p.toString();
  return s ? `/admin/tags?${s}` : "/admin/tags";
}

type Props = {
  // 요약 카운트
  total: number;
  classified: number;
  enBlank: number;
  procCount: number;
  parentCount: number;
  unspecUnreviewed: number;
  catCounts: Record<string, number>;
  // 필터 상태
  cat: string;
  status: string;
  q: string;
  days: number;
  inclReviewed: boolean;
  sortCol: SortCol;
  sortDir: "asc" | "desc";
  // qs base (원본 searchParams 값 — 운영 동일)
  base: Record<string, string | undefined>;
  rawSp: {
    cat?: string;
    status?: string;
    days?: string;
    sort?: string;
    dir?: string;
    rv?: string;
  };
  // 페이지네이션
  page: number;
  totalPages: number;
  // 표 데이터
  pageRows: TagRow[];
  allKo: string[];
  usageByKo: Record<string, number>;
};

export default function AdminTagsView({
  total,
  classified,
  enBlank,
  procCount,
  parentCount,
  unspecUnreviewed,
  catCounts,
  cat,
  status,
  q,
  days,
  inclReviewed,
  sortCol,
  sortDir,
  base,
  rawSp,
  page,
  totalPages,
  pageRows,
  allKo,
  usageByKo,
}: Props) {
  const search = useSearchRouting();

  return (
    <AppShell active="마이" wide back="/admin" {...search}>
      <div className={styles.mb20}>
        <h1 className={styles.profileName}>태그 관리</h1>
      </div>

      {/* 요약 — 상단 탭형. 클릭 = 해당 조건 필터. */}
      <div className="mb-3 flex gap-0 border-b border-[var(--border)] overflow-x-auto sm:gap-1 [&::-webkit-scrollbar]:hidden">
        {(
          [
            { label: "전체", v: total, status: undefined },
            { label: "분류완료", v: classified, status: "classified" },
            { label: "영문 공란", v: enBlank, status: "en_blank" },
            { label: "시술 후기", v: procCount, status: "proc" },
            { label: "부모 태그", v: parentCount, status: "parent" },
            { label: "미검토", v: unspecUnreviewed, status: "triage" },
          ] as const
        ).map((s) => {
          const active = cat === "all" && status === (s.status ?? "all");
          return (
            <Link
              replace
              scroll={false}
              key={s.label}
              href={qs(base, {
                cat: undefined,
                status: s.status,
                sort: undefined,
                dir: undefined,
                page: undefined,
              })}
              className={
                "relative shrink-0 px-2 py-1.5 text-center text-[12px] transition-colors sm:px-3 sm:py-2 sm:text-sm " +
                (active
                  ? "font-semibold text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text)]")
              }
            >
              <div className="whitespace-nowrap leading-tight">{s.label}</div>
              <div className="text-[10px] text-[var(--text-muted)] sm:ml-1 sm:inline sm:align-middle sm:text-xs">
                {s.v.toLocaleString()}
              </div>
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[var(--primary)]" />
              )}
            </Link>
          );
        })}
      </div>

      {/* 분류 탭 — 단일선택 배타 + 활성 재클릭 시 해제(전체). */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <div className={chipGroup}>
          <Link
            replace
            scroll={false}
            href={qs(base, { cat: undefined, page: undefined })}
            className={chipCls(cat === "all")}
            style={chipStyle(cat === "all")}
          >
            전체{" "}
            <span className="text-[10px] opacity-70">
              {catCounts.all.toLocaleString()}
            </span>
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              replace
              scroll={false}
              key={c}
              href={qs(base, { cat: cat === c ? undefined : c, page: undefined })}
              className={chipCls(cat === c)}
              style={chipStyle(cat === c)}
            >
              {c}{" "}
              <span className="text-[10px] opacity-70">
                {(catCounts[c] ?? 0).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* 상태 칩(좌) + 기간 칩(우). */}
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">상태</span>
          <div className={chipGroup}>
            <Link
              replace
              scroll={false}
              href={qs(base, {
                status: undefined,
                sort: undefined,
                dir: undefined,
                page: undefined,
              })}
              className={chipCls(status === "all")}
              style={chipStyle(status === "all")}
            >
              전체
            </Link>
            {(
              [
                ["en_blank", "영문 공란"],
                ["unspec", "미지정"],
                ["proc", "시술 후기"],
                ["onb", "온보딩"],
                ["eng", "영문 태그"],
                ["triage", "검토"],
              ] as const
            ).map(([key, label]) => {
              const active = status === key;
              const href = active
                ? qs(base, {
                    status: undefined,
                    sort: undefined,
                    dir: undefined,
                    page: undefined,
                  })
                : qs(base, {
                    status: key,
                    sort: undefined,
                    dir: undefined,
                    page: undefined,
                  });
              return (
                <Link
                  replace
                  scroll={false}
                  key={key}
                  href={href}
                  className={chipCls(active)}
                  style={chipStyle(active)}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          <span className="text-[11px] text-[var(--text-muted)]">기간</span>
          <div className={chipGroup}>
            {PERIODS.map((p) => (
              <Link
                replace
                scroll={false}
                key={p.days}
                href={qs(base, {
                  days: p.days === 0 ? undefined : String(p.days),
                  page: undefined,
                })}
                className={chipCls(days === p.days)}
                style={chipStyle(days === p.days)}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 검색 (+ 검토 탭이면 검토완료 포함 보기 토글) */}
      <form
        action="/admin/tags"
        method="get"
        className="mb-3 flex items-center gap-2"
      >
        {rawSp.cat ? <input type="hidden" name="cat" value={rawSp.cat} /> : null}
        {rawSp.status ? (
          <input type="hidden" name="status" value={rawSp.status} />
        ) : null}
        {rawSp.days ? (
          <input type="hidden" name="days" value={rawSp.days} />
        ) : null}
        {rawSp.sort ? (
          <input type="hidden" name="sort" value={rawSp.sort} />
        ) : null}
        {rawSp.dir ? <input type="hidden" name="dir" value={rawSp.dir} /> : null}
        {rawSp.rv ? <input type="hidden" name="rv" value={rawSp.rv} /> : null}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="태그(한글) 검색"
          className="h-9 flex-1 min-w-[180px] rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-[var(--radius-sm)] bg-[var(--primary)] px-4 text-sm font-medium text-white hover:bg-[var(--primary-dark)]"
        >
          검색
        </button>
        {status === "triage" && (
          <Link
            replace
            scroll={false}
            href={qs(base, {
              rv: inclReviewed ? undefined : "all",
              page: undefined,
            })}
            className="h-9 inline-flex items-center whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
          >
            {inclReviewed ? "미검토만 보기" : "검토완료 포함 보기"}
          </Link>
        )}
      </form>

      <TagAdminTable
        rows={pageRows}
        allKo={allKo}
        usageByKo={usageByKo}
        sort={sortCol}
        dir={sortDir}
        status={status}
      />

      {/* 페이지네이션 */}
      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-center gap-1 text-sm">
          <Link
            replace
            scroll={false}
            href={qs(base, { page: page > 1 ? String(page - 1) : undefined })}
            aria-disabled={page <= 1}
            className={
              "rounded border border-[var(--border)] px-3 py-1 " +
              (page <= 1
                ? "pointer-events-none opacity-40"
                : "hover:border-[var(--primary)]")
            }
          >
            이전
          </Link>
          <span className="px-3 py-1 text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          <Link
            replace
            scroll={false}
            href={qs(base, {
              page: page < totalPages ? String(page + 1) : undefined,
            })}
            aria-disabled={page >= totalPages}
            className={
              "rounded border border-[var(--border)] px-3 py-1 " +
              (page >= totalPages
                ? "pointer-events-none opacity-40"
                : "hover:border-[var(--primary)]")
            }
          >
            다음
          </Link>
        </nav>
      ) : null}
    </AppShell>
  );
}
