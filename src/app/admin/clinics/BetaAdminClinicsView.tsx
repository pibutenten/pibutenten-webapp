"use client";

/**
 * BetaAdminClinicsView — /admin/clinics "병원 정보 동기화" 본문 (베타 셸 래퍼).
 *
 * 원칙(Phase 3 ②): 상단 바·배경만 베타 셸(BetaSkinShell)로 통일하고,
 *   본문 골격(상단 요약 Stat + 가져오기 버튼 + 검색 + 목록 테이블 + 페이지네이션)은 그대로 유지하되
 *   radius·color 토큰만 베타 톤(var(--ink-*)·var(--tt-blue*)·var(--line))으로 재조정.
 *   - 데이터(병원 목록·카운트·페이지 계산)·가드는 서버 page.tsx 가 담당하고 props 로 내려준다.
 *   - SyncButton(운영 클라 컴포넌트)은 로직 무수정 import 임베드.
 *   - 검색 form·페이지 링크는 모두 /admin/clinics (베타 라우트 미사용).
 *
 * 격리: 운영 SyncButton 무수정.
 */

import Link from "next/link";
import BetaSkinShell from "@/app/beta-skin/BetaSkinShell";
import { useBetaSearchRouting } from "@/app/beta-skin/beta-ui";
import { formatYmd } from "@/lib/format-date";
import SyncButton from "./SyncButton";

export type BetaClinicRow = {
  id: number;
  name: string;
  addr: string | null;
  tel: string | null;
  clinic_type: string | null;
  synced_at: string | null;
};

type Props = {
  clinics: BetaClinicRow[];
  total: number;
  totalCount: number;
  totalPages: number;
  page: number;
  pageNums: number[];
  rangeStart: number;
  rangeEnd: number;
  lastSynced: string | null;
  q: string;
};

export default function BetaAdminClinicsView({
  clinics,
  total,
  totalCount,
  totalPages,
  page,
  pageNums,
  rangeStart,
  rangeEnd,
  lastSynced,
  q,
}: Props) {
  const search = useBetaSearchRouting();
  const hrefFor = (p: number) =>
    `/admin/clinics?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`;

  return (
    <BetaSkinShell active="마이" wide back="/admin" {...search}>
      {/* 제목 + noindex 설명 (베타 톤) */}
      <div style={{ marginBottom: 20, paddingLeft: 4 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--ink-900)",
            margin: 0,
          }}
        >
          병원 정보 동기화
        </h1>
        <p style={{ marginTop: 4, fontSize: 12, color: "var(--ink-500)" }}>
          건강보험심사평가원 병원정보서비스 기반 피부과 의원 참조 데이터 (영구
          noindex)
        </p>
      </div>

      {/* 상단 요약 + 가져오기 버튼 */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Stat label="총 등록 병원" value={(total ?? 0).toLocaleString()} />
          <Stat
            label="최근 동기화"
            value={lastSynced ? formatYmd(lastSynced) : "없음"}
          />
        </div>
        <div
          className="rounded-[12px] border bg-white p-4"
          style={{ borderColor: "var(--line)" }}
        >
          <SyncButton />
        </div>
      </div>

      {/* 검색 */}
      <form
        action="/admin/clinics"
        method="get"
        className="mb-3 flex items-center gap-2"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="병원명 검색 (예: 서울피부)"
          className="h-9 flex-1 min-w-[180px] rounded-[10px] border px-3 text-sm"
          style={{ borderColor: "var(--line)", color: "var(--ink-900)" }}
        />
        <button
          type="submit"
          className="h-9 rounded-[10px] px-4 text-sm font-medium text-white"
          style={{ background: "var(--tt-blue-deep)" }}
        >
          검색
        </button>
      </form>

      <p className="mb-2 text-xs" style={{ color: "var(--ink-500)" }}>
        {q ? `"${q}" 검색 결과 ` : ""}
        전체 {totalCount.toLocaleString()}곳 중 {rangeStart.toLocaleString()}–
        {rangeEnd.toLocaleString()}곳 표시
        {totalPages > 1 ? ` · ${page} / ${totalPages} 페이지` : ""}
      </p>

      {/* 목록 테이블 */}
      <div
        className="overflow-x-auto rounded-[12px] border"
        style={{ borderColor: "var(--line)" }}
      >
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr
              className="border-b text-left text-xs"
              style={{
                borderColor: "var(--line)",
                background: "var(--tt-blue-tint)",
                color: "var(--ink-700)",
              }}
            >
              <th className="px-3 py-2 font-medium">이름</th>
              <th className="px-3 py-2 font-medium">주소</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">전화</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">종별</th>
            </tr>
          </thead>
          <tbody>
            {clinics.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center"
                  style={{ color: "var(--ink-500)" }}
                >
                  {q
                    ? "검색 결과가 없습니다."
                    : "등록된 병원이 없습니다. '병원 정보 가져오기'로 동기화하세요."}
                </td>
              </tr>
            ) : (
              clinics.map((c) => (
                <tr
                  key={c.id}
                  className="border-b last:border-0 hover:bg-[var(--tt-blue-tint)]"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td
                    className="px-3 py-2 font-medium"
                    style={{ color: "var(--ink-900)" }}
                  >
                    {c.name}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--ink-700)" }}>
                    {c.addr ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2 whitespace-nowrap"
                    style={{ color: "var(--ink-700)" }}
                  >
                    {c.tel ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2 whitespace-nowrap"
                    style={{ color: "var(--ink-500)" }}
                  >
                    {c.clinic_type ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 — 이전 / 번호 / 다음 */}
      {totalPages > 1 && (
        <nav
          className="mt-4 flex items-center justify-center gap-1"
          aria-label="페이지 이동"
        >
          <PageLink href={hrefFor(page - 1)} disabled={page <= 1} label="이전">
            ‹
          </PageLink>
          {pageNums[0] > 1 && (
            <>
              <PageLink href={hrefFor(1)}>1</PageLink>
              {pageNums[0] > 2 && (
                <span className="px-1" style={{ color: "var(--ink-500)" }}>
                  …
                </span>
              )}
            </>
          )}
          {pageNums.map((p) => (
            <PageLink key={p} href={hrefFor(p)} current={p === page}>
              {p}
            </PageLink>
          ))}
          {pageNums[pageNums.length - 1] < totalPages && (
            <>
              {pageNums[pageNums.length - 1] < totalPages - 1 && (
                <span className="px-1" style={{ color: "var(--ink-500)" }}>
                  …
                </span>
              )}
              <PageLink href={hrefFor(totalPages)}>{totalPages}</PageLink>
            </>
          )}
          <PageLink
            href={hrefFor(page + 1)}
            disabled={page >= totalPages}
            label="다음"
          >
            ›
          </PageLink>
        </nav>
      )}
    </BetaSkinShell>
  );
}

function PageLink({
  href,
  children,
  current = false,
  disabled = false,
  label,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const base =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-[10px] border px-3 text-sm font-medium transition-colors";
  if (disabled) {
    return (
      <span
        aria-disabled
        className={`${base} cursor-not-allowed opacity-50`}
        style={{ borderColor: "var(--line)", color: "var(--ink-500)" }}
      >
        {children}
      </span>
    );
  }
  if (current) {
    return (
      <span
        aria-current="page"
        className={base}
        style={{
          borderColor: "var(--tt-blue-deep)",
          background: "var(--tt-blue-deep)",
          color: "#fff",
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${base} bg-white hover:border-[var(--tt-blue-soft)] hover:text-[var(--tt-blue-deep)]`}
      style={{ borderColor: "var(--line)", color: "var(--ink-700)" }}
    >
      {children}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="overflow-hidden rounded-[12px] border bg-white p-3"
      style={{ borderColor: "var(--line)" }}
    >
      <div
        className="whitespace-nowrap text-[11px] leading-tight"
        style={{ color: "var(--ink-500)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 whitespace-nowrap text-xl font-bold tabular-nums sm:text-2xl"
        style={{ color: "var(--ink-900)" }}
      >
        {value}
      </div>
    </div>
  );
}
