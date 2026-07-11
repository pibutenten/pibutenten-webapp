"use client";

/**
 * SearchConsolePanel — 구글 서치콘솔 상위 유입 검색어 위젯 (admin 대시보드).
 *
 * "무슨 검색어로 우리를 찾았는지"는 구글 Search Analytics API 만이 제공한다(§유입 분석·§search-console).
 * 자격증명(서비스 계정) 미설정이면 설정 안내를 노출. 네이버는 검색어 API 미공개라 여기 없음(콘솔 확인).
 */

import { useState } from "react";
import type { ScRow } from "@/lib/traffic-types";

const PERIODS: { d: number; label: string }[] = [
  { d: 7, label: "7일" },
  { d: 28, label: "28일" },
  { d: 90, label: "90일" },
];

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0, border: "1px solid var(--line)", borderRadius: 14, background: "#fff", padding: 14, overflow: "hidden" }}>
      {children}
    </div>
  );
}

export default function SearchConsolePanel({
  configured,
  dataByDays,
  error,
}: {
  configured: boolean;
  dataByDays: Record<number, ScRow[]>;
  error: string | null;
}) {
  const [days, setDays] = useState(28);
  const rows = dataByDays[days] ?? [];

  const chip = (active: boolean): React.CSSProperties => ({
    borderRadius: 999,
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid " + (active ? "transparent" : "var(--line)"),
    background: active ? "var(--tt-blue)" : "#fff",
    color: active ? "#fff" : "var(--ink-500)",
  });

  // 미설정 — 서비스 계정 자격증명이 없을 때 설정 안내.
  if (!configured) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.7 }}>
          <b>구글 검색어 연동이 아직 설정되지 않았습니다.</b>
          <br />
          아래를 마치면 이 자리에 상위 유입 검색어(클릭·노출·CTR·순위)가 자동으로 표시됩니다.
          <ol style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--ink-500)" }}>
            <li>Google Cloud → 서비스 계정 생성 + <b>Search Console API</b> 사용 설정 → JSON 키 발급</li>
            <li>구글 서치콘솔 → 설정 → 사용자·권한 → 그 서비스 계정 이메일을 <b>추가</b>(전체/제한)</li>
            <li>Vercel 환경변수에 <code>GOOGLE_SC_SA_EMAIL</code> · <code>GOOGLE_SC_SA_PRIVATE_KEY</code> · <code>GOOGLE_SC_SITE_URL</code> 저장 후 재배포</li>
          </ol>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map((p) => (
            <button key={p.d} type="button" onClick={() => setDays(p.d)} style={chip(days === p.d)}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-300)" }}>구글 서치콘솔 · 2~3일 지연</div>
      </div>

      {error ? (
        <Card>
          <div style={{ fontSize: 12.5, color: "#c0392b", lineHeight: 1.6 }}>
            조회 오류: {error}
            <div style={{ color: "var(--ink-500)", marginTop: 4 }}>
              서비스 계정이 서치콘솔 사용자로 추가됐는지, 속성 URL(<code>GOOGLE_SC_SITE_URL</code>)이 맞는지 확인해 주세요.
            </div>
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
            아직 데이터가 없습니다(연동 직후이거나 해당 기간 노출 없음). 며칠 뒤 다시 확인해 주세요.
          </div>
        </Card>
      ) : (
        <Card>
          {/* 표 헤더 */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11, fontWeight: 700, color: "var(--ink-500)", padding: "0 2px 8px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>검색어</div>
            <div style={{ width: 48, textAlign: "right" }}>클릭</div>
            <div style={{ width: 56, textAlign: "right" }}>노출</div>
            <div style={{ width: 52, textAlign: "right" }}>CTR</div>
            <div style={{ width: 52, textAlign: "right" }}>순위</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-900)", fontWeight: 500 }}>
                  {r.query}
                </div>
                <div style={{ width: 48, textAlign: "right", color: "var(--ink-900)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.clicks.toLocaleString()}</div>
                <div style={{ width: 56, textAlign: "right", color: "var(--ink-500)", fontVariantNumeric: "tabular-nums" }}>{r.impressions.toLocaleString()}</div>
                <div style={{ width: 52, textAlign: "right", color: "var(--ink-500)", fontVariantNumeric: "tabular-nums" }}>{(r.ctr * 100).toFixed(1)}%</div>
                <div style={{ width: 52, textAlign: "right", color: "var(--ink-500)", fontVariantNumeric: "tabular-nums" }}>{r.position.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
